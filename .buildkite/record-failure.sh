#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Record the first FAIL line for the later first-failure summary job.
# No-ops outside Buildkite.

record_functional_failure() {
  local log="${1:-}"
  [ -f "$log" ] || return 0
  command -v buildkite-agent >/dev/null || return 0
  local first
  first=$(grep -E '^FAIL: |^  FAIL: ' "$log" | head -1 || true)
  [ -n "$first" ] || return 0
  if buildkite-agent meta-data exists first-failure 2>/dev/null; then
    return 0
  fi
  buildkite-agent meta-data set first-failure "${BUILDKITE_LABEL:-job}: ${first}"
  {
    printf '%s\n' "### First functional failure" "" "**Job:** ${BUILDKITE_LABEL:-unknown}" "" '```'
    grep -E '^(FAIL:|  FAIL:|Results:)' "$log" | head -20
    printf '%s\n' '```'
  } | buildkite-agent annotate --style error --context first-failure || true
}
