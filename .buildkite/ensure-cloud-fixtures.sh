#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Idempotent QA fixtures so Cloud item GET tests have something to fetch.
# Creates one serverless project per type, one serverless traffic filter,
# one hosted traffic-filter ruleset, and one hosted deployment when the
# matching list is empty. Skips extensions (need a plugin zip). Does not
# print create responses (they can contain creds).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELASTIC=(node "$REPO_ROOT/dist/cli.js" --json)
REGION="${CLOUD_FIXTURE_REGION:-gcp-us-central1}"
RULES='[{"source":"192.0.2.1"}]'

first_id () {
  jq -r '
    if type == "array" then .[0].id // empty
    else
      .items[0].id
      // .projects[0].id
      // .filters[0].id
      // .rulesets[0].id
      // .deployments[0].id
      // empty
    end
  '
}

ensure () {
  local label="$1"
  shift
  local list_args=()
  while [ "$1" != "--" ]; do
    list_args+=("$1")
    shift
  done
  shift
  local id
  id="$("${ELASTIC[@]}" "${list_args[@]}" | first_id)"
  if [ -n "$id" ] && [ "$id" != "null" ]; then
    echo "fixture exists: $label $id"
    return 0
  fi
  echo "creating fixture: $label"
  # stdout discarded so create responses never land in CI logs
  "${ELASTIC[@]}" "$@" >/dev/null
}

ensure "search project" \
  cloud serverless projects search list -- \
  cloud serverless projects search create \
  --name cli-functional-search \
  --region-id "$REGION" \
  --optimized-for general_purpose \
  --yes

ensure "observability project" \
  cloud serverless projects observability list -- \
  cloud serverless projects observability create \
  --name cli-functional-o11y \
  --region-id "$REGION" \
  --product-tier logs_essentials \
  --yes

ensure "security project" \
  cloud serverless projects security list -- \
  cloud serverless projects security create \
  --name cli-functional-security \
  --region-id "$REGION" \
  --yes

ensure "serverless traffic filter" \
  cloud serverless traffic-filters list-traffic-filters -- \
  cloud serverless traffic-filters create-traffic-filter \
  --name cli-functional-filter \
  --type ip \
  --region "$REGION" \
  --rules "$RULES" \
  --yes

ensure "hosted traffic filter ruleset" \
  cloud hosted traffic-filters get-traffic-filter-rulesets -- \
  cloud hosted traffic-filters create-traffic-filter-ruleset \
  --name cli-functional-ruleset \
  --type ip \
  --include-by-default false \
  --region "$REGION" \
  --rules "$RULES"

ensure "hosted deployment" \
  cloud hosted deployments list-deployments -- \
  cloud hosted deployments create-deployment \
  --name cli-functional \
  --region "$REGION" \
  --template-id gcp-general-purpose
