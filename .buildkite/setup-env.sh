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

echo "--- Reading Cloud credentials from Vault"
EC_API_KEY=$(vault read -field=api_key "$CLOUD_CREDENTIALS_PATH")

if [ -z "$EC_API_KEY" ]; then
  echo "Failed to read Cloud API key from Vault"
  return 1
fi

echo "--- Generating .elasticrc.yml for CI"
cat > .elasticrc.yml <<EOF
contexts:
  ci:
    cloud:
      url: https://api.elastic-cloud.com
      auth:
        api_key: ${EC_API_KEY}
current_context: ci
EOF

echo "Cloud config written to .elasticrc.yml"
