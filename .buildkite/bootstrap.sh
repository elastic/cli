#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Shared Buildkite bootstrap for nvm and jq. Callers source this file, then
# run install_nvm and/or install_jq. Downloads are verified against SHA-256
# values stored in this file (not against checksums fetched from the same host).

# nvm v0.39.7, immutable commit (not the movable tag).
NVM_COMMIT="bab86d5de571015b63fd8fc30b47bbe072a1290e"
NVM_INSTALL_SHA256="8e45fa547f428e9196a5613efad3bfa4d4608b74ca870f930090598f5af5f643"

JQ_VERSION="1.7.1"
JQ_SHA256_LINUX_AMD64="5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5"
JQ_SHA256_LINUX_ARM64="4dd2d8a0661df0b22f1bb9a1f9830f06b6f3b8f7d91211a1ef5d7c4f06a8b4a5"

verify_sha256 () {
  local file="$1"
  local expected="$2"
  local actual
  actual="$(sha256sum "$file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for ${file}: got ${actual}, want ${expected}" >&2
    exit 1
  fi
}

install_nvm () {
  if [ -z "${NODE_VERSION:-}" ]; then
    echo "NODE_VERSION is not set; skipping nvm" >&2
    return 0
  fi
  echo "--- Setting up Node.js ${NODE_VERSION}"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "nvm not found, installing commit ${NVM_COMMIT}"
    mkdir -p "$NVM_DIR"
    local installer
    installer="$(mktemp)"
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_COMMIT}/install.sh" -o "$installer"
    verify_sha256 "$installer" "$NVM_INSTALL_SHA256"
    bash "$installer"
    rm -f "$installer"
  fi
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION"
  nvm use "$NODE_VERSION"
}

install_jq () {
  local arch asset expected dest
  arch="$(uname -m)"
  case "$arch" in
    x86_64)
      asset="jq-linux-amd64"
      expected="$JQ_SHA256_LINUX_AMD64"
      ;;
    aarch64|arm64)
      asset="jq-linux-arm64"
      expected="$JQ_SHA256_LINUX_ARM64"
      ;;
    *)
      echo "unsupported architecture for jq: ${arch}" >&2
      exit 1
      ;;
  esac
  echo "--- Installing jq ${JQ_VERSION} (${asset})"
  if jq --version 2>/dev/null | grep -q "$JQ_VERSION"; then
    echo "Using jq $(jq --version)"
    return 0
  fi
  dest="$HOME/.local/bin"
  mkdir -p "$dest"
  curl -fsSL "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/${asset}" -o "${dest}/jq"
  verify_sha256 "${dest}/jq" "$expected"
  chmod +x "${dest}/jq"
  export PATH="${dest}:$PATH"
  echo "Using jq $(jq --version)"
}
