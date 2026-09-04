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

# Wired stream CRUD 422s until enabled. 200 (including result noop) is done.
# 409 lock: another apply is in progress; wait for _status, do not re-POST.
# 409 name conflict: leftover logs data stream; delete once, POST once.
streams_post_enable () {
  curl -sS -o /tmp/kb-streams-enable.json -w "%{http_code}" \
    -u "elastic:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "elastic-api-version: 2023-10-31" \
    -H "Content-Type: application/json" \
    -X POST "http://${KB_HOST}:5601/api/streams/_enable"
}

streams_logs_enabled () {
  curl -sf -u "elastic:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: kibana" \
    "http://${KB_HOST}:5601/api/streams/_status" \
    | jq -e '.logs == true' > /dev/null 2>&1
}

echo "--- Enabling wired streams"
STREAMS_CODE=$(streams_post_enable)
if [ "$STREAMS_CODE" != "200" ]; then
  echo "POST /api/streams/_enable returned ${STREAMS_CODE}"
  cat /tmp/kb-streams-enable.json
  echo
fi
if [ "$STREAMS_CODE" = "409" ] && \
   jq -e '.message | test("lock"; "i")' /tmp/kb-streams-enable.json >/dev/null; then
  echo "--- Waiting for in-progress streams enable"
  WAIT=0
  until streams_logs_enabled; do
    WAIT=$((WAIT + 1))
    if [ "$WAIT" -ge 30 ]; then
      STREAMS_CODE=$(streams_post_enable)
      break
    fi
    sleep 2
  done
  if streams_logs_enabled; then
    STREAMS_CODE=200
  fi
fi
if [ "$STREAMS_CODE" = "409" ] && \
   ! jq -e '.message | test("lock"; "i")' /tmp/kb-streams-enable.json >/dev/null; then
  echo "--- Clearing conflicting logs data streams"
  curl -sS -u "elastic:${ES_PASSWORD}" \
    -X DELETE "http://${ES_HOST}:9200/_data_stream/logs,logs.otel,logs.ecs" || true
  echo
  STREAMS_CODE=$(streams_post_enable)
fi
if [ "$STREAMS_CODE" != "200" ] && ! streams_logs_enabled; then
  echo "FAIL: POST /api/streams/_enable returned ${STREAMS_CODE}"
  cat /tmp/kb-streams-enable.json
  echo
  curl -sS -u "elastic:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: kibana" \
    "http://${KB_HOST}:5601/api/streams/_status" || true
  echo
  exit 1
fi
echo "Wired streams enabled"

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
# this setup only runs against stack Kibana
env ELASTIC_ENVIRONMENT=stack \
  npm run test:functional:kb
