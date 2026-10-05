/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scripts = fileURLToPath(new URL('../../.buildkite/scripts/', import.meta.url))

// GNU tar treats C:\... as a remote host. Git bash wants /c/...
function bashPath (p: string): string {
  if (process.platform !== 'win32') return p
  const slashed = p.replaceAll('\\', '/')
  const drive = /^([A-Za-z]):\/(.*)$/.exec(slashed)
  if (!drive) return slashed
  return `/${drive[1].toLowerCase()}/${drive[2]}`
}

function run (cmd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('pack-sign.sh', () => {
  it('packs darwin as tar.gz and leaves windows exe raw', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pack-sign-'))
    const src = join(dir, 'downloads')
    const out = join(dir, 'artifacts-to-sign')
    await mkdir(src)
    await writeFile(join(src, 'elastic-macos-x64'), 'macho-x64')
    await writeFile(join(src, 'elastic-macos-arm64'), 'macho-arm64')
    await writeFile(join(src, 'elastic-windows-x64.exe'), 'exe-x64')
    await writeFile(join(src, 'elastic-windows-arm64.exe'), 'exe-arm64')

    const result = run('bash', [join(scripts, 'pack-sign.sh'), bashPath(src), bashPath(out)])
    assert.equal(result.status, 0, result.stderr)

    const listing = spawnSync('tar', ['-tzf', join(out, 'elastic-macos-arm64.tar.gz')], { encoding: 'utf8' })
    assert.equal(listing.stdout.trim(), 'elastic-macos-arm64')
    assert.equal(await readFile(join(out, 'elastic-windows-x64.exe'), 'utf8'), 'exe-x64')
    await rm(dir, { recursive: true })
  })

  it('refuses a symlink and a missing binary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pack-sign-bad-'))
    const src = join(dir, 'downloads')
    await mkdir(src)
    await writeFile(join(dir, 'outside'), 'secret')
    await symlink(join(dir, 'outside'), join(src, 'elastic-macos-x64'))
    await writeFile(join(src, 'elastic-macos-arm64'), 'macho-arm64')
    await writeFile(join(src, 'elastic-windows-x64.exe'), 'exe-x64')
    await writeFile(join(src, 'elastic-windows-arm64.exe'), 'exe-arm64')

    const linked = run('bash', [join(scripts, 'pack-sign.sh'), bashPath(src), bashPath(join(dir, 'out'))])
    assert.notEqual(linked.status, 0)
    assert.match(linked.stderr, /refusing symlink elastic-macos-x64/)

    await rm(join(src, 'elastic-macos-x64'))
    const missing = run('bash', [join(scripts, 'pack-sign.sh'), bashPath(src), bashPath(join(dir, 'out2'))])
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /missing elastic-macos-x64/)
    await rm(dir, { recursive: true })
  })
})

