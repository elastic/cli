#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for Cloud functional tests.
# Sets up credentials from Vault, builds the CLI and runs smoke tests.

set -euo pipefail

echo "--- Setting up Node.js ${NODE_VERSION}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

echo "--- Installing dependencies"
npm ci

echo "--- Building CLI"
npm run build

echo "--- Setting up Cloud credentials"
source .buildkite/setup-env.sh

echo "+++ Running Cloud smoke tests"
npm run test:functional:cloud
