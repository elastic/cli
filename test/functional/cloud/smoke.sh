#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Cloud & Serverless control plane smoke tests.
# Runs a small set of read-only CLI commands against the real Cloud API
# to verify the CLI can authenticate and return valid responses.
#
# Prerequisites:
#   - npm run build (the CLI must be compiled to dist/)
#   - A .elasticrc.yml with a cloud context, OR EC_API_KEY env var
#
# Usage:
#   npm run test:functional:cloud

set -euo pipefail

# Provide empty stdin so the CLI doesn't crash in non interactive (no TTY) environments like CI.
exec < /dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli.js"

# ── Helpers ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
SKIP=0

pass() {
  PASS=$((PASS + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo "  FAIL: $1 — $2" >&2
}

skip() {
  SKIP=$((SKIP + 1))
  echo "  SKIP: $1"
}

summary() {
  echo ""
  echo "──────────────────────────────────────"
  echo "Cloud smoke tests: $PASS passed, $FAIL failed, $SKIP skipped"
  echo "──────────────────────────────────────"
  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}
trap summary EXIT

# Run a command and pass if it exits 0 and fail otherwise.
# First arg is the test name (used for output) and the remaining args are the command to run.
assert_exit_zero() {
  local name="$1"
  shift
  if output=$("$@" 2>&1); then
    pass "$name"
  else
    fail "$name" "exit code $?"
  fi
}

# Check that a JSON string contains a given top-level field.
assert_json_field() {
  local name="$1"
  local json="$2"
  local field="$3"

  if echo "$json" | jq -e ".$field" > /dev/null 2>&1; then
    pass "$name (has .$field)"
  else
    fail "$name" "missing field .$field in JSON response"
  fi
}

# Retry a command up to 3 times with exponential backoff (2s, 4s).
retry_with_backoff() {
  local max_attempts=3
  local delay=2
  local attempt=1
  while [ $attempt -le $max_attempts ]; do
    if "$@" 2>/dev/null; then
      return 0
    fi
    if [ $attempt -lt $max_attempts ]; then
      echo "    retry $attempt/$max_attempts, waiting ${delay}s..." >&2
      sleep $delay
      delay=$((delay * 2))
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

# ── Preflight ────────────────────────────────────────────────────────

echo "Cloud Smoke Tests"
echo "──────────────────────────────────────"

# Build if needed
if [ ! -f "$REPO_ROOT/dist/cli.js" ]; then
  echo "Building CLI..."
  (cd "$REPO_ROOT" && npm run build --silent)
fi

# Check if cloud context is configured by trying a simple command.
# If it fails, skip all tests gracefully.
if ! $CLI cloud accounts get-current-account --json >/dev/null 2>&1; then
  echo ""
  echo "No Cloud credentials configured. Skipping all Cloud smoke tests."
  echo "To run locally, set up a .elasticrc.yml with a cloud context."
  echo "Check README.md for details"
  exit 0
fi

echo ""

# ── Cloud Hosted ─────────────────────────────────────────────────────

echo "Cloud Hosted API:"

# accounts get-current-account
output=$(retry_with_backoff $CLI cloud accounts get-current-account --json 2>&1) || true
if [ -n "$output" ]; then
  assert_exit_zero "accounts get-current-account" $CLI cloud accounts get-current-account --json
  assert_json_field "accounts get-current-account" "$output" "id"
else
  fail "accounts get-current-account" "empty response"
fi

# deployments list-deployments
output=$(retry_with_backoff $CLI cloud deployments list-deployments --json 2>&1) || true
if [ -n "$output" ]; then
  assert_exit_zero "deployments list-deployments" $CLI cloud deployments list-deployments --json
else
  fail "deployments list-deployments" "empty response"
fi

echo ""

# ── Serverless ───────────────────────────────────────────────────────

echo "Serverless API:"

# serverless es projects list
output=$(retry_with_backoff $CLI serverless es projects list --json 2>&1) || true
if [ -n "$output" ]; then
  assert_exit_zero "serverless es projects list" $CLI serverless es projects list --json
else
  fail "serverless es projects list" "empty response"
fi

# serverless regions list-regions
output=$(retry_with_backoff $CLI serverless regions list-regions --json 2>&1) || true
if [ -n "$output" ]; then
  assert_exit_zero "serverless regions list-regions" $CLI serverless regions list-regions --json
else
  fail "serverless regions list-regions" "empty response"
fi
