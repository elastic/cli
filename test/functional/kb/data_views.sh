#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Functional tests for the Kibana data-views API namespace.
# Exercises create / get / list / delete for a single data view.

set -euo pipefail
exec < /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli.js"

VIEW_ID=""

teardown() {
  if [ -n "$VIEW_ID" ]; then
    $CLI stack kb data-views delete-data-view-default --view-id "$VIEW_ID" --json >/dev/null 2>&1 || true
  fi
}
trap teardown EXIT

# ── create ────────────────────────────────────────────────────────────

output=$(echo '{"data_view":{"title":"cli-ft-dv-*","name":"cli-ft-dv"}}' \
  | $CLI stack kb data-views create-data-view-defaultw --json 2>/dev/null)
VIEW_ID=$(echo "$output" | jq -r '.data_view.id')
[ -n "$VIEW_ID" ] || { echo "FAIL: data_views create — empty id"; exit 1; }
[ "$(echo "$output" | jq -r '.data_view.name')" = "cli-ft-dv" ] \
  || { echo "FAIL: data_views create — name mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.data_view.title')" = "cli-ft-dv-*" ] \
  || { echo "FAIL: data_views create — title mismatch"; exit 1; }

# ── get ───────────────────────────────────────────────────────────────

output=$($CLI stack kb data-views get-data-view-default --view-id "$VIEW_ID" --json 2>/dev/null)
[ "$(echo "$output" | jq -r '.data_view.id')" = "$VIEW_ID" ] \
  || { echo "FAIL: data_views get — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.data_view.name')" = "cli-ft-dv" ] \
  || { echo "FAIL: data_views get — name mismatch"; exit 1; }

# ── list ──────────────────────────────────────────────────────────────

output=$($CLI stack kb data-views get-all-data-views-default --json 2>/dev/null)
count=$(echo "$output" | jq '[.data_view[] | select(.id == "'"$VIEW_ID"'")] | length')
[ "$count" -eq 1 ] || { echo "FAIL: data_views list — created view not found in list"; exit 1; }

# ── delete ────────────────────────────────────────────────────────────

$CLI stack kb data-views delete-data-view-default --view-id "$VIEW_ID" --json >/dev/null 2>/dev/null
VIEW_ID=""

output=$($CLI stack kb data-views get-all-data-views-default --json 2>/dev/null)
count=$(echo "$output" | jq '[.data_view[] | select(.name == "cli-ft-dv")] | length')
[ "$count" -eq 0 ] || { echo "FAIL: data_views delete — view still present after delete"; exit 1; }

echo "PASS: kb/data_views.sh"
