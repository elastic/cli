#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Functional tests for the Kibana alerting API namespace.
# Exercises create rule / get rule / find rules / delete rule.

set -euo pipefail
exec < /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli.js"

RULE_ID="cli-ft-rule"

# Use the built-in .es-query rule type (available in all Kibana deployments).
RULE_PARAMS='{"searchType":"esqlQuery","esqlQuery":{"esql":"FROM * | LIMIT 1"},"timeWindowSize":5,"timeWindowUnit":"m","threshold":[0],"thresholdComparator":">","size":0,"timeField":"@timestamp"}'

teardown() {
  $CLI stack kb alerting delete-alerting-rule-id --id "$RULE_ID" --json >/dev/null 2>&1 || true
}
trap teardown EXIT

# ── create ────────────────────────────────────────────────────────────

output=$($CLI stack kb alerting post-alerting-rule-id \
  --id "$RULE_ID" \
  --consumer "stackAlerts" \
  --name "CLI FT Rule" \
  --rule-type-id ".es-query" \
  --schedule '{"interval":"1m"}' \
  --params "$RULE_PARAMS" \
  --json 2>/tmp/cli-err.txt) \
  || { echo "FAIL: alerting create — command failed"; cat /tmp/cli-err.txt; exit 1; }
[ "$(echo "$output" | jq -r '.id')" = "$RULE_ID" ] \
  || { echo "FAIL: alerting create — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.name')" = "CLI FT Rule" ] \
  || { echo "FAIL: alerting create — name mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.rule_type_id')" = ".es-query" ] \
  || { echo "FAIL: alerting create — rule_type_id mismatch"; exit 1; }

# ── get ───────────────────────────────────────────────────────────────

output=$($CLI stack kb alerting get-alerting-rule-id --id "$RULE_ID" --json 2>/dev/null)
[ "$(echo "$output" | jq -r '.id')" = "$RULE_ID" ] \
  || { echo "FAIL: alerting get — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.enabled')" = "true" ] \
  || { echo "FAIL: alerting get — rule should be enabled by default"; exit 1; }

# ── find ──────────────────────────────────────────────────────────────

output=$($CLI stack kb alerting get-alerting-rules-find --json 2>/dev/null)
count=$(echo "$output" | jq '[.data[] | select(.id == "'"$RULE_ID"'")] | length')
[ "$count" -eq 1 ] || { echo "FAIL: alerting find — created rule not found"; exit 1; }

# ── delete ────────────────────────────────────────────────────────────

$CLI stack kb alerting delete-alerting-rule-id --id "$RULE_ID" --json >/dev/null 2>/dev/null

output=$($CLI stack kb alerting get-alerting-rules-find --json 2>/dev/null)
count=$(echo "$output" | jq '[.data[] | select(.id == "'"$RULE_ID"'")] | length')
[ "$count" -eq 0 ] || { echo "FAIL: alerting delete — rule still present after delete"; exit 1; }

echo "PASS: kb/alerting.sh"
