#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# The signing service must change the bytes. An unchanged file was not signed.
# Windows exes also have to verify as Authenticode.

set -euo pipefail

unsigned="${1:?usage: verify-signed-payload.sh UNSIGNED_DIR SIGNED_DIR}"
signed="${2:?usage: verify-signed-payload.sh UNSIGNED_DIR SIGNED_DIR}"

for name in elastic-macos-x64 elastic-macos-arm64 elastic-windows-x64.exe elastic-windows-arm64.exe; do
  if [[ ! -f "${unsigned}/${name}" || -L "${unsigned}/${name}" ]]; then
    echo "missing unsigned ${name}" >&2
    exit 1
  fi
  if [[ ! -f "${signed}/${name}" || -L "${signed}/${name}" ]]; then
    echo "missing signed ${name}" >&2
    exit 1
  fi
  if cmp -s "${unsigned}/${name}" "${signed}/${name}"; then
    echo "${name} is unchanged from the unsigned build" >&2
    exit 1
  fi
done

for name in elastic-windows-x64.exe elastic-windows-arm64.exe; do
  osslsigncode verify -in "${signed}/${name}"
done
