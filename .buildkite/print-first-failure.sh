#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Runs after functional jobs. Prints the first recorded failure.
# The sticky PR comment is posted by .github/workflows/bk-repair-loop.yml
# after triage when GitHub sees buildkite/elastic-cli/pr fail.

set -euo pipefail

echo "+++ First Buildkite failure"

SUMMARY=""
if command -v buildkite-agent >/dev/null && buildkite-agent meta-data exists first-failure 2>/dev/null; then
  SUMMARY=$(buildkite-agent meta-data get first-failure)
fi

if [ -z "$SUMMARY" ]; then
  echo "No first-failure metadata. Functional jobs were green, or they failed before recording a FAIL line."
  exit 0
fi

printf '%s\n' "$SUMMARY"
