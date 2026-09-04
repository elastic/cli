#!/bin/bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sourced by the legacy risk engine cleanup script. Init needs
# risk_engine:risk_scoring, which is only registered when Entity Store V2
# is off at Kibana boot (kibana-ci.yml).

KB_PROVISION_URL="${KB_URL:-http://127.0.0.1:5601}"
KB_USER=elastic

code=$(curl -sS -o /tmp/kb-risk-init.json -w "%{http_code}" \
  -u "${KB_USER}:${ES_PASSWORD}" \
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
