#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for Cloud functional tests.
# Sets up credentials from Vault, builds the CLI and runs smoke tests.

set -euo pipefail

echo "--- Installing dependencies"
npm ci

echo "--- Building CLI"
npm run build

echo "--- Setting up Cloud credentials"
source .buildkite/setup-env.sh

echo "+++ Running Cloud smoke tests"
npm run test:functional:cloud
