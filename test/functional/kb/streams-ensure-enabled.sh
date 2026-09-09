#!/bin/bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sourced by wired stream CRUD scripts. Disable/enable tests flip global
# state and apply is async; wait until logs is on before CRUD.

KB_PROVISION_URL="${KB_URL:-http://127.0.0.1:5601}"
KB_USER=elastic

streams_logs_on () {
  curl -sf -u "${KB_USER}:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: kibana" \
    "${KB_PROVISION_URL}/api/streams/_status" \
    | jq -e '.logs == true' > /dev/null 2>&1
}

if streams_logs_on; then
  return 0
fi

WAIT=0
until [ "$WAIT" -ge 30 ]; do
  curl -sS -o /tmp/kb-streams-ensure.json -w "%{http_code}" \
    -u "${KB_USER}:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "elastic-api-version: 2023-10-31" \
    -H "Content-Type: application/json" \
    -X POST "${KB_PROVISION_URL}/api/streams/_enable" >/dev/null || true
  if streams_logs_on; then
    return 0
  fi
  WAIT=$((WAIT + 1))
  sleep 2
done

echo "FAIL: wired streams not enabled after wait"
cat /tmp/kb-streams-ensure.json 2>/dev/null || true
return 1
