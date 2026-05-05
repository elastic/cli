#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for Kibana functional tests.
# Starts an Elasticsearch container, then a Kibana container that connects to it,
# generates a CLI config pointing at both, and runs the hand-authored KB test suite.

set -euo pipefail

STACK_VERSION="${STACK_VERSION:-9.3.0}"
ES_CONTAINER_NAME="elastic-cli-kb-es"
KB_CONTAINER_NAME="elastic-cli-kb"
NETWORK_NAME="elastic-cli-kb-net"

cleanup() {
  echo "--- Cleaning up"
  docker rm -f "$KB_CONTAINER_NAME" 2>/dev/null || true
  docker rm -f "$ES_CONTAINER_NAME" 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
}
trap cleanup EXIT

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
npm link

echo "--- Creating Docker network"
docker network create "$NETWORK_NAME" 2>/dev/null || true

# Use fixed dummy values so the CLI config can reference them without secrets management.
ES_PASSWORD="changeme"
KIBANA_ENCRYPTION_KEY="xP9mfMqnRrNHmSmzPoBtLQvLFzYdHxKj" # gitleaks:allow

echo "--- Starting Elasticsearch ${STACK_VERSION}"
docker run \
  --name "$ES_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --network-alias elasticsearch \
  --publish 9200:9200 \
  --env "discovery.type=single-node" \
  --env "xpack.license.self_generated.type=trial" \
  --env "action.destructive_requires_name=false" \
  --env "ELASTIC_PASSWORD=${ES_PASSWORD}" \
  --env "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  --detach \
  --rm \
  "docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION}"

echo "--- Waiting for Elasticsearch to be healthy"
RETRIES=0
MAX_RETRIES=180
until curl -sf -u "elastic:${ES_PASSWORD}" http://localhost:9200/_cluster/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Elasticsearch did not become healthy in time after $((MAX_RETRIES * 2))s"
    docker logs "$ES_CONTAINER_NAME"
    exit 1
  fi
  # Print progress every 30 seconds so CI logs show we are still waiting.
  if [ $((RETRIES % 15)) -eq 0 ]; then
    echo "  still waiting for Elasticsearch... (${RETRIES}/${MAX_RETRIES})"
  fi
  sleep 2
done
echo "Elasticsearch is ready"

echo "--- Starting Kibana ${STACK_VERSION}"
docker run \
  --name "$KB_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --publish 5601:5601 \
  --env "ELASTICSEARCH_HOSTS=http://elasticsearch:9200" \
  --env "ELASTICSEARCH_USERNAME=elastic" \
  --env "ELASTICSEARCH_PASSWORD=${ES_PASSWORD}" \
  --env "xpack.encryptedSavedObjects.encryptionKey=${KIBANA_ENCRYPTION_KEY}" \
  --env "xpack.reporting.encryptionKey=${KIBANA_ENCRYPTION_KEY}" \
  --env "xpack.security.encryptionKey=${KIBANA_ENCRYPTION_KEY}" \
  --detach \
  --rm \
  "docker.elastic.co/kibana/kibana:${STACK_VERSION}"

echo "--- Waiting for Kibana to be healthy"
RETRIES=0
MAX_RETRIES=90
until curl -sf -u "elastic:${ES_PASSWORD}" http://localhost:5601/api/status \
      | jq -e '.status.overall.level == "available"' > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Kibana did not become healthy in time"
    docker logs "$KB_CONTAINER_NAME"
    exit 1
  fi
  sleep 3
done
echo "Kibana core is ready"

# The actions and alerting plugins initialise after the main health check passes.
# Wait until their APIs return 200 before running tests.
echo "--- Waiting for alerting and actions plugins to be ready"
RETRIES=0
MAX_RETRIES=30
until curl -sf -u "elastic:${ES_PASSWORD}" http://localhost:5601/api/actions/connector_types > /dev/null 2>&1 && \
      curl -sf -u "elastic:${ES_PASSWORD}" http://localhost:5601/api/alerting/rules/_find > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Alerting/actions plugins did not become ready in time"
    docker logs "$KB_CONTAINER_NAME" --tail 50
    exit 1
  fi
  sleep 3
done
echo "Kibana plugins are ready"

echo "--- Generating CI config file"
CI_CONFIG_FILE="$(pwd)/.elasticrc-kb-ci.yml"
cat > "$CI_CONFIG_FILE" <<EOF
contexts:
  ci:
    elasticsearch:
      url: http://localhost:9200
      auth:
        username: elastic
        password: "${ES_PASSWORD}"
    kibana:
      url: http://localhost:5601
      auth:
        username: elastic
        password: "${ES_PASSWORD}"
current_context: ci
EOF
export ELASTIC_CLI_CONFIG_FILE="$CI_CONFIG_FILE"

echo "+++ Running KB functional tests"
npm run test:functional:kb
