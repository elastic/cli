/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = join(root, '.buildkite/scripts/push-docker-image.sh')
const releaseYml = join(root, '.buildkite/release.yml')
const digest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const amdDigest = `sha256:${'a'.repeat(64)}`
const armDigest = `sha256:${'b'.repeat(64)}`
const decoyDigest = `sha256:${'0'.repeat(64)}`

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
  const dockerCfg = join(dir, 'docker-cfg')
  const vaultLog = join(dir, 'vault-log')
  const ghLog = join(dir, 'gh-log')
  const ghCount = join(dir, 'gh-count')
  const sleepLog = join(dir, 'sleep-log')
  await writeFile(join(bin, 'docker'), `#!/usr/bin/env bash
{
  printf '%s\\n' "$@"
  if [[ "$1" == buildx && "$2" == build ]]; then
    context="\${@: -1}"
    if [[ -f "$context/elastic" ]]; then
      printf 'CONTEXT:%s\\n' "$(cat "$context/elastic")"
    fi
  fi
  echo '---'
} >> "$DOCKER_LOG"
if [[ "$1" == login ]]; then
  cat > "$DOCKER_STDIN"
fi
if [[ -n "\${DOCKER_CFG:-}" ]]; then
  printf '%s' "\${DOCKER_CONFIG:-}" > "$DOCKER_CFG"
fi
if [[ "$1" == buildx && "$2" == version ]]; then
  if [[ "\${FAIL_BUILDX:-}" == 1 ]]; then
    echo "no buildx" >&2
    exit 1
  fi
  exit 0
fi
if [[ "$*" == *push-by-digest=true* ]]; then
  if [[ "$*" == *linux/arm64* ]]; then
    printf '%s\\n' "${armDigest}" >&2
  else
    printf '%s\\n' "${amdDigest}" >&2
  fi
  printf '%s\\n' "${decoyDigest}"
fi
if [[ "$*" == *inspect* ]]; then
  format=""
  prev=""
  for arg in "$@"; do
    if [[ "$prev" == --format ]]; then format=$arg; fi
    prev=$arg
  done
  if [[ "$format" != '{{.Manifest.Digest}}' ]]; then
    echo "unexpected inspect format: $format" >&2
    exit 1
  fi
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
  await writeFile(join(bin, 'gh'), `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$GH_LOG"
if [[ "$1" != release || "$2" != download ]]; then
  echo "unexpected gh: $*" >&2
  exit 1
fi
dir=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == --dir ]]; then dir=$arg; fi
  prev=$arg
done
count=0
if [[ -f "$GH_COUNT" ]]; then count=$(cat "$GH_COUNT"); fi
count=$((count + 1))
printf '%s' "$count" > "$GH_COUNT"
fails=\${GH_FAILS:-0}
if [[ "$count" -le "$fails" ]]; then
  echo "asset not found" >&2
  exit 1
fi
if [[ "\${GH_LINK:-}" == 1 ]]; then
  ln -s /etc/passwd "$dir/elastic-linux-x64"
  ln -s /etc/passwd "$dir/elastic-linux-arm64"
  exit 0
fi
if [[ "\${GH_AMD+x}" == x ]]; then printf '%s' "$GH_AMD" > "$dir/elastic-linux-x64"
else printf '%s' amd-bytes > "$dir/elastic-linux-x64"; fi
if [[ "\${GH_ARM+x}" == x ]]; then printf '%s' "$GH_ARM" > "$dir/elastic-linux-arm64"
else printf '%s' arm-bytes > "$dir/elastic-linux-arm64"; fi
`)
  await writeFile(join(bin, 'sleep'), `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$SLEEP_LOG"
