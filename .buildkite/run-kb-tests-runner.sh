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

# ── Network diagnostics ──────────────────────────────────────────────────────
echo "--- Network diagnostics"
echo "resolv.conf:"
cat /etc/resolv.conf || true
echo "Routes:"
ip route 2>/dev/null || true

# Determine whether to use DNS names or IPs.
ES_HOST="elasticsearch"
KB_HOST="kibana"

if getent hosts elasticsearch > /dev/null 2>&1; then
  RESOLVED=$(getent hosts elasticsearch | awk '{print $1}')
  echo "DNS OK: elasticsearch -> $RESOLVED"
else
  echo "DNS lookup for 'elasticsearch' failed"
  if [[ -n "${ES_IP:-}" ]]; then
    echo "Falling back to ES_IP=${ES_IP}"
    ES_HOST="$ES_IP"
  else
    echo "No ES_IP provided and DNS failed — health checks will fail"
  fi
fi

if getent hosts kibana > /dev/null 2>&1; then
  RESOLVED=$(getent hosts kibana | awk '{print $1}')
  echo "DNS OK: kibana -> $RESOLVED"
else
  echo "DNS lookup for 'kibana' failed"
  if [[ -n "${KB_IP:-}" ]]; then
    echo "Falling back to KB_IP=${KB_IP}"
    KB_HOST="$KB_IP"
  else
    echo "No KB_IP provided and DNS failed — health checks will fail"
  fi
fi

echo "Using ES_HOST=${ES_HOST}, KB_HOST=${KB_HOST}"

# First connection attempt with full output for debugging.
echo "First curl attempt (verbose):"
curl -v -u "elastic:${ES_PASSWORD}" "http://${ES_HOST}:9200/_cluster/health" 2>&1 || true

# ── Wait for Elasticsearch ───────────────────────────────────────────────────
echo "--- Waiting for Elasticsearch to be healthy"
RETRIES=0
MAX_RETRIES=180
until curl -sf -u "elastic:${ES_PASSWORD}" "http://${ES_HOST}:9200/_cluster/health" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Elasticsearch did not become healthy in time after $((MAX_RETRIES * 2))s"
    echo "Last curl attempt:"
    curl -v -u "elastic:${ES_PASSWORD}" "http://${ES_HOST}:9200/_cluster/health" 2>&1 || true
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

# Poll the actions API directly — it requires the license to be loaded from ES.
# Kibana's actions plugin returns 403 with "license information is not available"
# until its licensing subscription fires (usually a few seconds after "available",
# but can be longer on cold starts).  Polling the real endpoint is more reliable
# than a fixed sleep.
echo "--- Waiting for Kibana actions API (license must be loaded)"
RETRIES=0
MAX_RETRIES=60
until curl -sf -u "elastic:${ES_PASSWORD}" \
    "http://${KB_HOST}:5601/api/actions/connector_types" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
    echo "Kibana actions API did not become ready in time"
    echo "Last response:"
    curl -u "elastic:${ES_PASSWORD}" \
        "http://${KB_HOST}:5601/api/actions/connector_types" 2>&1 || true
    exit 1
  fi
  if [ $((RETRIES % 10)) -eq 0 ]; then
    echo "  still waiting for actions API... (${RETRIES}/${MAX_RETRIES})"
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
