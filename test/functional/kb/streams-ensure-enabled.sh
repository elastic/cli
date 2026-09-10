#!/bin/bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sourced by wired stream CRUD scripts. Disable/enable tests flip global
# state and apply is async; wait until logs.otel and logs.ecs are on.

KB_PROVISION_URL="${KB_URL:-http://127.0.0.1:5601}"
KB_USER=elastic

# Fresh enable creates logs.otel + logs.ecs. .logs is the legacy root.
streams_wired_on () {
  curl -sf -u "${KB_USER}:${ES_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "x-elastic-internal-origin: kibana" \
    "${KB_PROVISION_URL}/api/streams/_status" \
    | jq -e '.["logs.otel"] == true and .["logs.ecs"] == true' > /dev/null 2>&1
}

if streams_wired_on; then
  return 0
fi

curl -sS -o /tmp/kb-streams-ensure.json \
  -u "${KB_USER}:${ES_PASSWORD}" \
  -H "kbn-xsrf: true" \
  -H "elastic-api-version: 2023-10-31" \
  -H "Content-Type: application/json" \
  -X POST "${KB_PROVISION_URL}/api/streams/_enable" >/dev/null || true

WAIT=0
until streams_wired_on; do
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 30 ]; then
    echo "FAIL: wired streams not enabled after wait"
    cat /tmp/kb-streams-ensure.json 2>/dev/null || true
    echo
    curl -sS -u "${KB_USER}:${ES_PASSWORD}" \
      -H "kbn-xsrf: true" \
      -H "x-elastic-internal-origin: kibana" \
      "${KB_PROVISION_URL}/api/streams/_status" || true
    echo
    return 1
  fi
  sleep 2
done
