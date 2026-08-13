#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Pulls Cloud API credentials from Vault and generates a .elasticrc.yml
# for the functional test run. Called by run-cloud-tests.sh.
#
# Requires CLOUD_CREDENTIALS_PATH to be set in the pipeline env.

set -euo pipefail

if [ -z "${CLOUD_CREDENTIALS_PATH:-}" ]; then
  echo "CLOUD_CREDENTIALS_PATH not set, skipping Vault setup"
  return 0
fi

CI_CONFIG_DIR=$(mktemp -d)
chmod 0700 "$CI_CONFIG_DIR"
CI_CONFIG_FILE="$CI_CONFIG_DIR/elastic-cli-ci.json"
install -m 0600 /dev/null "$CI_CONFIG_FILE"

cleanup_cloud_config() {
  rm -rf "$CI_CONFIG_DIR"
}
# trap fires when the sourcing shell exits, removing the temp config for the lifetime of the CI job
trap cleanup_cloud_config EXIT

echo "--- Reading Cloud credentials from Vault"
EC_API_KEY=$(vault read -field=api_key "$CLOUD_CREDENTIALS_PATH")

if [ -z "$EC_API_KEY" ]; then
  echo "Vault returned an empty Cloud API key" >&2
  return 1
fi

echo "--- Generating CI config"
printf '%s' "$EC_API_KEY" | node -e '
  const key = require("node:fs").readFileSync(0, "utf-8").trim()
  process.stdout.write(JSON.stringify({
    contexts: { ci: { cloud: {
      url: "https://admin.qa.cld.elstc.co",
      auth: { api_key: key },
    } } },
    current_context: "ci",
  }) + "\n")
' > "$CI_CONFIG_FILE"

unset EC_API_KEY
export ELASTIC_CLOUD_ADMIN_API=true
export ELASTIC_CLI_CONFIG_FILE="$CI_CONFIG_FILE"

echo "Cloud config written to $CI_CONFIG_FILE (admin API mode enabled)"
