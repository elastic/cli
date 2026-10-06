#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Cross-compile the four binaries that get signed. Linux stays on
# .github/workflows/release-artifacts.yml. Bun 1.3.12 emits Mach-O that
# codesign rejects (fixed in 1.3.13).

set -euo pipefail

: "${BUN_VERSION:?BUN_VERSION must be set}"

export BUN_INSTALL="${PWD}/.bun"
export PATH="${BUN_INSTALL}/bin:${PATH}"

if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version)" != "${BUN_VERSION}" ]]; then
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This step expects a Linux agent, got: $(uname -s)" >&2
    exit 1
  fi
  case "$(uname -m)" in
    x86_64) target="bun-linux-x64" ;;
    aarch64 | arm64) target="bun-linux-aarch64" ;;
    *)
      echo "unsupported arch: $(uname -m)" >&2
      exit 1
      ;;
  esac
  if ! command -v unzip >/dev/null 2>&1; then
    echo "unzip is required to install bun" >&2
    exit 1
  fi
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${target}.zip" -o "${tmp}/bun.zip"
  unzip -q "${tmp}/bun.zip" -d "${tmp}"
  mkdir -p "${BUN_INSTALL}/bin"
  install -m 0755 "${tmp}/${target}/bun" "${BUN_INSTALL}/bin/bun"
  rm -rf "${tmp}"
fi

echo "Using bun $(bun --version)"
bun install
bunx tsc -b packages/config-resolver
bunx tsc -b packages/agent-env
bun scripts/generate-schema-loaders.mjs

compile() {
  local outfile="$1"
  local bun_target="$2"
  bun build src/bun-entry.ts \
    --compile \
    --minify \
    --bytecode \
    --format esm \
    --outfile "$outfile" \
    --target "$bun_target"
}

compile elastic-macos-x64 bun-darwin-x64
compile elastic-macos-arm64 bun-darwin-arm64
compile elastic-windows-x64.exe bun-windows-x64
compile elastic-windows-arm64.exe bun-windows-arm64
