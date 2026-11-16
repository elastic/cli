#!/usr/bin/env bash
# Copyright Elasticsearch B.V. and contributors
# SPDX-License-Identifier: Apache-2.0
#
# Push docker.elastic.co/clients/elastic-cli for linux/amd64 and linux/arm64.
# usage: push-docker-image.sh --from-release
#        push-docker-image.sh <version> <amd64-binary> <arm64-binary>
# --from-release downloads elastic-linux-x64 and elastic-linux-arm64 from the
# GitHub release. Those are the binaries release-artifacts.yml smoke-tests.

set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
image=docker.elastic.co/clients/elastic-cli
secret_path=${DEVTOOLSMACHINE_SECRET:-secret/ci/elastic-cli/devtoolsmachine}

from_release=0
if [[ $# -eq 1 && "$1" == --from-release ]]; then
  from_release=1
  version=${BUILDKITE_TAG:?BUILDKITE_TAG must be set}
  amd64=""
  arm64=""
elif [[ $# -eq 3 ]]; then
  version=$1
  amd64=$2
  arm64=$3
else
  echo "usage: push-docker-image.sh --from-release | <version> <amd64-binary> <arm64-binary>" >&2
  exit 1
fi

version=${version#v}
# Docker tags reject '+', so semver build metadata is out.
if [[ -z "$version" || "$version" == *..* || ! "$version" =~ ^[A-Za-z0-9._-]+$ ]]; then
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
if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required on the release agent" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [[ "$from_release" == 1 ]]; then
  token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [[ -z "$token" ]]; then
    echo "GH_TOKEN or GITHUB_TOKEN must be set" >&2
    exit 1
  fi
  export GH_TOKEN="$token"
  unset token
  bins="$work/bins"
  mkdir -p "$bins"
  downloaded=0
  for _ in $(seq 1 60); do
    if gh release download "$BUILDKITE_TAG" \
      --repo "${GH_REPO:-elastic/cli}" \
      --dir "$bins" \
      --clobber \
      --pattern elastic-linux-x64 \
      --pattern elastic-linux-arm64
    then
      downloaded=1
      break
    fi
    # Git bash on Windows runs sleep.exe ahead of a PATH script named sleep.
    "${RELEASE_DOWNLOAD_PAUSE:-sleep}" 15
  done
  if [[ "$downloaded" != 1 ]]; then
    echo "linux release assets not on ${BUILDKITE_TAG}" >&2
    exit 1
  fi
  amd64="$bins/elastic-linux-x64"
  arm64="$bins/elastic-linux-arm64"
  for f in "$amd64" "$arm64"; do
    if [[ ! -f "$f" || -L "$f" || ! -s "$f" ]]; then
      echo "linux release asset missing: $f" >&2
      exit 1
    fi
  done
fi

# Login lives in a private config so a reused agent does not keep the password.
docker_config="$work/docker"
mkdir -p "$docker_config"
export DOCKER_CONFIG="$docker_config"

password=$(vault read -field=password "$secret_path")
if [[ -z "$password" ]]; then
  echo "empty devtoolsmachine password" >&2
  exit 1
fi

printf '%s' "$password" | docker login --username devtoolsmachine --password-stdin docker.elastic.co
unset password

push_arch() {
  local platform=$1
  local binary=$2
  local raw digest
  # buildx writes the digest on stderr. stdout is empty.
  raw=$(DOCKER_PUSH=1 DOCKER_PUSH_BY_DIGEST=1 \
    "$root/scripts/build-docker-image.sh" "$version" "$binary" "$platform" 2>&1 >/dev/null)
  digest=$(printf '%s\n' "$raw" | grep -oE 'sha256:[a-f0-9]{64}' | tail -n 1) || true
  if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "unexpected arch digest: $raw" >&2
    exit 1
  fi
  printf '%s\n' "$digest"
}

amd64_digest=$(push_arch linux/amd64 "$amd64")
arm64_digest=$(push_arch linux/arm64 "$arm64")

create_args=(buildx imagetools create --tag "$image:$version")
# Major and minor aliases go stale. latest tracks a stable x.y.z only.
if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  create_args+=(--tag "$image:latest")
fi
create_args+=("$image@$amd64_digest" "$image@$arm64_digest")
docker "${create_args[@]}"

digest=$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:$version")
digest=${digest//\"/}
digest=${digest//$'\n'/}
if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "unexpected image digest: $digest" >&2
  exit 1
fi
printf '%s@%s\n' "$image" "$digest" > elastic-cli-container-images-digest.txt