`)
  for (const name of ['docker', 'vault', 'gh', 'sleep']) {
    await chmod(join(bin, name), 0o755)
  }
  return { bin, dockerLog, dockerStdin, dockerCfg, vaultLog, ghLog, ghCount, sleepLog }
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
    assert.match(push, /push-docker-image\.sh --from-release/)
    assert.match(push, /vault-github-token/)
    assert.match(push, /gh-cli/)
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
      const { bin, dockerLog, dockerStdin, dockerCfg, vaultLog } = await fakes(dir)
      const amd64 = join(dir, 'amd64')
      const arm64 = join(dir, 'arm64')
      await writeFile(amd64, 'a')
      await writeFile(arm64, 'b')
      const result = run(dir, [bashPath('v0.6.0'), bashPath(amd64), bashPath(arm64)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        DOCKER_CFG: bashPath(dockerCfg),
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
      assert.match(calls[0], /^buildx\nversion\n/)
      assert.match(calls[1], /^login\n--username\ndevtoolsmachine\n--password-stdin\ndocker\.elastic\.co\n/)
      assert.match(calls[2], /buildx\nbuild\n--output\ntype=image,name=docker\.elastic\.co\/clients\/elastic-cli,push-by-digest=true,name-canonical=true,push=true[\s\S]*linux\/amd64/)
      assert.match(calls[3], /push-by-digest=true[\s\S]*linux\/arm64/)
      assert.equal(log.includes(':0.6.0-amd64'), false)
      assert.equal(log.includes(':0.6.0-arm64'), false)
      assert.equal(log.includes(decoyDigest), false)
      assert.match(calls[4], new RegExp(
        `imagetools\\ncreate\\n--tag\\ndocker\\.elastic\\.co\\/clients\\/elastic-cli:0\\.6\\.0\\n--tag\\ndocker\\.elastic\\.co\\/clients\\/elastic-cli:latest\\ndocker\\.elastic\\.co\\/clients\\/elastic-cli@${amdDigest}\\ndocker\\.elastic\\.co\\/clients\\/elastic-cli@${armDigest}`,
      ))
      assert.match(calls[5], /imagetools\ninspect\n--format\n\{\{\.Manifest\.Digest\}\}/)
      const cfg = await readFile(dockerCfg, 'utf8')
      assert.notEqual(cfg, '')
      await assert.rejects(stat(cfg))
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
      for (const version of ['../', '1.2.3;touch /tmp/pwn', '?#', 'v', '1.2.3+build.1']) {
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

  it('pushes the github release binaries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin, dockerCfg, ghLog, sleepLog } = await fakes(dir)
      const result = run(dir, ['--from-release'], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        DOCKER_CFG: bashPath(dockerCfg),
        GH_LOG: bashPath(ghLog),
        GH_COUNT: bashPath(join(dir, 'gh-count')),
        SLEEP_LOG: bashPath(sleepLog),
        RELEASE_DOWNLOAD_PAUSE: bashPath(join(bin, 'sleep')),
        VAULT_LOG: join(dir, 'vault-log'),
        VAULT_PASSWORD: 's3cret',
        GH_TOKEN: 'gh-token',
        GH_AMD: 'linux-amd64-bytes',
        GH_ARM: 'linux-arm64-bytes',
        BUILDKITE_TAG: 'v0.6.0',
        INSPECT_DIGEST: digest,
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
      })
      assert.equal(result.status, 0, result.stderr)
      const gh = await readFile(ghLog, 'utf8')
      assert.match(gh, /release\ndownload\nv0\.6\.0\n/)
      assert.match(gh, /--pattern\nelastic-linux-x64\n--pattern\nelastic-linux-arm64\n/)
      assert.equal(gh.includes('gh-token'), false)
      assert.equal(result.stderr.includes('gh-token'), false)
      const log = await readFile(dockerLog, 'utf8')
      assert.match(log, /CONTEXT:linux-amd64-bytes\n/)
      assert.match(log, /CONTEXT:linux-arm64-bytes\n/)
      assert.equal(log.includes(decoyDigest), false)
      assert.equal(log.includes('s3cret'), false)
      await assert.rejects(readFile(sleepLog, 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not log in when the release assets never appear', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, vaultLog, ghLog, sleepLog } = await fakes(dir)
      const result = run(dir, ['--from-release'], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        GH_LOG: bashPath(ghLog),
        GH_COUNT: bashPath(join(dir, 'gh-count')),
        SLEEP_LOG: bashPath(sleepLog),
        RELEASE_DOWNLOAD_PAUSE: bashPath(join(bin, 'sleep')),
        VAULT_LOG: bashPath(vaultLog),
        VAULT_PASSWORD: 's3cret',
        GH_TOKEN: 'gh-token',
        GH_FAILS: '60',
        BUILDKITE_TAG: 'v0.6.0',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /linux release assets not on v0\.6\.0/)
      assert.match(await readFile(dockerLog, 'utf8'), /^buildx\nversion\n/)
      assert.doesNotMatch(await readFile(dockerLog, 'utf8'), /login/)
      const sleeps = (await readFile(sleepLog, 'utf8')).trim().split('\n')
      assert.equal(sleeps.length, 60)
      await assert.rejects(readFile(vaultLog, 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('retries a missing release asset and then pushes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin, dockerCfg, ghCount, sleepLog } = await fakes(dir)
      const result = run(dir, ['--from-release'], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        DOCKER_CFG: bashPath(dockerCfg),
        GH_LOG: bashPath(join(dir, 'gh-log')),
        GH_COUNT: bashPath(ghCount),
        SLEEP_LOG: bashPath(sleepLog),
        RELEASE_DOWNLOAD_PAUSE: bashPath(join(bin, 'sleep')),
        VAULT_LOG: join(dir, 'vault-log'),
        VAULT_PASSWORD: 's3cret',
        GH_TOKEN: 'gh-token',
        GH_FAILS: '1',
        BUILDKITE_TAG: 'v0.6.0',
        INSPECT_DIGEST: digest,
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(await readFile(ghCount, 'utf8'), '2')
      assert.match(await readFile(sleepLog, 'utf8'), /^15\n/)
      assert.match(await readFile(dockerLog, 'utf8'), /CONTEXT:amd-bytes\n/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects a bad tag, a missing token, an empty asset, and a symlink before vault', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, vaultLog, ghLog } = await fakes(dir)
      const env = {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        GH_LOG: bashPath(ghLog),
        GH_COUNT: bashPath(join(dir, 'gh-count')),
        SLEEP_LOG: bashPath(join(dir, 'sleep-log')),
        RELEASE_DOWNLOAD_PAUSE: bashPath(join(bin, 'sleep')),
        VAULT_LOG: bashPath(vaultLog),
        VAULT_PASSWORD: 's3cret',
        GH_TOKEN: 'gh-token',
        GITHUB_TOKEN: '',
      }
      for (const tag of ['v../', 'v1.2.3;touch /tmp/pwn', 'v?#', 'v', 'v1.2.3+build.1']) {
        const result = run(dir, ['--from-release'], { ...env, BUILDKITE_TAG: tag })
        assert.notEqual(result.status, 0, tag)
      }
      const noToken = run(dir, ['--from-release'], {
        ...env,
        BUILDKITE_TAG: 'v0.6.0',
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
      })
      assert.notEqual(noToken.status, 0)
      assert.match(noToken.stderr, /GH_TOKEN or GITHUB_TOKEN must be set/)
      await assert.rejects(readFile(ghLog, 'utf8'))
      const empty = run(dir, ['--from-release'], {
        ...env,
        BUILDKITE_TAG: 'v0.6.0',
        GH_AMD: '',
      })
      assert.notEqual(empty.status, 0)
      assert.match(empty.stderr, /linux release asset missing/)
      const linked = run(dir, ['--from-release'], {
        ...env,
        BUILDKITE_TAG: 'v0.6.0',
        GH_AMD: 'amd-bytes',
        GH_LINK: '1',
      })
      assert.notEqual(linked.status, 0)
      assert.match(linked.stderr, /linux release asset missing/)
      assert.doesNotMatch(await readFile(dockerLog, 'utf8'), /login/)
      await assert.rejects(readFile(vaultLog, 'utf8'))
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
      const docker = await readFile(dockerLog, 'utf8')
      assert.match(docker, /^buildx\nversion\n/)
      assert.doesNotMatch(docker, /login/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects an image digest that is not sha256', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin, dockerCfg } = await fakes(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const result = run(dir, ['0.6.0', bashPath(binary), bashPath(binary)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        DOCKER_CFG: bashPath(dockerCfg),
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

  it('does not move latest for a prerelease', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, dockerStdin, dockerCfg } = await fakes(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const result = run(dir, ['0.6.0-rc.1', bashPath(binary), bashPath(binary)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        DOCKER_STDIN: bashPath(dockerStdin),
        DOCKER_CFG: bashPath(dockerCfg),
        VAULT_LOG: join(dir, 'vault-log'),
        VAULT_PASSWORD: 's3cret',
        INSPECT_DIGEST: digest,
        CREATED: '2020-01-02T03:04:05Z',
        GIT_REVISION: 'abc123',
      })
      assert.equal(result.status, 0, result.stderr)
      const log = await readFile(dockerLog, 'utf8')
      assert.match(log, /elastic-cli:0\.6\.0-rc\.1\n/)
      assert.equal(log.includes('elastic-cli:latest'), false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stops before vault when buildx is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'push-image-'))
    try {
      const { bin, dockerLog, vaultLog } = await fakes(dir)
      const binary = join(dir, 'elastic')
      await writeFile(binary, 'bin')
      const result = run(dir, ['0.6.0', bashPath(binary), bashPath(binary)], {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        DOCKER_LOG: bashPath(dockerLog),
        VAULT_LOG: bashPath(vaultLog),
        VAULT_PASSWORD: 's3cret',
        FAIL_BUILDX: '1',
      })
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /docker buildx is required/)
      await assert.rejects(readFile(vaultLog, 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
