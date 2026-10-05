#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Gate publish. Hardened runtime without these two entitlements kills a
# bun binary on launch. --help is not a JIT check; the signature is.

set -euo pipefail

dir="${1:-final}"
keys=(
  com.apple.security.cs.allow-jit
  com.apple.security.cs.allow-unsigned-executable-memory
)

for name in elastic-macos-x64 elastic-macos-arm64; do
  bin="${dir}/${name}"
  if [[ ! -f "$bin" || -L "$bin" ]]; then
    echo "missing ${name}" >&2
    exit 1
  fi
  codesign --verify --strict "$bin"
  entitlements="$(codesign -d --entitlements :- "$bin" 2>/dev/null || true)"
  for key in "${keys[@]}"; do
    if ! grep -Fq "<key>${key}</key>" <<<"$entitlements"; then
      echo "missing ${key} on ${name}" >&2
      exit 1
    fi
  done
done
