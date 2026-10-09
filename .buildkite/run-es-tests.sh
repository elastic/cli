#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for ES functional tests.
# Starts an Elasticsearch container, generates test scripts from
# elasticsearch-clients-tests YAML files, and runs them.

set -euo pipefail

STACK_VERSION="${STACK_VERSION:-9.5.3}"
ES_CONTAINER_NAME="elastic-cli-es-test"
NETWORK_NAME="elastic-cli-test-net"
TESTS_REPO="https://github.com/elastic/elasticsearch-clients-tests.git"

cleanup() {
  echo "--- Cleaning up"
  docker rm -f "$ES_CONTAINER_NAME" 2>/dev/null || true
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
  rm -rf elasticsearch-clients-tests
}
trap cleanup EXIT

echo "--- Setting up Node.js ${NODE_VERSION}"
# shellcheck source=./bootstrap.sh
. "$(dirname "$0")/bootstrap.sh"
install_nvm
install_jq

echo "--- Installing dependencies"
npm ci

# Per-endpoint Zod schemas (#171) that once required this are gone, but tsc
# build still peaks around 3.7 GB locally; match the GitHub Actions ceiling
# so build and tests agree.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=6144"

echo "--- Building CLI"
npm run build
npm link

echo "--- Cloning elasticsearch-clients-tests"
git clone --depth 1 "$TESTS_REPO"

echo "--- Starting Elasticsearch ${STACK_VERSION}"
docker network create "$NETWORK_NAME" 2>/dev/null || true

docker run \
  --name "$ES_CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --publish 9200:9200 \
  --env "discovery.type=single-node" \
  --env "xpack.security.enabled=false" \
  --env "xpack.license.self_generated.type=trial" \
  --env "action.destructive_requires_name=false" \
  --env "ingest.geoip.downloader.enabled=false" \
  --env "cluster.deprecation_indexing.enabled=false" \
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

echo "--- Generating CI config file"
CI_CONFIG_FILE="$(pwd)/.elasticrc-ci.yml"
cat > "$CI_CONFIG_FILE" <<EOF
contexts:
  ci:
    elasticsearch:
      url: http://localhost:9200
current_context: ci
EOF
export ELASTIC_CLI_CONFIG_FILE="$CI_CONFIG_FILE"

echo "--- Generating functional test scripts"
npx tsx codegen/functional/es.ts --tests-dir elasticsearch-clients-tests/tests

echo "+++ Running ES functional tests"
set +e
npm run test:functional:es | tee /tmp/es-ft.log
code=${PIPESTATUS[0]}
set -e
# shellcheck source=./record-failure.sh
. "$(dirname "$0")/record-failure.sh"
if [ "$code" -ne 0 ]; then
  record_functional_failure /tmp/es-ft.log
fi
exit "$code"
