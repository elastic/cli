/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, type execSync as ExecSyncFn, type spawnSync as SpawnSyncFn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  getSecretStore,
  _testSetExecSync,
  _testSetSpawnSync,
  _testSetPlatform,
  _testStores,
} from '../../src/config/secret-store.ts'

/**
 * Builds a fake execSync that records every invocation and returns canned
 * output (or throws) based on a matcher over the command string.
 */
interface Call { cmd: string; options: Record<string, unknown> | undefined }
function makeExec (
  handlers: Array<{ match: RegExp | string; result: string | Error }>
): { fn: typeof ExecSyncFn; calls: Call[] } {
  const calls: Call[] = []
  const fn = ((cmd: string, options?: Record<string, unknown>) => {
    calls.push({ cmd, options })
    for (const h of handlers) {
      const hit = typeof h.match === 'string' ? cmd.includes(h.match) : h.match.test(cmd)
      if (hit) {
        if (h.result instanceof Error) throw h.result
        return h.result
      }
    }
    return ''
  }) as unknown as typeof ExecSyncFn
  return { fn, calls }
}

interface SpawnCall { file: string; args: string[]; options: Record<string, unknown> | undefined }
function makeSpawn (
  handlers: Array<{ match: string; result?: Partial<{ status: number | null; stderr: string; stdout: string; error: Error }> }>
): { fn: typeof SpawnSyncFn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = []
  const fn = ((file: string, args?: string[], options?: Record<string, unknown>) => {
    const argv = args ?? []
    calls.push({ file, args: argv, options })
    const joined = [file, ...argv].join(' ')
    for (const h of handlers) {
      if (joined.includes(h.match)) {
        if (h.result?.error != null) {
          return { status: null, stderr: '', stdout: '', error: h.result.error, pid: 0, output: [null, '', ''], signal: null }
        }
        return {
          status: h.result?.status ?? 0,
          stderr: h.result?.stderr ?? '',
          stdout: h.result?.stdout ?? '',
          error: undefined,
          pid: 0,
          output: [null, h.result?.stdout ?? '', h.result?.stderr ?? ''],
          signal: null,
        }
      }
    }
    return { status: 0, stderr: '', stdout: '', error: undefined, pid: 0, output: [null, '', ''], signal: null }
  }) as unknown as typeof SpawnSyncFn
  return { fn, calls }
}

describe('getSecretStore', () => {
  const restores: Array<() => void> = []
  afterEach(() => {
    while (restores.length > 0) restores.pop()!()
  })

  it('returns a keychain store on darwin when `security` is available', async () => {
    restores.push(_testSetPlatform('darwin'))
    const { fn } = makeExec([{ match: 'security -h', result: 'usage: security\n' }])
    restores.push(_testSetExecSync(fn))

    const store = await getSecretStore()
    assert.equal(store.kind, 'keychain')
  })

  it('falls back to a noop store when no candidate is available', async () => {
    restores.push(_testSetPlatform('linux'))
    const { fn } = makeExec([
      { match: 'secret-tool --version', result: new Error('not found') },
      { match: 'pass version', result: new Error('not found') },
    ])
    restores.push(_testSetExecSync(fn))

    const store = await getSecretStore()
    assert.equal(store.kind, 'none')
    assert.equal(await store.isAvailable(), false)
  })

  it('prefers secret_service over pass on linux', async () => {
    restores.push(_testSetPlatform('linux'))
    const { fn, calls } = makeExec([
      { match: 'secret-tool --version', result: 'Secret Tool 0.21\n' },
    ])
    restores.push(_testSetExecSync(fn))

    const store = await getSecretStore()
    assert.equal(store.kind, 'secret_service')
    assert.equal(calls.some(c => c.cmd.startsWith('pass')), false)
  })

  it('uses credential_manager on win32 when CredentialManager module is present', async () => {
    restores.push(_testSetPlatform('win32'))
    const { fn } = makeExec([{ match: 'powershell ', result: '' }])
    restores.push(_testSetExecSync(fn))

    const store = await getSecretStore()
    assert.equal(store.kind, 'credential_manager')
  })
})

