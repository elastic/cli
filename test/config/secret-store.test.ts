/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, type execSync as ExecSyncFn, type spawnSync as SpawnSyncFn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  getSecretStore,
  NoWritableSecretStore,
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
  it('returns a keychain store on darwin when `security` is available', async () => {
    const { fn } = makeExec([{ match: 'security -h', result: 'usage: security\n' }])

    const store = await getSecretStore({ platform: 'darwin', execSync: fn })
    assert.equal(store.kind, 'keychain')
  })

  it('falls back to a noop store when no candidate is available', async () => {
    const missing = Object.assign(new Error('not found'), { code: 'ENOENT' })
    const { fn: spawn } = makeSpawn([
      { match: 'secret-tool', result: { error: missing } },
    ])
    const { fn: exec } = makeExec([
      { match: 'pass version', result: new Error('not found') },
    ])

    const store = await getSecretStore({ platform: 'linux', execSync: exec, spawnSync: spawn })
    assert.equal(store.kind, 'none')
    assert.equal(await store.isAvailable(), false)
  })

  it('treats secret-tool usage exit 2 as available and does not pass --version', async () => {
    const { fn: spawn, calls } = makeSpawn([
      { match: 'secret-tool', result: { status: 2, stderr: 'usage: secret-tool store --label=label attribute value' } },
    ])
    const { fn: exec, calls: execCalls } = makeExec([
      { match: 'pass version', result: new Error('not found') },
    ])

    const store = await getSecretStore({ platform: 'linux', execSync: exec, spawnSync: spawn })
    assert.equal(store.kind, 'secret_service')
    assert.equal(calls[0]?.file, 'secret-tool')
    assert.deepEqual(calls[0]?.args, [])
    assert.equal(calls.some(c => c.args.includes('--version')), false)
    assert.equal(execCalls.some(c => c.cmd.startsWith('pass')), false)
    assert.equal(await store.isAvailable(), true)
  })

  it('falls through to pass when secret-tool rejects the write', async () => {
    const { fn: spawn } = makeSpawn([
      { match: 'secret-tool store', result: { status: 1, stderr: 'no D-Bus session' } },
      { match: 'secret-tool', result: { status: 2, stderr: 'usage: secret-tool' } },
    ])
    const { fn: exec, calls } = makeExec([
      { match: 'pass version', result: '' },
      { match: 'pass insert', result: '' },
    ])

    const store = await getSecretStore({ platform: 'linux', execSync: exec, spawnSync: spawn })
    await store.put('elastic-cli', 'acct?#x', 'hunter2')
    assert.equal(store.kind, 'pass')
    assert.equal(store.resolverExpr('elastic-cli', 'acct?#x'), '$(pass:elastic-cli/acct?#x)')
    assert.ok(calls.some(c => c.cmd.includes('pass insert')))
    assert.equal(calls.some(c => c.cmd.includes('hunter2')), false)
  })

  it('reports no writable store when secret-tool and pass both reject the write', async () => {
    const { fn: spawn } = makeSpawn([
      { match: 'secret-tool store', result: { status: 1, stderr: 'no D-Bus session' } },
      { match: 'secret-tool', result: { status: 2, stderr: 'usage: secret-tool' } },
    ])
    const { fn: exec } = makeExec([
      { match: 'pass version', result: '' },
      { match: 'pass insert', result: new Error('pass is not initialized') },
    ])

    const store = await getSecretStore({ platform: 'linux', execSync: exec, spawnSync: spawn })
    await assert.rejects(
      () => store.put('elastic-cli', 'acct', 'hunter2'),
      NoWritableSecretStore
    )
    assert.equal(await store.isAvailable(), false)
  })

  it('uses credential_manager on win32 when CredentialManager module is present', async () => {
    const { fn } = makeExec([{ match: 'powershell ', result: '' }])

    const store = await getSecretStore({ platform: 'win32', execSync: fn })
    assert.equal(store.kind, 'credential_manager')
  })
})

describe('MacOSKeychainStore', () => {
  it('put feeds the password on stdin after dropping the controlling TTY', async () => {
    const { fn, calls } = makeSpawn([{ match: 'add-generic-password' }])
    const store = new _testStores.MacOSKeychainStore({ spawnSync: fn })
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
    const store = new _testStores.MacOSKeychainStore({ execSync: fn })
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
    const store = new _testStores.MacOSKeychainStore({ execSync: fn })
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
    const store = new _testStores.MacOSKeychainStore({ spawnSync: fn })
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
  it('put passes the secret on stdin and keeps it out of argv', async () => {
    const { fn, calls } = makeSpawn([{ match: 'secret-tool store' }])
    const store = new _testStores.LinuxSecretServiceStore({ spawnSync: fn })
    await store.put('elastic-cli', 'prod?#es', 'hunter2')
    const put = calls[0]
    assert.ok(put)
    assert.equal(put.file, 'secret-tool')
    assert.deepEqual(put.args, [
      'store',
      '--label=elastic-cli:elastic-cli:prod?#es',
      'service',
      'elastic-cli',
      'account',
      'prod?#es',
    ])
    assert.equal(put.args.includes('hunter2'), false)
    assert.equal((put.options as { input?: string }).input, 'hunter2')
  })

  it('rejects a service that contains a slash before spawning', async () => {
    const { fn, calls } = makeSpawn([])
    const store = new _testStores.LinuxSecretServiceStore({ spawnSync: fn })
    await assert.rejects(() => store.put('../etc', 'acct', 'x'), /must not contain/)
    await assert.rejects(() => store.put('svc', '', 'x'), /must not be empty/)
    assert.equal(calls.length, 0)
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
  it('put uses `pass insert -m -f` with stdin', async () => {
    const { fn, calls } = makeExec([{ match: 'pass insert', result: '' }])
    const store = new _testStores.PassStore({ execSync: fn })
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
  it('put invokes powershell with an EncodedCommand and passes secret via stdin', async () => {
    const { fn, calls } = makeExec([{ match: 'powershell ', result: '' }])
    const store = new _testStores.WindowsCredentialManagerStore({ execSync: fn })
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
