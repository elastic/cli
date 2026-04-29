#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Buildkite entry point for Cloud functional tests.
# Sets up credentials from Vault, builds the CLI and runs smoke tests.

set -euo pipefail

echo "--- Setting up Node.js ${NODE_VERSION}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found, installing..."
  mkdir -p "$NVM_DIR"
  NVM_VERSION=$(curl -s https://api.github.com/repos/nvm-sh/nvm/releases/latest | jq -r '.tag_name // "v0.39.7"')
  echo "Installing nvm ${NVM_VERSION}"
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"

echo "--- Installing dependencies"
npm ci

# Per-endpoint Zod schemas (#171) make tsc's declaration emit exceed the 2 GB
# default Node heap. Match the GitHub Actions ceiling so build and tests agree.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=6144"

echo "--- Building CLI"
npm run build

echo "--- Setting up Cloud credentials"
source .buildkite/setup-env.sh

echo "+++ Running Cloud smoke tests"
npm run test:functional:cloud
