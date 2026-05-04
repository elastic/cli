#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Runner for Kibana functional tests.
# Each test file is run in a subshell; failures are collected and reported.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSED=0
FAILED=0
ERRORS=""

run_test() {
  local name="$1"
  local file="$SCRIPT_DIR/$2"
  if OUTPUT=$(bash "$file" 2>&1); then
    PASSED=$((PASSED + 1))
    echo "PASS: $name"
  else
    FAILED=$((FAILED + 1))
    ERRORS="$ERRORS\n  FAIL: $name"
    echo "FAIL: $name"
    echo "$OUTPUT" | tail -5
  fi
}

run_test "data_views"   "data_views.sh"
run_test "spaces"       "spaces.sh"
run_test "alerting"     "alerting.sh"
run_test "connectors"   "connectors.sh"
run_test "saved_objects" "saved_objects.sh"

echo ""
echo "================================"
echo "Results: $PASSED passed, $FAILED failed"
if [ "$FAILED" -gt 0 ]; then
  printf "Failures:%b\n" "$ERRORS"
  exit 1
fi
echo "================================"
