#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for Kibana functional tests.
#
# On kibana-ubuntu-2404 agents, host→container networking is restricted:
#   - --network host  → blocked (user namespace remapping is enabled)
#   - --publish ports → broken (nftables replaces iptables, Docker NAT doesn't work)
#   - direct bridge IP → not routed to host
#
# Solution: mirror Kibana's approach of running ES natively by putting all
# connectivity inside Docker. Health checks and tests run in a dedicated
# test-runner container on the same network as ES and Kibana, using Docker
# DNS aliases (elasticsearch:9200, kibana:5601) which always work for
# inter-container communication.

set -euo pipefail

STACK_VERSION="${STACK_VERSION:-9.3.0}"
ES_CONTAINER_NAME="elastic-cli-kb-es"
KB_CONTAINER_NAME="elastic-cli-kb"
TEST_RUNNER_NAME="elastic-cli-kb-runner"
NETWORK_NAME="elastic-cli-kb-net"
NODE_RUNNER_IMAGE="node:${NODE_VERSION}-bookworm-slim"

cleanup() {
  echo "--- Cleaning up"
  docker rm -f "$TEST_RUNNER_NAME" 2>/dev/null || true
  docker rm -f "$KB_CONTAINER_NAME" 2>/dev/null || true
  docker rm -f "$ES_CONTAINER_NAME" 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# Use fixed dummy values so the CLI config can reference them without secrets management.
ES_PASSWORD="changeme"
KIBANA_ENCRYPTION_KEY="xP9mfMqnRrNHmSmzPoBtLQvLFzYdHxKj" # gitleaks:allow

ES_IMAGE="docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION}"
KB_IMAGE="docker.elastic.co/kibana/kibana:${STACK_VERSION}"

# ── Docker setup ────────────────────────────────────────────────────────────
# Start all containers as early as possible so they boot while the CLI builds.

echo "--- Creating Docker network"
docker network create "$NETWORK_NAME" 2>/dev/null || true

# Use the pre-cached ES snapshot on kibana-ubuntu-2404 agents if available,
# otherwise fall back to a registry pull.
echo "--- Loading Elasticsearch image"
ES_CACHE_DIR="${ES_CACHE_DIR:-}"
if [[ -n "$ES_CACHE_DIR" ]] && compgen -G "$ES_CACHE_DIR/elasticsearch-$STACK_VERSION*.tar.gz" > /dev/null 2>&1; then
  echo "  Loading from agent cache: $ES_CACHE_DIR"
  docker load < "$(ls "$ES_CACHE_DIR/elasticsearch-$STACK_VERSION"*.tar.gz | head -1)"
else
  docker pull "$ES_IMAGE"
fi

echo "--- Loading Kibana image"
docker pull "$KB_IMAGE"

# Pull the test-runner image in the background while ES/Kibana boot and the
# CLI builds — it's only needed at the very end.
echo "--- Pulling test-runner image (background)"
docker pull "$NODE_RUNNER_IMAGE" &
NODE_PULL_PID=$!

echo "--- Starting Elasticsearch ${STACK_VERSION} (background)"
docker run \
  --name "$ES_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --network-alias elasticsearch \
  --env "discovery.type=single-node" \
  --env "xpack.license.self_generated.type=trial" \
  --env "action.destructive_requires_name=false" \
  --env "ELASTIC_PASSWORD=${ES_PASSWORD}" \
  --env "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  --detach \
  --rm \
  "$ES_IMAGE"

echo "--- Starting Kibana ${STACK_VERSION} (background)"
docker run \
  --name "$KB_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --network-alias kibana \
  --env "ELASTICSEARCH_HOSTS=http://elasticsearch:9200" \
  --env "ELASTICSEARCH_USERNAME=elastic" \
  --env "ELASTICSEARCH_PASSWORD=${ES_PASSWORD}" \
  --env "xpack.encryptedSavedObjects.encryptionKey=${KIBANA_ENCRYPTION_KEY}" \
  --env "xpack.reporting.encryptionKey=${KIBANA_ENCRYPTION_KEY}" \
  --env "xpack.security.encryptionKey=${KIBANA_ENCRYPTION_KEY}" \
  --detach \
  --rm \
  "$KB_IMAGE"

# ── Build CLI (concurrent with container startup + test-runner image pull) ──

echo "--- Setting up Node.js ${NODE_VERSION}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found, installing..."
  mkdir -p "$NVM_DIR"
  NVM_VERSION=$(curl -s https://api.github.com/repos/nvm-sh/nvm/releases/latest | jq -r '.tag_name // "v0.39.7"')
  echo "Installing nvm ${NVM_VERSION}"
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

echo "--- Installing jq 1.7.1"
JQ_VERSION="1.7.1"
if ! jq --version 2>/dev/null | grep -q "$JQ_VERSION"; then
  mkdir -p "$HOME/.local/bin"
  curl -sfL "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-amd64" -o "$HOME/.local/bin/jq"
  chmod +x "$HOME/.local/bin/jq"
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "Using jq $(jq --version)"

echo "--- Installing dependencies"
npm ci

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=6144"

echo "--- Building CLI"
npm run build

echo "--- Waiting for test-runner image pull to finish"
wait "$NODE_PULL_PID"

# ── Run health checks and tests inside the Docker network ───────────────────
# The test-runner container has access to ES and Kibana via Docker DNS aliases.
# The workspace (including the built CLI at dist/cli.js) is mounted read-only.

echo "--- Running tests inside Docker network"
docker run \
  --name "$TEST_RUNNER_NAME" \
  --network "$NETWORK_NAME" \
  --rm \
  --volume "$(pwd):/workspace" \
  --workdir /workspace \
  --env "ES_PASSWORD=${ES_PASSWORD}" \
  "$NODE_RUNNER_IMAGE" \
  bash /workspace/.buildkite/run-kb-tests-runner.sh
