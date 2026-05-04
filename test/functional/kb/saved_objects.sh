#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Functional tests for the Kibana saved-objects API namespace.
# Exercises export (ndjson response) and import (multipart/form-data request)
# using the built-in 'config' saved-object type which is always present.

set -euo pipefail
exec < /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli.js"

EXPORT_FILE="/tmp/cli-ft-so-export-$$.ndjson"

teardown() {
  rm -f "$EXPORT_FILE"
}
trap teardown EXIT

# ── export ────────────────────────────────────────────────────────────
# Export returns application/x-ndjson; the CLI parses it into a JSON array.

output=$($CLI stack kb saved-objects post-saved-objects-export \
  --type "config" --exclude-export-details true --json 2>/dev/null)

# Response must be a non-empty JSON array.
arr_type=$(echo "$output" | jq -r 'type')
[ "$arr_type" = "array" ] || { echo "FAIL: saved_objects export — response is not an array (got $arr_type)"; exit 1; }

count=$(echo "$output" | jq 'length')
[ "$count" -gt 0 ] || { echo "FAIL: saved_objects export — empty array"; exit 1; }

# Each element must have a type field.
first_type=$(echo "$output" | jq -r '.[0].type')
[ -n "$first_type" ] || { echo "FAIL: saved_objects export — first element missing type field"; exit 1; }

# ── import ────────────────────────────────────────────────────────────
# Re-serialise the JSON array back to ndjson (one compact object per line)
# then send as multipart/form-data via --file.

echo "$output" | jq -c '.[]' > "$EXPORT_FILE"
ndjson_lines=$(wc -l < "$EXPORT_FILE" | tr -d ' ')
[ "$ndjson_lines" -gt 0 ] || { echo "FAIL: saved_objects import — ndjson file is empty"; exit 1; }

import_result=$($CLI stack kb saved-objects post-saved-objects-import \
  --overwrite true --file "$EXPORT_FILE" --json 2>/dev/null)
success=$(echo "$import_result" | jq -r '.success')
[ "$success" = "true" ] || { echo "FAIL: saved_objects import — success != true (got $success)"; exit 1; }

success_count=$(echo "$import_result" | jq -r '.successCount')
[ "$success_count" -gt 0 ] || { echo "FAIL: saved_objects import — successCount = 0"; exit 1; }

echo "PASS: kb/saved_objects.sh"
