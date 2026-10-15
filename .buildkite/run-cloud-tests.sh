#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for Cloud functional tests.
# Sets up credentials from Vault, builds the CLI, generates and runs the functional tests.

set -euo pipefail

echo "--- Setting up Node.js ${NODE_VERSION}"
# shellcheck source=./bootstrap.sh
. "$(dirname "$0")/bootstrap.sh"
install_nvm

echo "--- Installing dependencies"
npm ci

# Per-endpoint Zod schemas (#171) that once required this are gone, but tsc
# build still peaks around 3.7 GB locally; match the GitHub Actions ceiling
# so build and tests agree.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=6144"

echo "--- Building CLI"
npm run build

echo "--- Setting up Cloud credentials"
source .buildkite/setup-env.sh

echo "--- Ensuring Cloud fixtures"
.buildkite/ensure-cloud-fixtures.sh

echo "--- Generating Cloud functional tests"
npm run codegen:functional:cloud

echo "+++ Running Cloud functional tests"
set +e
bash test/functional/cloud/generated/run.sh | tee /tmp/cloud-ft.log
code=${PIPESTATUS[0]}
set -e
# shellcheck source=./record-failure.sh
. "$(dirname "$0")/record-failure.sh"
if [ "$code" -ne 0 ]; then
  record_functional_failure /tmp/cloud-ft.log
fi
exit "$code"
