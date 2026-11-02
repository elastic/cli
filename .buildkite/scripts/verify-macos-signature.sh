#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Gate publish. Hardened runtime without these two entitlements kills a
# bun binary on launch. --help is not a JIT check; the signature is.
# codesign --verify --strict also passes an ad-hoc signature, which is what
# bun writes before the signing service runs.

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
  details="$(codesign -dv "$bin" 2>&1 || true)"
  if grep -Fq 'Signature=adhoc' <<<"$details"; then
    echo "${name} is ad-hoc signed" >&2
    exit 1
  fi
  if ! grep -Fq 'Authority=Developer ID Application: Elasticsearch, Inc' <<<"$details"; then
    echo "${name} is not Developer ID signed" >&2
    exit 1
  fi
  entitlements="$(codesign -d --entitlements :- "$bin" 2>/dev/null || true)"
  compact="$(tr -d '[:space:]' <<<"$entitlements")"
  for key in "${keys[@]}"; do
    if ! grep -Fq "<key>${key}</key><true/>" <<<"$compact"; then
      echo "missing ${key} on ${name}" >&2
      exit 1
    fi
  done
done
