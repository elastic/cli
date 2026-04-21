#!/usr/bin/env bash
# Local equivalent of .buildkite/run-es-tests.sh.
# Spins up a fresh no-auth ES container (matching CI), builds, links,
# generates test scripts, and runs them — all locally.
#
# Isolation: uses its own Docker container/network names, a temp config
# file (via ELASTIC_CLI_CONFIG_FILE), and clones test fixtures into /tmp
# so nothing interferes with CI or your ~/.elasticrc.yml.
#
# Usage:
#   bash scripts/run-es-tests-local.sh
#   NODE_VERSION=22 bash scripts/run-es-tests-local.sh
#   STACK_VERSION=8.17.0 bash scripts/run-es-tests-local.sh
#
# Prerequisites: docker, nvm, npm

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22}"
STACK_VERSION="${STACK_VERSION:-9.3.0}"
ES_CONTAINER_NAME="elastic-cli-es-local"
NETWORK_NAME="elastic-cli-local-net"
TESTS_REPO="https://github.com/elastic/elasticsearch-clients-tests.git"

TMPDIR_LOCAL="$(mktemp -d)"
CONFIG_FILE="$TMPDIR_LOCAL/.elasticrc.yml"
TESTS_DIR="$TMPDIR_LOCAL/elasticsearch-clients-tests"

cleanup() {
  echo "--- Cleaning up"
  docker rm -f "$ES_CONTAINER_NAME" 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
  rm -rf "$TMPDIR_LOCAL"
}
trap cleanup EXIT

# ── Node.js ──────────────────────────────────────────────────────────

echo "--- Setting up Node.js ${NODE_VERSION}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"
echo "Using $(node --version)"

# ── Build ─────────────────────────────────────────────────────────────

echo "--- Installing dependencies"
npm ci

echo "--- Building CLI"
npm run build
npm link

echo "--- Verifying elastic binary"
elastic version

# ── Elasticsearch ─────────────────────────────────────────────────────

echo "--- Starting Elasticsearch ${STACK_VERSION} (no auth, matching CI)"
docker network create "$NETWORK_NAME" 2>/dev/null || true

docker run \
  --name "$ES_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --publish 9200:9200 \
  --env "discovery.type=single-node" \
  --env "xpack.security.enabled=false" \
  --env "xpack.license.self_generated.type=trial" \
  --env "action.destructive_requires_name=false" \
  --env "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  --detach \
  --rm \
  --health-cmd="curl -sf http://localhost:9200/_cluster/health || exit 1" \
  --health-interval=2s \
  --health-retries=30 \
  --health-timeout=5s \
  "docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION}"

echo "--- Waiting for Elasticsearch to be healthy"
RETRIES=0
MAX_RETRIES=60
until curl -sf http://localhost:9200/_cluster/health > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Elasticsearch did not become healthy in time"
    docker logs "$ES_CONTAINER_NAME"
    exit 1
  fi
  sleep 2
done
echo "Elasticsearch is ready"

# ── Config (isolated — does NOT touch ~/.elasticrc.yml) ──────────────

echo "--- Writing temp config: $CONFIG_FILE"
cat > "$CONFIG_FILE" <<EOF
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
current_context: local
EOF
export ELASTIC_CLI_CONFIG_FILE="$CONFIG_FILE"

# ── Tests ─────────────────────────────────────────────────────────────

echo "--- Cloning elasticsearch-clients-tests into $TESTS_DIR"
git clone --depth 1 "$TESTS_REPO" "$TESTS_DIR"

echo "--- Generating functional test scripts"
npx tsx codegen/functional/index.ts --tests-dir "$TESTS_DIR/tests"

echo "+++ Running ES functional tests"
npm run test:functional:es
