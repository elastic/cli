#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Functional tests for the Kibana spaces API namespace.
# Exercises create / get / list / delete for a non-default space.

set -euo pipefail
exec < /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli.js"

SPACE_ID="cli-ft-space"

teardown() {
  $CLI stack kb spaces delete-spaces-space-id --id "$SPACE_ID" --json >/dev/null 2>&1 || true
}
trap teardown EXIT

# ── create ────────────────────────────────────────────────────────────

output=$($CLI stack kb spaces post-spaces-space \
  --id "$SPACE_ID" --name "CLI FT Space" --description "Created by functional test" \
  --json 2>/dev/null)
[ "$(echo "$output" | jq -r '.id')" = "$SPACE_ID" ] \
  || { echo "FAIL: spaces create — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.name')" = "CLI FT Space" ] \
  || { echo "FAIL: spaces create — name mismatch"; exit 1; }

# ── get ───────────────────────────────────────────────────────────────

output=$($CLI stack kb spaces get-spaces-space-id --id "$SPACE_ID" --json 2>/dev/null)
[ "$(echo "$output" | jq -r '.id')" = "$SPACE_ID" ] \
  || { echo "FAIL: spaces get — id mismatch"; exit 1; }
[ "$(echo "$output" | jq -r '.description')" = "Created by functional test" ] \
  || { echo "FAIL: spaces get — description mismatch"; exit 1; }

# ── list ──────────────────────────────────────────────────────────────

# include_authorized_purposes is required by the generated schema even though
# the Kibana docs treat it as optional; pass false to satisfy validation.
output=$($CLI stack kb spaces get-spaces-space --include-authorized-purposes false --json 2>/dev/null)
count=$(echo "$output" | jq '[.[] | select(.id == "'"$SPACE_ID"'")] | length')
[ "$count" -eq 1 ] || { echo "FAIL: spaces list — created space not found"; exit 1; }

# Default space must always be present.
default_count=$(echo "$output" | jq '[.[] | select(.id == "default")] | length')
[ "$default_count" -eq 1 ] || { echo "FAIL: spaces list — default space missing"; exit 1; }

# ── delete ────────────────────────────────────────────────────────────

$CLI stack kb spaces delete-spaces-space-id --id "$SPACE_ID" --json >/dev/null 2>/dev/null

output=$($CLI stack kb spaces get-spaces-space --include-authorized-purposes false --json 2>/dev/null)
count=$(echo "$output" | jq '[.[] | select(.id == "'"$SPACE_ID"'")] | length')
[ "$count" -eq 0 ] || { echo "FAIL: spaces delete — space still present after delete"; exit 1; }

echo "PASS: kb/spaces.sh"
