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
const script = join(root, '.buildkite/scripts/push-docker-image.sh')
const releaseYml = join(root, '.buildkite/release.yml')
const digest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

function bashPath (p: string): string {
  if (process.platform !== 'win32') return p
  const slashed = p.replaceAll('\\', '/')
  const drive = /^([A-Za-z]):\/(.*)$/.exec(slashed)
  if (!drive) return slashed
  return `/${drive[1].toLowerCase()}/${drive[2]}`
}

async function fakes (dir: string) {
  const bin = join(dir, 'bin')
  await mkdir(bin)
  const dockerLog = join(dir, 'docker-log')
  const dockerStdin = join(dir, 'docker-stdin')
  const vaultLog = join(dir, 'vault-log')
  const bunLog = join(dir, 'bun-log')
  await writeFile(join(bin, 'docker'), `#!/usr/bin/env bash
{
  printf '%s\\n' "$@"
  echo '---'
} >> "$DOCKER_LOG"
if [[ "$1" == login ]]; then
  cat > "$DOCKER_STDIN"
fi
if [[ "$*" == *inspect* ]]; then
  printf '%s\\n' "$INSPECT_DIGEST"
fi
`)
  await writeFile(join(bin, 'vault'), `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$VAULT_LOG"
if [[ "$1" == read && "$2" == -field=password ]]; then
  printf '%s' "$VAULT_PASSWORD"
  exit 0
fi
exit 1
`)
  await writeFile(join(bin, 'bun'), `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$BUN_LOG"
if [[ "$1" == --version ]]; then
  printf '%s\\n' "$BUN_VERSION"
  exit 0
fi
if [[ "$1" == install || "$1" == scripts/generate-schema-loaders.mjs ]]; then
  exit 0
fi
if [[ "$1" == build ]]; then
  prev=""
  for arg in "$@"; do
    if [[ "$prev" == --outfile ]]; then printf 'bin' > "$arg"; fi
    prev=$arg
  done
  exit 0
fi
exit 1
`)
  await writeFile(join(bin, 'bunx'), '#!/usr/bin/env bash\nexit 0\n')
  for (const name of ['docker', 'vault', 'bun', 'bunx']) {
    await chmod(join(bin, name), 0o755)
  }
  return { bin, dockerLog, dockerStdin, vaultLog, bunLog }
}

function run (cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync('bash', [bashPath(script), ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('release.yml image push', () => {
  it('runs only on version tags and does not gate signing', async () => {
    const yml = await readFile(releaseYml, 'utf8')
    const steps = yml.split(/\n {2}- /).slice(1)
    const push = steps.find(step => step.includes('key: push-image'))
    assert.ok(push)
    assert.match(push, /if: build\.tag =~ \/\^v\//)
    assert.match(push, /push-docker-image\.sh/)
    assert.doesNotMatch(push, /depends_on:/)
    for (const step of steps) {
      if (step.includes('key: push-image')) continue
      assert.doesNotMatch(step, /push-image/)
    }
  })
})

describe('push-docker-image.sh', () => {
  it('logs in with the password on stdin and pushes both arches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin, vaultLog } = await fakes(dir)
      const amd64 = join(dir, 'amd64')
      const arm64 = join(dir, 'arm64')
      await writeFile(amd64, 'a')
      await writeFile(arm64, 'b')
      const result = run(dir, [bashPath('v0.6.0'), bashPath(amd64), bashPath(arm64)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        VAULT_LOG: bashPath(vaultLog),
        VAULT_PASSWORD: 's3cret',
        INSPECT_DIGEST: digest,
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
      })
      assert.equal(result.status, 0, result.stderr)
      const log = await readFile(dockerLog, 'utf8')
      assert.equal(log.includes('s3cret'), false)
      assert.equal(await readFile(dockerStdin, 'utf8'), 's3cret')
      assert.match(await readFile(vaultLog, 'utf8'), /secret\/ci\/elastic-cli\/devtoolsmachine/)
      const calls = log.split('---\n').filter(Boolean)
      assert.match(calls[0], /^login\n--username\ndevtoolsmachine\n--password-stdin\ndocker\.elastic\.co\n/)
      assert.match(calls[1], /buildx\nbuild\n--push[\s\S]*docker\.elastic\.co\/clients\/elastic-cli:0\.6\.0-amd64[\s\S]*linux\/amd64/)
      assert.match(calls[2], /docker\.elastic\.co\/clients\/elastic-cli:0\.6\.0-arm64[\s\S]*linux\/arm64/)
      assert.match(calls[3], /imagetools\ncreate\n--tag\ndocker\.elastic\.co\/clients\/elastic-cli:0\.6\.0\n/)
      assert.equal(
        await readFile(join(dir, 'elastic-cli-container-images-digest.txt'), 'utf8'),
        `docker.elastic.co/clients/elastic-cli@${digest}\n`,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects a bad version and a missing binary before vault', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, vaultLog } = await fakes(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const env = {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        VAULT_LOG: bashPath(vaultLog),
        VAULT_PASSWORD: 's3cret',
      }
      for (const version of ['../', '1.2.3;touch /tmp/pwn', '?#', 'v']) {
        const result = run(dir, [version, bashPath(binary), bashPath(binary)], env)
        assert.notEqual(result.status, 0, version)
      }
      const missing = run(dir, ['0.6.0', bashPath(join(dir, 'nope')), bashPath(binary)], env)
      assert.notEqual(missing.status, 0)
      await assert.rejects(readFile(vaultLog, 'utf8'))
      await assert.rejects(readFile(dockerLog, 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('compiles both linux binaries when only the tag is set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin, bunLog } = await fakes(dir)
      const result = run(dir, [], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        VAULT_LOG: join(dir, 'vault-log'),
        VAULT_PASSWORD: 's3cret',
        BUN_LOG: bashPath(bunLog),
        BUN_VERSION: '1.3.14',
        BUILDKITE_TAG: 'v0.6.0',
        INSPECT_DIGEST: digest,
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
      })
      assert.equal(result.status, 0, result.stderr)
      const compiled = await readFile(bunLog, 'utf8')
      assert.match(compiled, /--target\nbun-linux-x64/)
      assert.match(compiled, /--target\nbun-linux-arm64/)
      assert.equal((await readFile(dockerLog, 'utf8')).includes('s3cret'), false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stops before login when the vault password is empty', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, vaultLog } = await fakes(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const result = run(dir, ['0.6.0', bashPath(binary), bashPath(binary)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        VAULT_LOG: bashPath(vaultLog),
        VAULT_PASSWORD: '',
      })
      assert.notEqual(result.status, 0)
      assert.match(await readFile(vaultLog, 'utf8'), /devtoolsmachine/)
      await assert.rejects(readFile(dockerLog, 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects an image digest that is not sha256', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin } = await fakes(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const result = run(dir, ['0.6.0', bashPath(binary), bashPath(binary)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        VAULT_LOG: join(dir, 'vault-log'),
        VAULT_PASSWORD: 's3cret',
        INSPECT_DIGEST: 'not-a-digest',
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
      })
      assert.notEqual(result.status, 0)
      await assert.rejects(readFile(join(dir, 'elastic-cli-container-images-digest.txt'), 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