describe('MacOSKeychainStore', () => {
  const restores: Array<() => void> = []
  afterEach(() => {
    while (restores.length > 0) restores.pop()!()
  })

  it('put feeds the password on stdin after dropping the controlling TTY', async () => {
    const { fn, calls } = makeSpawn([{ match: 'add-generic-password' }])
    restores.push(_testSetSpawnSync(fn))
    const store = new _testStores.MacOSKeychainStore()
    await store.put('elastic-cli', 'prod:es.api_key', "it's secret")
    const put = calls.find(c => c.args.includes('add-generic-password'))!
    assert.ok(put)
    assert.equal(put.file, '/usr/bin/perl')
    assert.ok(put.args.includes('security'))
    assert.ok(put.args.includes('-U'))
    assert.deepEqual(
      put.args.slice(put.args.indexOf('-s'), put.args.indexOf('-s') + 5),
      ['-s', 'elastic-cli', '-a', 'prod:es.api_key', '-w']
    )
    assert.ok(!put.args.includes("it's secret"), 'secret must not be in argv')
    assert.equal((put.options as { input?: string }).input, "it's secret\nit's secret\n")
  })

  it('delete swallows errors (idempotent)', async () => {
    const { fn } = makeExec([
      { match: 'security delete-generic-password', result: new Error('not found') },
    ])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.MacOSKeychainStore()
    await store.delete('elastic-cli', 'prod:missing')
  })

  it('resolverExpr produces a keychain: expression', () => {
    const store = new _testStores.MacOSKeychainStore()
    assert.equal(
      store.resolverExpr('elastic-cli', 'prod:es.api_key'),
      '$(keychain:elastic-cli/prod:es.api_key)'
    )
  })

  it('rejects service/account with slashes', async () => {
    const { fn } = makeExec([])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.MacOSKeychainStore()
    await assert.rejects(
      () => store.put('elastic/cli', 'prod', 'x'),
      /must not contain/
    )
  })

  it('rejects empty service or account', async () => {
    const store = new _testStores.MacOSKeychainStore()
    await assert.rejects(() => store.put('', 'a', 'x'), /must not be empty/)
    await assert.rejects(() => store.put('svc', '', 'x'), /must not be empty/)
  })

  it('rejects non-printable characters', async () => {
    const store = new _testStores.MacOSKeychainStore()
    await assert.rejects(() => store.put('svc', 'ac\u0000count', 'x'), /non-printable/)
  })

  it('wraps underlying errors with context and redacts the secret', async () => {
    const { fn } = makeSpawn([
      { match: 'add-generic-password', result: { status: 1, stderr: 'permission denied for hunter2' } },
    ])
    restores.push(_testSetSpawnSync(fn))
    const store = new _testStores.MacOSKeychainStore()
    await assert.rejects(
      () => store.put('svc', 'acct', 'hunter2'),
      /Keychain write failed for service="svc", account="acct".*permission denied for \[redacted\]/
    )
  })

  it('put stores the password when a TTY is present', {
    skip: process.platform !== 'darwin',
  }, () => {
    const account = `cli-tty-${process.pid}-${Date.now()}`
    const secret = 'tty-secret-620'
    const storePath = fileURLToPath(new URL('../../src/config/secret-store.ts', import.meta.url))
    const childArgv = [
      process.execPath,
      '--import', 'tsx',
      '--input-type=module',
      '-e',
      `
        import { _testStores } from ${JSON.stringify(storePath)}
        const store = new _testStores.MacOSKeychainStore()
        await store.put('elastic-cli', ${JSON.stringify(account)}, ${JSON.stringify(secret)})
      `,
    ]
    const py = `
import os, pty, select, sys
pid, fd = pty.fork()
if pid == 0:
    os.execvpe(${JSON.stringify(childArgv[0])}, ${JSON.stringify(childArgv)}, os.environ)
status = None
while True:
    r, _, _ = select.select([fd], [], [], 0.1)
    if r:
        try:
            data = os.read(fd, 4096)
        except OSError:
            break
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    wpid, st = os.waitpid(pid, os.WNOHANG)
    if wpid != 0:
        status = st
        break
if status is None:
    status = os.waitpid(pid, 0)[1]
os.close(fd)
sys.exit(os.waitstatus_to_exitcode(status))
`
    const child = spawnSync('python3', ['-c', py], { encoding: 'utf-8', timeout: 15_000 })
    try {
      assert.equal(child.status, 0, `${child.stderr}\n${child.stdout}`)
      assert.doesNotMatch(child.stdout + child.stderr, /password data for new item/)
      const stored = spawnSync(
        'security',
        ['find-generic-password', '-s', 'elastic-cli', '-a', account, '-w'],
        { encoding: 'utf-8' }
      )
      assert.equal(stored.status, 0, stored.stderr)
      assert.equal(stored.stdout.replace(/\n$/, ''), secret)
    } finally {
      spawnSync('security', ['delete-generic-password', '-s', 'elastic-cli', '-a', account])
    }
  })
})

