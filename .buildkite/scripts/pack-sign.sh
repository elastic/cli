#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Stage artifacts-to-sign/ for the unified-release signing pipelines.
# Darwin binaries are tar.gz. The mac signer ignores an archive whose top
# level is a file, so each binary sits in a directory of the same name.
# Windows binaries stay raw .exe. A zip with no Mach-O makes the mac signer,
# which downloads artifacts-to-sign/* with no filter, fail.

set -euo pipefail

src="${1:?usage: pack-sign.sh DOWNLOAD_DIR [OUT_DIR]}"
out="${2:-artifacts-to-sign}"

if [[ ! -d "$src" ]]; then
  echo "not a directory: ${src}" >&2
  exit 1
fi

mkdir -p "$out"

stage_regular() {
  local name="$1"
  local bin="${src}/${name}"
  if [[ -L "$bin" ]]; then
    echo "refusing symlink ${name}" >&2
    exit 1
  fi
  if [[ ! -f "$bin" ]]; then
    echo "missing ${name}" >&2
    exit 1
  fi
}

for name in elastic-macos-x64 elastic-macos-arm64; do
  stage_regular "$name"
  stage="$(mktemp -d)"
  mkdir -p "${stage}/${name}"
  cp "${src}/${name}" "${stage}/${name}/${name}"
  tar -czf "${out}/${name}.tar.gz" -C "$stage" "$name"
  rm -rf "$stage"
done

for name in elastic-windows-x64.exe elastic-windows-arm64.exe; do
  stage_regular "$name"
  cp "${src}/${name}" "${out}/${name}"
done
