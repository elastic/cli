#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Functional tests for the Kibana connectors API namespace.
# Exercises list-types / create / get / list / delete.

set -euo pipefail
exec < /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli.js"

CONNECTOR_ID=""

teardown() {
  if [ -n "$CONNECTOR_ID" ]; then
    $CLI stack kb connectors delete-actions-connector-id --id "$CONNECTOR_ID" --json >/dev/null 2>&1 || true
  fi
}
trap teardown EXIT

# ── list connector types ───────────────────────────────────────────────

output=$($CLI stack kb connectors get-actions-connector-types --json 2>/tmp/cli-err.txt) \
  || { echo "FAIL: connectors list-types — command failed"; cat /tmp/cli-err.txt; exit 1; }
count=$(echo "$output" | jq 'length')
[ "$count" -gt 0 ] || { echo "FAIL: connectors list-types — empty list"; exit 1; }

# The .index connector type ships with all Kibana deployments.
index_type=$(echo "$output" | jq -r '[.[] | select(.id == ".index")] | .[0].id')
[ "$index_type" = ".index" ] \
  || { echo "FAIL: connectors list-types — .index type not found"; exit 1; }

# ── create ────────────────────────────────────────────────────────────

# Use Node.js crypto to generate a UUID (Node is always available in CI).
CONNECTOR_UUID=$(node -e "process.stdout.write(require('crypto').randomUUID())")
CONNECTOR_ID="$CONNECTOR_UUID"

output=$($CLI stack kb connectors post-actions-connector-id \
  --id "$CONNECTOR_UUID" \
  --connector-type-id ".index" \
  --name "CLI FT Index Connector" \
  --kb-config '{"index":"cli-ft-connector-*"}' \
  --json 2>/tmp/cli-err.txt) \
  || { echo "FAIL: connectors create — command failed"; cat /tmp/cli-err.txt; exit 1; }
[ "$(echo "$output" | jq -r '.id')" = "$CONNECTOR_UUID" ] \
  || { echo "FAIL: connectors create — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.name')" = "CLI FT Index Connector" ] \
  || { echo "FAIL: connectors create — name mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.connector_type_id')" = ".index" ] \
  || { echo "FAIL: connectors create — connector_type_id mismatch"; exit 1; }

# ── get ───────────────────────────────────────────────────────────────

output=$($CLI stack kb connectors get-actions-connector-id --id "$CONNECTOR_ID" --json 2>/dev/null)
[ "$(echo "$output" | jq -r '.id')" = "$CONNECTOR_ID" ] \
  || { echo "FAIL: connectors get — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.name')" = "CLI FT Index Connector" ] \
  || { echo "FAIL: connectors get — name mismatch"; exit 1; }

# ── list ──────────────────────────────────────────────────────────────

output=$($CLI stack kb connectors get-actions-connectors --json 2>/dev/null)
count=$(echo "$output" | jq '[.[] | select(.id == "'"$CONNECTOR_ID"'")] | length')
[ "$count" -eq 1 ] || { echo "FAIL: connectors list — created connector not found"; exit 1; }

# ── delete ────────────────────────────────────────────────────────────

$CLI stack kb connectors delete-actions-connector-id --id "$CONNECTOR_ID" --json >/dev/null 2>/dev/null
CONNECTOR_ID=""

output=$($CLI stack kb connectors get-actions-connectors --json 2>/dev/null)
count=$(echo "$output" | jq '[.[] | select(.name == "CLI FT Index Connector")] | length')
[ "$count" -eq 0 ] || { echo "FAIL: connectors delete — connector still present after delete"; exit 1; }

echo "PASS: kb/connectors.sh"
