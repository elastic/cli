#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Runs INSIDE the test-runner container on the same Docker network as ES/Kibana.
# Prefers Docker DNS aliases (elasticsearch / kibana) but falls back to the
# container IPs passed via ES_IP / KB_IP if the embedded DNS server is
# unavailable (known issue with some rootless/userns Docker configurations).

set -euo pipefail

ES_PASSWORD="${ES_PASSWORD:-changeme}"

echo "--- Installing curl and jq"
apt-get update -qq && apt-get install -y -q --no-install-recommends curl jq

# Prefer Docker DNS aliases; fall back to container IPs if DNS is unavailable.
ES_HOST="elasticsearch"
KB_HOST="kibana"

if ! getent hosts elasticsearch > /dev/null 2>&1; then
  echo "DNS for 'elasticsearch' unavailable; falling back to ES_IP=${ES_IP:-<unset>}"
  ES_HOST="${ES_IP:-elasticsearch}"
fi
if ! getent hosts kibana > /dev/null 2>&1; then
  echo "DNS for 'kibana' unavailable; falling back to KB_IP=${KB_IP:-<unset>}"
  KB_HOST="${KB_IP:-kibana}"
fi

echo "ES_HOST=${ES_HOST}  KB_HOST=${KB_HOST}"

# ── Wait for Elasticsearch ───────────────────────────────────────────────────
echo "--- Waiting for Elasticsearch to be healthy"
RETRIES=0
MAX_RETRIES=180
until curl -sf -u "elastic:${ES_PASSWORD}" "http://${ES_HOST}:9200/_cluster/health" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Elasticsearch did not become healthy after $((MAX_RETRIES * 2))s"
    curl -s -u "elastic:${ES_PASSWORD}" "http://${ES_HOST}:9200/_cluster/health" 2>&1 || true
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
    -X POST "http://${ES_HOST}:9200/_security/api_key" \
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
until curl -sf -u "elastic:${ES_PASSWORD}" "http://${KB_HOST}:5601/api/status" \
      | jq -e '.status.overall.level == "available"' > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Kibana did not become healthy in time"
    echo "Last Kibana status:"
    curl -sf -u "elastic:${ES_PASSWORD}" "http://${KB_HOST}:5601/api/status" 2>&1 || true
    exit 1
  fi
  sleep 3
done
echo "Kibana core is ready"

# Poll /api/status for plugin-level readiness rather than calling the actions
# endpoint directly (the actions HTTP context returns 500 briefly after
# Kibana's overall "available", and Fleet degradation is isolated to
# plugins.fleet and does not affect plugins.actions or plugins.alerting).
echo "--- Waiting for actions + alerting plugins to be available"
RETRIES=0
MAX_RETRIES=60
until curl -sf -u "elastic:${ES_PASSWORD}" "http://${KB_HOST}:5601/api/status" \
    | jq -e '
        (.status.plugins.actions.level   // "") == "available" and
        (.status.plugins.alerting.level  // "") == "available"
      ' > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Actions/alerting plugins did not reach 'available' in time"
    echo "Last plugin statuses:"
    curl -sf -u "elastic:${ES_PASSWORD}" "http://${KB_HOST}:5601/api/status" \
      | jq '.status.plugins | with_entries(select(.value.level != "available"))' 2>&1 || true
    exit 1
  fi
  if [ $((RETRIES % 10)) -eq 0 ]; then
    echo "  still waiting... (${RETRIES}/${MAX_RETRIES})"
  fi
  sleep 2
done
echo "Kibana is ready"

echo "--- Generating CLI config file"
cat > /tmp/elastic-rc.yml <<EOF
contexts:
  ci:
    elasticsearch:
      url: http://${ES_HOST}:9200
      auth:
        username: elastic
        password: "${ES_PASSWORD}"
    kibana:
      url: http://${KB_HOST}:5601
      auth:
        username: elastic
        password: "${ES_PASSWORD}"
current_context: ci
EOF
export ELASTIC_CLI_CONFIG_FILE="/tmp/elastic-rc.yml"

echo "+++ Running KB functional tests"
npm run test:functional:kb
