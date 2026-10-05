#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Upload the signed macOS and Windows assets.
# Linux assets stay on the GitHub release workflow.

set -euo pipefail

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "$token" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN must be set" >&2
  exit 1
fi
export GH_TOKEN="$token"

if [[ -z "${BUILDKITE_TAG:-}" ]]; then
  echo "BUILDKITE_TAG must be set" >&2
  exit 1
fi

repo="${GH_REPO:-elastic/cli}"
assets=(
  final/elastic-macos-x64
  final/elastic-macos-arm64
  final/elastic-windows-x64.exe
  final/elastic-windows-arm64.exe
)
for f in "${assets[@]}"; do
  if [[ ! -f "$f" || -L "$f" ]]; then
    echo "missing ${f}" >&2
    exit 1
  fi
done

gh release upload "$BUILDKITE_TAG" "${assets[@]}" --repo "$repo" --clobber