describe('verify-macos-signature.sh', () => {
  let binDir: string

  before(async () => {
    binDir = await mkdtemp(join(tmpdir(), 'fake-codesign-'))
    await writeFile(join(binDir, 'codesign'), [
      '#!/bin/bash',
      'if [[ "$1" == "--verify" ]]; then',
      '  exit "${VERIFY_EXIT:-0}"',
      'fi',
      'if [[ "$1" == "-d" ]]; then',
      '  printf \'%s\\n\' "$ENTITLEMENTS_XML"',
      '  exit 0',
      'fi',
      'echo "unexpected codesign $*" >&2',
      'exit 1',
      '',
    ].join('\n'))
    await chmod(join(binDir, 'codesign'), 0o755)
  })

  after(async () => {
    await rm(binDir, { recursive: true })
  })

  const plist = [
    '<key>com.apple.security.cs.allow-jit</key>',
    '<key>com.apple.security.cs.allow-unsigned-executable-memory</key>',
  ].join('\n')

  async function binaries () {
    const dir = await mkdtemp(join(tmpdir(), 'verify-macos-'))
    await writeFile(join(dir, 'elastic-macos-x64'), 'x64')
    await writeFile(join(dir, 'elastic-macos-arm64'), 'arm64')
    return dir
  }

  it('accepts both bun entitlements', async () => {
    const dir = await binaries()
    const result = run('bash', [join(scripts, 'verify-macos-signature.sh'), dir], {
      PATH: `${binDir}:${process.env.PATH}`,
      ENTITLEMENTS_XML: plist,
      VERIFY_EXIT: '0',
    })
    assert.equal(result.status, 0, result.stderr)
    await rm(dir, { recursive: true })
  })

  it('rejects a signature that is missing allow-jit', async () => {
    const dir = await binaries()
    const result = run('bash', [join(scripts, 'verify-macos-signature.sh'), dir], {
      PATH: `${binDir}:${process.env.PATH}`,
      ENTITLEMENTS_XML: '<key>com.apple.security.cs.allow-unsigned-executable-memory</key>',
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /missing com\.apple\.security\.cs\.allow-jit/)
    await rm(dir, { recursive: true })
  })

  it('rejects a binary codesign will not verify', async () => {
    const dir = await binaries()
    const result = run('bash', [join(scripts, 'verify-macos-signature.sh'), dir], {
      PATH: `${binDir}:${process.env.PATH}`,
      ENTITLEMENTS_XML: plist,
      VERIFY_EXIT: '1',
    })
    assert.notEqual(result.status, 0)
    await rm(dir, { recursive: true })
  })
})

describe('lookup_triggered_build_id', () => {
  // A function, not a PATH entry. Windows CI has curl.exe, and a drive-letter
  // PATH entry is not a directory bash searches first.
  const script = [
    'curl() { printf \'%s\\n\' "$@" > "$CURL_ARGS"; printf \'%s\' "$CURL_BODY"; }',
    'source "$LIB"',
    'lookup_triggered_build_id macos-sign-service',
  ].join('\n')

  it('returns the one triggered build and ignores a bad jobs payload', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-lookup-'))
    const recorded = join(dir, 'curl-args')
    const body = JSON.stringify({
      jobs: [
        { step_key: 'macos-sign-service', triggered_build: { id: 'build-mac' } },
        { step_key: 'windows-sign-service', triggered_build: { id: 'build-win' } },
        { step_key: 'macos-sign-service-extra', triggered_build: { id: 'other' } },
      ],
    })
    const env = {
      LIB: join(scripts, 'lib.sh'),
      CURL_ARGS: bashPath(recorded),
      BUILDKITE_TOKEN_SECRET: 'super-secret-token',
      BUILDKITE_BUILD_NUMBER: '42',
    }
    const ok = run('bash', ['-c', script], { ...env, CURL_BODY: body })
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(ok.stdout.trim(), 'build-mac')
    assert.doesNotMatch(ok.stdout, /super-secret-token/)
    const args = await readFile(recorded, 'utf8')
    assert.match(args, /pipelines\/elastic-cli-release\/builds\/42/)
    assert.match(args, /Bearer super-secret-token/)

    const empty = run('bash', ['-c', script], { ...env, CURL_BODY: JSON.stringify({}) })
    assert.notEqual(empty.status, 0)

    const dup = run('bash', ['-c', script], {
      ...env,
      CURL_BODY: JSON.stringify({
        jobs: [
          { step_key: 'macos-sign-service', triggered_build: { id: 'a' } },
          { step_key: 'macos-sign-service', triggered_build: { id: 'b' } },
        ],
      }),
    })
    assert.notEqual(dup.status, 0)
    await rm(dir, { recursive: true })
  })

  it('fails when the API call fails', () => {
    const result = run('bash', ['-c', 'curl() { return 22; }; source "$LIB"; lookup_triggered_build_id macos-sign-service'], {
      LIB: join(scripts, 'lib.sh'),
      BUILDKITE_TOKEN_SECRET: 'token',
      BUILDKITE_BUILD_NUMBER: '7',
    })
    assert.notEqual(result.status, 0)
  })
})

describe('release.yml publish step', () => {
  it('downloads final artifacts onto the fresh agent', async () => {
    const yml = await readFile(new URL('../../.buildkite/release.yml', import.meta.url), 'utf8')
    const publish = yml.slice(yml.indexOf('key: publish-release'))
    assert.match(publish, /buildkite-agent artifact download "final\/\*" \./)
    const verify = yml.slice(yml.indexOf('key: verify-macos'), yml.indexOf('key: publish-release'))
    assert.match(verify, /buildkite-agent artifact download "final\/elastic-macos-\*" \./)
  })
})

describe('publish-release.sh', () => {
  it('uploads the four signed names and nothing else', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'publish-release-'))
    const bin = join(dir, 'bin')
    const root = join(dir, 'work')
    await mkdir(bin)
    await mkdir(join(root, 'final'), { recursive: true })
    const ghLog = join(dir, 'gh-args')
    await writeFile(join(bin, 'gh'), [
      '#!/bin/bash',
      `printf '%s\\n' "$@" > ${JSON.stringify(ghLog)}`,
      '',
    ].join('\n'))
    await chmod(join(bin, 'gh'), 0o755)
    for (const name of ['elastic-macos-x64', 'elastic-macos-arm64', 'elastic-windows-x64.exe', 'elastic-windows-arm64.exe']) {
      await writeFile(join(root, 'final', name), name)
    }
    await writeFile(join(root, 'final', 'not-a-release-asset'), 'nope')

    const fromRoot = spawnSync('bash', [join(scripts, 'publish-release.sh')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: 'gh-token',
        BUILDKITE_TAG: 'v9.9.9',
        GH_REPO: 'elastic/cli',
      },
    })
    assert.equal(fromRoot.status, 0, fromRoot.stderr)
    const args = await readFile(ghLog, 'utf8')
    assert.equal(args, [
      'release',
      'upload',
      'v9.9.9',
      'final/elastic-macos-x64',
      'final/elastic-macos-arm64',
      'final/elastic-windows-x64.exe',
      'final/elastic-windows-arm64.exe',
      '--repo',
      'elastic/cli',
      '--clobber',
      '',
    ].join('\n'))

    const noToken = spawnSync('bash', [join(scripts, 'publish-release.sh')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
        BUILDKITE_TAG: 'v9.9.9',
      },
    })
    assert.notEqual(noToken.status, 0)
    assert.match(noToken.stderr, /GH_TOKEN or GITHUB_TOKEN must be set/)
    await rm(dir, { recursive: true })
  })
})
