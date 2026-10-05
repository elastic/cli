#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0

# Build id of a pipeline triggered by a `trigger` step on this build.
# stdout is the id only. BUILDKITE_TOKEN_SECRET is a Buildkite API token
# with read_builds (secret/ci/elastic-cli/buildkite-read).
lookup_triggered_build_id() {
  local step_key="$1"
  : "${BUILDKITE_TOKEN_SECRET:?BUILDKITE_TOKEN_SECRET is required}"
  : "${BUILDKITE_BUILD_NUMBER:?BUILDKITE_BUILD_NUMBER must be set by Buildkite}"

  local body
  body="$(curl -fsSL \
    -H "Authorization: Bearer ${BUILDKITE_TOKEN_SECRET}" \
    "https://api.buildkite.com/v2/organizations/elastic/pipelines/elastic-cli-release/builds/${BUILDKITE_BUILD_NUMBER}")" || return $?
  printf '%s' "$body" | jq -er --arg key "$step_key" '
    [.jobs // [] | .[] | select(.step_key == $key) | .triggered_build.id // empty]
    | if length == 1 then .[0] else error("expected one triggered build for " + $key) end
  '
}