describe('LinuxSecretServiceStore', () => {
  const restores: Array<() => void> = []
  afterEach(() => {
    while (restores.length > 0) restores.pop()!()
  })

  it('put passes secret via stdin (input option) and uses store attributes', async () => {
    const { fn, calls } = makeExec([{ match: 'secret-tool store', result: '' }])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.LinuxSecretServiceStore()
    await store.put('elastic-cli', 'prod:es.api_key', 'hunter2')
    const put = calls.find(c => c.cmd.includes('secret-tool store'))!
    assert.ok(put)
    assert.equal((put.options as { input?: string }).input, 'hunter2')
    assert.match(put.cmd, /service 'elastic-cli'/)
    assert.match(put.cmd, /account 'prod:es.api_key'/)
  })

  it('resolverExpr produces a secret_service: expression', () => {
    const store = new _testStores.LinuxSecretServiceStore()
    assert.equal(
      store.resolverExpr('elastic-cli', 'prod:es.api_key'),
      '$(secret_service:elastic-cli/prod:es.api_key)'
    )
  })
})

describe('PassStore', () => {
  const restores: Array<() => void> = []
  afterEach(() => {
    while (restores.length > 0) restores.pop()!()
  })

  it('put uses `pass insert -m -f` with stdin', async () => {
    const { fn, calls } = makeExec([{ match: 'pass insert', result: '' }])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.PassStore()
    await store.put('elastic-cli', 'prod:k', 'secret-value')
    const put = calls.find(c => c.cmd.includes('pass insert'))!
    assert.ok(put)
    assert.match(put.cmd, /pass insert -m -f 'elastic-cli\/prod:k'/)
    assert.equal((put.options as { input?: string }).input, 'secret-value\n')
  })

  it('resolverExpr produces a pass: expression', () => {
    const store = new _testStores.PassStore()
    assert.equal(
      store.resolverExpr('elastic-cli', 'prod:k'),
      '$(pass:elastic-cli/prod:k)'
    )
  })
})

describe('WindowsCredentialManagerStore', () => {
  const restores: Array<() => void> = []
  afterEach(() => {
    while (restores.length > 0) restores.pop()!()
  })

  it('put invokes powershell with an EncodedCommand and passes secret via stdin', async () => {
    const { fn, calls } = makeExec([{ match: 'powershell ', result: '' }])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.WindowsCredentialManagerStore()
    await store.put('elastic-cli', 'prod:k', 's3cr3t!')
    const put = calls.find(c => c.cmd.startsWith('powershell '))!
    assert.ok(put)
    assert.match(put.cmd, /EncodedCommand /)
    // Decode the EncodedCommand base64 and confirm the secret is not embedded in it
    const b64 = put.cmd.replace(/^.*EncodedCommand /, '')
    const decoded = Buffer.from(b64, 'base64').toString('utf16le')
    assert.ok(!decoded.includes('s3cr3t!'), 'secret must not be in the EncodedCommand')
    // Secret IS passed via stdin
    assert.equal((put.options as { input?: string }).input, 's3cr3t!')
  })

  it('resolverExpr produces a credential_manager: expression', () => {
    const store = new _testStores.WindowsCredentialManagerStore()
    assert.equal(
      store.resolverExpr('elastic-cli', 'prod:k'),
      '$(credential_manager:elastic-cli/prod:k)'
    )
  })
})

describe('NoopStore', () => {
  it('put throws a clear error', async () => {
    const store = new _testStores.NoopStore()
    await assert.rejects(
      () => store.put('svc', 'acct', 'x'),
      /No OS secret store is available/
    )
  })

  it('delete is a no-op', async () => {
    const store = new _testStores.NoopStore()
    await store.delete('svc', 'acct')
  })

  it('resolverExpr throws', () => {
    const store = new _testStores.NoopStore()
    assert.throws(() => store.resolverExpr('svc', 'acct'), /No OS secret store is available/)
  })
})
