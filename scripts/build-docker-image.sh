#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Build docker.elastic.co/clients/elastic-cli. Does not push.
# usage: build-docker-image.sh <version> <binary> [platform]

set -euo pipefail

version=${1:?usage: build-docker-image.sh <version> <binary> [platform]}
binary=${2:?usage: build-docker-image.sh <version> <binary> [platform]}
platform=${3:-}

if [[ "$version" == *..* || ! "$version" =~ ^[A-Za-z0-9._+-]+$ ]]; then
  echo "invalid version: $version" >&2
  exit 1
fi

if [[ -n "$platform" && "$platform" != linux/amd64 && "$platform" != linux/arm64 ]]; then
  echo "invalid platform: $platform" >&2
  exit 1
fi

if [[ ! -f "$binary" ]]; then
  echo "binary not found: $binary" >&2
  exit 1
fi

root=$(cd "$(dirname "$0")/.." && pwd)
license="$root/LICENSE"
notice="$root/NOTICE.txt"
if [[ ! -f "$license" || ! -f "$notice" ]]; then
  echo "LICENSE or NOTICE.txt missing" >&2
  exit 1
fi

created=${CREATED:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}
revision=${GIT_REVISION:-$(git -C "$root" rev-parse HEAD)}

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

cp "$binary" "$workdir/elastic"
chmod 755 "$workdir/elastic"
cp "$license" "$workdir/LICENSE.txt"
cp "$notice" "$workdir/NOTICE.txt"

args=(
  build
  --file "$root/distribution/docker/Dockerfile"
  --build-arg "VERSION=$version"
  --build-arg "REVISION=$revision"
  --build-arg "CREATED=$created"
  --tag "docker.elastic.co/clients/elastic-cli:$version"
)
if [[ -n "$platform" ]]; then
  args+=(--platform "$platform")
fi
args+=("$workdir")

docker "${args[@]}"
