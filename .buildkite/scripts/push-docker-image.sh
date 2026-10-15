#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Push docker.elastic.co/clients/elastic-cli for linux/amd64 and linux/arm64.
# usage: push-docker-image.sh [<version> <amd64-binary> <arm64-binary>]
# With no args, version is BUILDKITE_TAG and both linux binaries are compiled.

set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
image=docker.elastic.co/clients/elastic-cli
secret_path=${DEVTOOLSMACHINE_SECRET:-secret/ci/elastic-cli/devtoolsmachine}

if [[ $# -eq 3 ]]; then
  version=$1
  amd64=$2
  arm64=$3
elif [[ $# -eq 0 ]]; then
  version=${BUILDKITE_TAG:?BUILDKITE_TAG must be set}
  amd64=""
  arm64=""
else
  echo "usage: push-docker-image.sh [<version> <amd64-binary> <arm64-binary>]" >&2
  exit 1
fi

version=${version#v}
if [[ -z "$version" || "$version" == *..* || ! "$version" =~ ^[A-Za-z0-9._+-]+$ ]]; then
  echo "invalid version: $version" >&2
  exit 1
fi

if [[ -n "$amd64" || -n "$arm64" ]]; then
  if [[ ! -f "$amd64" || ! -f "$arm64" ]]; then
    echo "binary not found" >&2
    exit 1
  fi
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required on the release agent" >&2
  exit 1
fi

password=$(vault read -field=password "$secret_path")
if [[ -z "$password" ]]; then
  echo "empty devtoolsmachine password" >&2
  exit 1
fi

printf '%s' "$password" | docker login --username devtoolsmachine --password-stdin docker.elastic.co

compile_linux() {
  local dest=$PWD
  (
    cd "$root"
    : "${BUN_VERSION:?BUN_VERSION must be set}"
    export BUN_INSTALL="${dest}/.bun"
    export PATH="${BUN_INSTALL}/bin:${PATH}"
    if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version)" != "${BUN_VERSION}" ]]; then
      if [[ "$(uname -s)" != "Linux" ]]; then
        echo "linux binaries are compiled on a Linux agent, got: $(uname -s)" >&2
        exit 1
      fi
      case "$(uname -m)" in
        x86_64) bun_install_target="bun-linux-x64" ;;
        aarch64 | arm64) bun_install_target="bun-linux-aarch64" ;;
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
      curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${bun_install_target}.zip" -o "${tmp}/bun.zip"
      unzip -q "${tmp}/bun.zip" -d "${tmp}"
      mkdir -p "${BUN_INSTALL}/bin"
      install -m 0755 "${tmp}/${bun_install_target}/bun" "${BUN_INSTALL}/bin/bun"
      rm -rf "${tmp}"
    fi
    bun install
    bunx tsc -b packages/config-resolver
    bunx tsc -b packages/agent-env
    bun scripts/generate-schema-loaders.mjs
    bun build src/bun-entry.ts --compile --minify --bytecode --format esm \
      --outfile "${dest}/elastic-linux-x64" --target bun-linux-x64
    bun build src/bun-entry.ts --compile --minify --bytecode --format esm \
      --outfile "${dest}/elastic-linux-arm64" --target bun-linux-arm64
  )
  amd64=${dest}/elastic-linux-x64
  arm64=${dest}/elastic-linux-arm64
}

if [[ -z "$amd64" ]]; then
  compile_linux
fi

push_arch() {
  local platform=$1
  local binary=$2
  local arch=$3
  DOCKER_PUSH=1 IMAGE_TAG_SUFFIX="-$arch" \
    "$root/scripts/build-docker-image.sh" "$version" "$binary" "$platform"
}

push_arch linux/amd64 "$amd64" amd64
push_arch linux/arm64 "$arm64" arm64

docker buildx imagetools create \
  --tag "$image:$version" \
  "$image:$version-amd64" \
  "$image:$version-arm64"

digest=$(docker buildx imagetools inspect --format '{{.Digest}}' "$image:$version")
digest=${digest//\"/}
digest=${digest//$'\n'/}
if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "unexpected image digest: $digest" >&2
  exit 1
fi
printf '%s@%s\n' "$image" "$digest" > elastic-cli-container-images-digest.txt
