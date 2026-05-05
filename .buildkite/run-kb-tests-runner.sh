#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Runs INSIDE the test-runner container on the same Docker network as ES/Kibana.
# Uses Docker DNS aliases (elasticsearch:9200, kibana:5601) for all connectivity,
# which is the only networking that works reliably on kibana-ubuntu-2404 agents.

set -euo pipefail

ES_PASSWORD="${ES_PASSWORD:-changeme}"

echo "--- Installing curl and jq"
apt-get update -qq && apt-get install -y -q --no-install-recommends curl jq

echo "--- Waiting for Elasticsearch to be healthy"
RETRIES=0
MAX_RETRIES=180
until curl -sf -u "elastic:${ES_PASSWORD}" "http://elasticsearch:9200/_cluster/health" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Elasticsearch did not become healthy in time after $((MAX_RETRIES * 2))s"
    exit 1
  fi
  if [ $((RETRIES % 15)) -eq 0 ]; then
    echo "  still waiting for Elasticsearch... (${RETRIES}/${MAX_RETRIES})"
  fi
  sleep 2
done
echo "Elasticsearch cluster is up"

# The cluster can report healthy before the .security index is fully bootstrapped.
# Kibana's alerting/connectors plugins depend on ES API keys (encryptedSavedObjects),
# so we must confirm the security index is ready.
# Technique borrowed from Kibana's own kbn-es tooling (wait_for_security_index.ts).
echo "--- Waiting for Elasticsearch security index to be ready"
RETRIES=0
MAX_RETRIES=60
until curl -sf -u "elastic:${ES_PASSWORD}" \
    -X POST "http://elasticsearch:9200/_security/api_key" \
    -H "Content-Type: application/json" \
    -d '{"name":"healthcheck","expiration":"1m"}' > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Elasticsearch security index did not become ready in time"
    exit 1
  fi
  sleep 2
done
echo "Elasticsearch is ready"

echo "--- Waiting for Kibana to be healthy"
RETRIES=0
MAX_RETRIES=90
until curl -sf -u "elastic:${ES_PASSWORD}" "http://kibana:5601/api/status" \
      | jq -e '.status.overall.level == "available"' > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Kibana did not become healthy in time"
    exit 1
  fi
  sleep 3
done
echo "Kibana core is ready"

# The actions and alerting plugins initialise after the main health check passes.
echo "--- Waiting for alerting and actions plugins to be ready"
RETRIES=0
MAX_RETRIES=30
until curl -sf -u "elastic:${ES_PASSWORD}" "http://kibana:5601/api/actions/connector_types" > /dev/null 2>&1 && \
      curl -sf -u "elastic:${ES_PASSWORD}" "http://kibana:5601/api/alerting/rules/_find" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Alerting/actions plugins did not become ready in time"
    exit 1
  fi
  sleep 3
done
echo "Kibana plugins are ready"

echo "--- Generating CLI config file"
cat > /tmp/elastic-rc.yml <<EOF
contexts:
  ci:
    elasticsearch:
      url: http://elasticsearch:9200
      auth:
        username: elastic
        password: "${ES_PASSWORD}"
    kibana:
      url: http://kibana:5601
      auth:
        username: elastic
        password: "${ES_PASSWORD}"
current_context: ci
EOF
export ELASTIC_CLI_CONFIG_FILE="/tmp/elastic-rc.yml"

echo "+++ Running KB functional tests"
npm run test:functional:kb
