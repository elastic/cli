/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { execSync as ExecSyncFn } from 'node:child_process'
import {
  getSecretStore,
  _testSetExecSync,
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

  it('put invokes `security add-generic-password -U` with shell-escaped values', async () => {
    const { fn, calls } = makeExec([{ match: 'security ', result: '' }])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.MacOSKeychainStore()
    await store.put('elastic-cli', 'prod:es.api_key', "it's secret")
    const put = calls.find(c => c.cmd.includes('add-generic-password'))!
    assert.ok(put)
    assert.match(put.cmd, /-U /)
    assert.match(put.cmd, /-s 'elastic-cli'/)
    assert.match(put.cmd, /-a 'prod:es.api_key'/)
    assert.match(put.cmd, /-w 'it'\\''s secret'/)
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

  it('wraps underlying errors with context', async () => {
    const { fn } = makeExec([
      { match: 'security ', result: new Error('permission denied') },
    ])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.MacOSKeychainStore()
    await assert.rejects(
      () => store.put('svc', 'acct', 'x'),
      /Keychain write failed for service="svc", account="acct".*permission denied/
    )
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

  it('put invokes powershell with an EncodedCommand', async () => {
    const { fn, calls } = makeExec([{ match: 'powershell ', result: '' }])
    restores.push(_testSetExecSync(fn))
    const store = new _testStores.WindowsCredentialManagerStore()
    await store.put('elastic-cli', 'prod:k', 'secret')
    const put = calls.find(c => c.cmd.startsWith('powershell '))!
    assert.ok(put)
    assert.match(put.cmd, /EncodedCommand /)
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
