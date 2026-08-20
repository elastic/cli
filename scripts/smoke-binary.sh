#!/usr/bin/env bash
# Smoke-test a compiled elastic binary. Exit non-zero if bun is missing modules.
set -euo pipefail

bin=${1:?usage: smoke-binary.sh <binary>}

"$bin" --help
"$bin" --version
"$bin" stack es search --help
"$bin" kb agent-builder get-agent-builder-agents --help
"$bin" cloud auth get-api-keys --help

set +e
out=$("$bin" status 2>&1)
set -e
if printf '%s\n' "$out" | grep -E 'Cannot find (module|package)'; then
  printf '%s\n' "$out"
  exit 1
fi
