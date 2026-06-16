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
# Solution: health checks and tests run in a dedicated test-runner container on
# the same Docker bridge network as ES and Kibana. Container IPs are fetched via
# docker inspect on the host and passed to the runner in case embedded DNS is
# unavailable (known issue with some rootless/userns Docker configurations).
#
# Startup order:
#   1. Start ES early so it is fully ready before Kibana connects.
#   2. Pull Kibana + test-runner images while the CLI builds.
#   3. Start Kibana only after the build completes (~3 min buffer for ES).
#   4. Run the test-runner container for health checks + tests.

set -euo pipefail

STACK_VERSION="${STACK_VERSION:-9.3.0}"
ES_CONTAINER_NAME="elastic-cli-kb-es"
KB_CONTAINER_NAME="elastic-cli-kb"
TEST_RUNNER_NAME="elastic-cli-kb-runner"
NETWORK_NAME="elastic-cli-kb-net"
NODE_RUNNER_IMAGE="node:${NODE_VERSION}-bookworm-slim"

cleanup() {
  echo "--- ES logs (last 50 lines)"
  if docker inspect "$ES_CONTAINER_NAME" >/dev/null 2>&1; then
    docker logs "$ES_CONTAINER_NAME" 2>&1 | tail -50 || true
  else
    echo "(container never started)"
  fi
  echo "--- Kibana logs (last 50 lines)"
  if docker inspect "$KB_CONTAINER_NAME" >/dev/null 2>&1; then
    docker logs "$KB_CONTAINER_NAME" 2>&1 | tail -50 || true
  else
    echo "(container never started)"
  fi
  echo "--- Cleaning up"
  docker rm -f "$TEST_RUNNER_NAME" "$KB_CONTAINER_NAME" "$ES_CONTAINER_NAME" 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# Use fixed dummy values so the CLI config can reference them without secrets management.
ES_PASSWORD="changeme"
KIBANA_ENCRYPTION_KEY="xP9mfMqnRrNHmSmzPoBtLQvLFzYdHxKj" # gitleaks:allow

ES_IMAGE="docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION}"
KB_IMAGE="docker.elastic.co/kibana/kibana:${STACK_VERSION}"

# ── Docker network ───────────────────────────────────────────────────────────
echo "--- Creating Docker network"
docker network create "$NETWORK_NAME" 2>/dev/null || true

# ── Elasticsearch ────────────────────────────────────────────────────────────
# Start ES as early as possible. It needs ~1-2 minutes to bootstrap the
# security index. Kibana will not start until after the build so ES has
# plenty of time to be fully ready before Kibana connects.

echo "--- Loading Elasticsearch image"
ES_CACHE_DIR="${ES_CACHE_DIR:-}"
if [[ -n "$ES_CACHE_DIR" ]] && compgen -G "$ES_CACHE_DIR/elasticsearch-$STACK_VERSION*.tar.gz" > /dev/null 2>&1; then
  echo "  Loading from agent cache: $ES_CACHE_DIR"
  ES_TARBALLS=("$ES_CACHE_DIR/elasticsearch-$STACK_VERSION"*.tar.gz)
  docker load < "${ES_TARBALLS[0]}"
else
  docker pull "$ES_IMAGE"
fi

echo "--- Starting Elasticsearch ${STACK_VERSION} (background)"
docker run \
  --name "$ES_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --network-alias elasticsearch \
  --env "discovery.type=single-node" \
  --env "xpack.license.self_generated.type=trial" \
  --env "action.destructive_requires_name=false" \
  --env "ELASTIC_PASSWORD=${ES_PASSWORD}" \
  --env "xpack.security.http.ssl.enabled=false" \
  --env "xpack.security.transport.ssl.enabled=false" \
  --env "cluster.routing.allocation.disk.threshold_enabled=false" \
  --env "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  --detach \
  --rm \
  "$ES_IMAGE"

# Pull Kibana and the test-runner images while ES boots and the CLI builds.
echo "--- Pulling Kibana image (background)"
docker pull "$KB_IMAGE" &
KB_PULL_PID=$!

echo "--- Pulling test-runner image (background)"
docker pull "$NODE_RUNNER_IMAGE" &
NODE_PULL_PID=$!

# ── Build CLI (concurrent with ES startup + image pulls) ────────────────────

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

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"

echo "--- Building CLI"
npm run build

# ── Configure kibana_system user (after build, ES has had ~3 min to boot) ───
# Kibana 9.x forbids using the elastic superuser as ELASTICSEARCH_USERNAME.
# We must use kibana_system instead, which requires setting its password via the
# ES API. A one-shot Node.js container on the same network handles this without
# needing the host to reach ES directly.

echo "--- Waiting for node runner image pull to finish"
wait "$NODE_PULL_PID"

echo "--- Configuring kibana_system user"
docker run \
  --rm \
  --network "$NETWORK_NAME" \
  --volume "$(pwd):/workspace:ro" \
  --env "ES_PASSWORD=${ES_PASSWORD}" \
  "$NODE_RUNNER_IMAGE" \
  node /workspace/.buildkite/setup-kibana.cjs

# ── Start Kibana ─────────────────────────────────────────────────────────────

echo "--- Waiting for Kibana image pull to finish"
wait "$KB_PULL_PID"

echo "--- Starting Kibana ${STACK_VERSION}"
# Intentionally no --rm so crash logs are always available in cleanup.
docker run \
  --name "$KB_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --network-alias kibana \
  --env "ELASTICSEARCH_HOSTS=http://elasticsearch:9200" \
  --env "ELASTICSEARCH_USERNAME=kibana_system" \
  --env "ELASTICSEARCH_PASSWORD=${ES_PASSWORD}" \
  --env "XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY=${KIBANA_ENCRYPTION_KEY}" \
  --env "XPACK_REPORTING_ENCRYPTIONKEY=${KIBANA_ENCRYPTION_KEY}" \
  --env "XPACK_SECURITY_ENCRYPTIONKEY=${KIBANA_ENCRYPTION_KEY}" \
  --detach \
  "$KB_IMAGE"

# Fetch container IPs immediately after starting — Docker assigns them before
# the main process runs. We pass these to the test runner as a fallback in case
# the embedded DNS server (127.0.0.11) is unavailable on this agent.
ES_IP=$(docker inspect "$ES_CONTAINER_NAME" \
  --format="{{(index .NetworkSettings.Networks \"$NETWORK_NAME\").IPAddress}}")
KB_IP=$(docker inspect "$KB_CONTAINER_NAME" \
  --format="{{(index .NetworkSettings.Networks \"$NETWORK_NAME\").IPAddress}}")
echo "Container IPs — ES: ${ES_IP}, Kibana: ${KB_IP}"

# ── Run health checks and tests inside the Docker network ───────────────────

echo "--- Running tests inside Docker network"
docker run \
  --name "$TEST_RUNNER_NAME" \
  --network "$NETWORK_NAME" \
  --rm \
  --volume "$(pwd):/workspace" \
  --workdir /workspace \
  --env "ES_PASSWORD=${ES_PASSWORD}" \
  --env "ES_IP=${ES_IP}" \
  --env "KB_IP=${KB_IP}" \
  "$NODE_RUNNER_IMAGE" \
  bash /workspace/.buildkite/run-kb-tests-runner.sh
