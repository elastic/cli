/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = join(root, 'scripts/build-docker-image.sh')
const dockerfile = join(root, 'distribution/docker/Dockerfile')

function bashPath (p: string): string {
  if (process.platform !== 'win32') return p
  const slashed = p.replaceAll('\\', '/')
  const drive = /^([A-Za-z]):\/(.*)$/.exec(slashed)
  if (!drive) return slashed
  return `/${drive[1].toLowerCase()}/${drive[2]}`
}

async function fakeDocker (dir: string): Promise<{ bin: string, log: string }> {
  const bin = join(dir, 'bin')
  await mkdir(bin)
  const log = join(dir, 'docker-log')
  const fake = join(bin, 'docker')
  await writeFile(fake, `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$DOCKER_LOG"
context="\${@: -1}"
if [[ -f "$context/elastic" ]]; then
  if stat -c %a "$context/elastic" >/dev/null 2>&1; then
    mode=$(stat -c %a "$context/elastic")
  else
    mode=$(stat -f %Lp "$context/elastic")
  fi
  printf 'MODE %s\\n' "$mode" >> "$DOCKER_LOG"
  printf 'FILES' >> "$DOCKER_LOG"
  for f in "$context"/*; do printf ' %s' "$(basename "$f")" >> "$DOCKER_LOG"; done
  printf '\\n' >> "$DOCKER_LOG"
fi
`)
  await chmod(fake, 0o755)
  return { bin, log }
}

function run (args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync('bash', [bashPath(script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('distribution/docker/Dockerfile', () => {
  it('pins chainguard-base and the release labels', async () => {
    const text = await readFile(dockerfile, 'utf8')
    assert.match(text, /FROM docker\.elastic\.co\/wolfi\/chainguard-base:latest@sha256:568df5fb0e237c3a2139399d4bd8e80994f24321fa8469aec565b8566704e83a/)
    assert.match(text, /ENV ELASTIC_CONTAINER=true/)
    assert.match(text, /USER 65532/)
    assert.match(text, /HEALTHCHECK NONE/)
    assert.match(text, /COPY LICENSE\.txt NOTICE\.txt \/licenses\//)
    for (const label of [
      'org.opencontainers.image.created',
      'org.opencontainers.image.title',
      'org.opencontainers.image.description',
      'org.opencontainers.image.vendor',
      'org.opencontainers.image.version',
      'org.opencontainers.image.licenses',
      'org.opencontainers.image.source',
      'org.opencontainers.image.url',
      'org.opencontainers.image.documentation',
      'org.opencontainers.image.revision',
      'org.label-schema.build-date',
      'org.label-schema.license',
      'org.label-schema.name',
      'org.label-schema.schema-version',
      'org.label-schema.url',
      'org.label-schema.usage',
      'org.label-schema.vcs-ref',
      'org.label-schema.vcs-url',
      'org.label-schema.vendor',
      'org.label-schema.version',
      'maintainer="infra@elastic.co"',
    ]) {
      assert.ok(text.includes(label), label)
    }
  })
})

describe('build-docker-image.sh', () => {
  it('builds a tagged image and does not push', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-image-'))
    try {
      const { bin, log } = await fakeDocker(dir)
      const binary = join(dir, 'my binary')
      await writeFile(binary, '#!/bin/sh\n')
      const result = run([bashPath('0.6.0'), bashPath(binary), 'linux/arm64'], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
        DOCKER_LOG: bashPath(log),
      })
      assert.equal(result.status, 0, result.stderr)
      const recorded = await readFile(log, 'utf8')
      const lines = recorded.split('\n')
      assert.deepEqual(lines.slice(0, 11), [
        'build',
        '--file',
        bashPath(dockerfile),
        '--build-arg',
        'VERSION=0.6.0',
        '--build-arg',
        'REVISION=abc123',
        '--build-arg',
        'CREATED=2020-01-02T03:04:05Z',
        '--tag',
        'docker.elastic.co/clients/elastic-cli:0.6.0',
      ])
      assert.deepEqual(lines.slice(11, 13), ['--platform', 'linux/arm64'])
      assert.equal(lines.includes('--push'), false)
      assert.match(recorded, /MODE 755/)
      assert.match(recorded, /FILES .*elastic/)
      assert.match(recorded, /LICENSE\.txt/)
      assert.match(recorded, /NOTICE\.txt/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects missing and unexpected version strings before docker runs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'elastic-image-'))
    try {
      const { bin, log } = await fakeDocker(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const env = { PATH: `${bin}${delimiter}${process.env.PATH}`, DOCKER_LOG: bashPath(log) }
      for (const version of ['', '../', '1.2.3;touch /tmp/pwn', '1 2', '?#', '..', 'foo/bar']) {
        const args = version === '' ? [] : [version, bashPath(binary)]
        const result = run(args, env)
        assert.notEqual(result.status, 0, version)
      }
      await assert.rejects(readFile(log, 'utf8'))
      const missing = run(['0.6.0', bashPath(join(dir, 'nope'))], env)
      assert.notEqual(missing.status, 0)
      const badPlatform = run(['0.6.0', bashPath(binary), 'linux/amd64;id'], env)
      assert.notEqual(badPlatform.status, 0)
      await assert.rejects(readFile(log, 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
