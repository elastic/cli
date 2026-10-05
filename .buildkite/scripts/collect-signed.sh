#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Download signed artifacts from the two unified-release builds and
# leave raw binaries under final/ (same names release-artifacts.yml uploads).

set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

: "${BUILDKITE_READ_PATH:=secret/ci/elastic-cli/buildkite-read}"
BUILDKITE_TOKEN_SECRET="$(vault read -field=buildkite_token "$BUILDKITE_READ_PATH")"
export BUILDKITE_TOKEN_SECRET
if [[ -z "$BUILDKITE_TOKEN_SECRET" ]]; then
  echo "vault returned an empty buildkite token" >&2
  exit 1
fi

mac_build="$(lookup_triggered_build_id macos-sign-service)"
win_build="$(lookup_triggered_build_id windows-sign-service)"

mkdir -p final work/mac work/win
buildkite-agent artifact download --build "$mac_build" "elastic-macos-*.tar.gz" work/mac/
buildkite-agent artifact download --build "$win_build" "elastic-windows-*.exe" work/win/

shopt -s nullglob
archives=(work/mac/elastic-macos-*.tar.gz)
if ((${#archives[@]} != 2)); then
  echo "expected 2 signed macOS archives, got ${#archives[@]}" >&2
  exit 1
fi

for archive in "${archives[@]}"; do
  name="$(basename "$archive" .tar.gz)"
  tar -xzf "$archive" -C work/mac
  if [[ ! -f "work/mac/${name}" || -L "work/mac/${name}" ]]; then
    echo "signed binary ${name} not at archive root" >&2
    exit 1
  fi
  cp "work/mac/${name}" "final/${name}"
done

exes=(work/win/elastic-windows-*.exe)
if ((${#exes[@]} != 2)); then
  echo "expected 2 signed Windows exes, got ${#exes[@]}" >&2
  exit 1
fi
for exe in "${exes[@]}"; do
  if [[ -L "$exe" ]]; then
    echo "refusing symlink $(basename "$exe")" >&2
    exit 1
  fi
  cp "$exe" "final/$(basename "$exe")"
done
