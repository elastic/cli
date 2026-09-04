# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sourced by the three legacy risk engine functional scripts. Those APIs
# return 400 while securitySolution:entityStoreEnableV2 is on.

KB_PROVISION_URL="${KB_URL:-http://127.0.0.1:5601}"

kb_set_entity_store_v2() {
  local value="$1"
  local code
  code=$(curl -sS -o /tmp/kb-v2.json -w "%{http_code}" \
    -u "elastic:${ES_PASSWORD:-changeme}" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: kibana" \
    -H "Content-Type: application/json" \
    -X POST "${KB_PROVISION_URL}/internal/kibana/settings" \
    -d "{\"changes\":{\"securitySolution:entityStoreEnableV2\":${value}}}")
  if [ "$code" != "200" ]; then
    echo "FAIL: set entityStoreEnableV2=${value} returned ${code}"
    cat /tmp/kb-v2.json
    return 1
  fi
}

kb_init_legacy_risk_engine() {
  local code
  code=$(curl -sS -o /tmp/kb-risk-init.json -w "%{http_code}" \
    -u "elastic:${ES_PASSWORD:-changeme}" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: kibana" \
    -H "elastic-api-version: 1" \
    -H "Content-Type: application/json" \
    -X POST "${KB_PROVISION_URL}/internal/risk_score/engine/init")
  if [ "$code" != "200" ] && [ "$code" != "409" ]; then
    echo "FAIL: POST /internal/risk_score/engine/init returned ${code}"
    cat /tmp/kb-risk-init.json
    return 1
  fi
}

kb_restore_entity_store_v2() { kb_set_entity_store_v2 true || true; }

kb_set_entity_store_v2 false
kb_init_legacy_risk_engine
trap kb_restore_entity_store_v2 EXIT
