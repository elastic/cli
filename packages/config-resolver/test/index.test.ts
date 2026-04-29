/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../../../src/config/loader.ts'
import {
  containsExpression,
  resolveString,
  resolveExpressions,
  registerResolver,
  _testResetResolvers,
  _testSetExecSync,
  _testSetPlatform,
} from '../src/index.ts'

afterEach(() => {
  _testResetResolvers()
})

// ---------------------------------------------------------------------------
// containsExpression
// ---------------------------------------------------------------------------

describe('containsExpression', () => {
  it('returns false for plain strings', () => {
    assert.equal(containsExpression('hello world'), false)
  })

  it('returns true for strings with $(', () => {
    assert.equal(containsExpression('$(env:FOO)'), true)
  })

  it('returns true even if expression is incomplete', () => {
    assert.equal(containsExpression('value with $( but no closing'), true)
  })
})

// ---------------------------------------------------------------------------
// resolveString
// ---------------------------------------------------------------------------

describe('resolveString', () => {
  it('returns plain strings unchanged', async () => {
    const result = await resolveString('hello', 'test')
    assert.equal(result, 'hello')
  })

  it('returns strings with $( but no valid expression unchanged', async () => {
    const result = await resolveString('value $( not valid', 'test')
    assert.equal(result, 'value $( not valid')
  })

  it('resolves a single expression that is the entire value', async () => {
    registerResolver('echo', (params) => params)
    const result = await resolveString('$(echo:hello)', 'test')
    assert.equal(result, 'hello')
  })

  it('resolves an expression embedded in a string', async () => {
    registerResolver('echo', (params) => params)
    const result = await resolveString('https://$(echo:myhost):9200', 'test')
    assert.equal(result, 'https://myhost:9200')
  })

  it('resolves multiple expressions in one string', async () => {
    registerResolver('echo', (params) => params)
    const result = await resolveString('$(echo:https)://$(echo:myhost)', 'test')
    assert.equal(result, 'https://myhost')
  })

  it('throws for an unknown resolver name', async () => {
    await assert.rejects(
      () => resolveString('$(unknown:foo)', 'my.field'),
      (err: Error) => {
        assert.match(err.message, /Unknown resolver "unknown"/)
        assert.match(err.message, /my\.field/)
        return true
      }
    )
  })

  it('replaces all occurrences of the same expression', async () => {
    registerResolver('echo', (params) => params)
    const result = await resolveString('$(echo:val)-$(echo:val)', 'test')
    assert.equal(result, 'val-val')
  })

  it('supports async resolvers', async () => {
    registerResolver('async_echo', async (params) => params)
    const result = await resolveString('$(async_echo:world)', 'test')
    assert.equal(result, 'world')
  })
})

// ---------------------------------------------------------------------------
// resolveExpressions (deep walk)
// ---------------------------------------------------------------------------

describe('resolveExpressions', () => {
  it('returns non-string primitives unchanged', async () => {
    assert.equal(await resolveExpressions(42), 42)
    assert.equal(await resolveExpressions(true), true)
    assert.equal(await resolveExpressions(null), null)
  })

  it('returns a plain string unchanged', async () => {
    assert.equal(await resolveExpressions('hello'), 'hello')
  })

  it('resolves expressions in nested objects', async () => {
    registerResolver('echo', (params) => params)
    const input = {
      level1: {
        level2: '$(echo:deep)',
        plain: 'no-expression',
      },
    }
    const result = await resolveExpressions(input)
    assert.deepEqual(result, {
      level1: {
        level2: 'deep',
        plain: 'no-expression',
      },
    })
  })

  it('resolves expressions in arrays', async () => {
    registerResolver('echo', (params) => params)
    const input = ['$(echo:a)', 'plain', '$(echo:b)']
    const result = await resolveExpressions(input)
    assert.deepEqual(result, ['a', 'plain', 'b'])
  })

  it('preserves non-string values in mixed objects', async () => {
    registerResolver('echo', (params) => params)
    const input = {
      str: '$(echo:resolved)',
      num: 123,
      bool: false,
      nil: null,
    }
    const result = await resolveExpressions(input)
    assert.deepEqual(result, {
      str: 'resolved',
      num: 123,
      bool: false,
      nil: null,
    })
  })

  it('includes field path in error messages for nested values', async () => {
    await assert.rejects(
      () => resolveExpressions({
        contexts: {
          local: {
            elasticsearch: {
              auth: { api_key: '$(unknown:x)' },
            },
          },
        },
      }),
      (err: Error) => {
        assert.match(err.message, /contexts\.local\.elasticsearch\.auth\.api_key/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// file resolver
// ---------------------------------------------------------------------------

describe('file resolver', () => {
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-file-resolver-'))
  })
  after(async () => rm(tmpDir, { recursive: true }))

  it('reads file contents with trailing newline trimmed', async () => {
    const filePath = join(tmpDir, 'secret.txt')
    await writeFile(filePath, 'my-secret-value\n')
    const result = await resolveExpressions(`$(file:${filePath})`)
    assert.equal(result, 'my-secret-value')
  })

  it('reads file contents without trailing newline', async () => {
    const filePath = join(tmpDir, 'secret-no-newline.txt')
    await writeFile(filePath, 'exact-value')
    const result = await resolveExpressions(`$(file:${filePath})`)
    assert.equal(result, 'exact-value')
  })

  it('throws for a nonexistent file', async () => {
    await assert.rejects(
      () => resolveExpressions(`$(file:${join(tmpDir, 'nonexistent.txt')})`),
      (err: Error) => {
        assert.match(err.message, /Failed to read file/)
        assert.match(err.message, /nonexistent\.txt/)
        return true
      }
    )
  })

  it('throws for a directory', async () => {
    await assert.rejects(
      () => resolveExpressions(`$(file:${tmpDir})`),
      (err: Error) => {
        assert.match(err.message, /not a regular file/)
        return true
      }
    )
  })

  it('throws for a file exceeding the size limit', async () => {
    const filePath = join(tmpDir, 'large.txt')
    await writeFile(filePath, 'x'.repeat(65 * 1024))
    await assert.rejects(
      () => resolveExpressions(`$(file:${filePath})`),
      (err: Error) => {
        assert.match(err.message, /bytes/)
        assert.match(err.message, /max/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// env resolver
// ---------------------------------------------------------------------------

describe('env resolver', () => {
  const TEST_VAR = 'ELASTIC_CLI_TEST_RESOLVER_VAR'

  afterEach(() => {
    delete process.env[TEST_VAR]
  })

  it('resolves a set environment variable', async () => {
    process.env[TEST_VAR] = 'my-secret'
    const result = await resolveExpressions(`$(env:${TEST_VAR})`)
    assert.equal(result, 'my-secret')
  })

  it('throws for an unset environment variable', async () => {
    delete process.env[TEST_VAR]
    await assert.rejects(
      () => resolveExpressions(`$(env:${TEST_VAR})`),
      (err: Error) => {
        assert.match(err.message, /not set or is empty/)
        assert.match(err.message, new RegExp(TEST_VAR))
        return true
      }
    )
  })

  it('throws for an empty environment variable', async () => {
    process.env[TEST_VAR] = ''
    await assert.rejects(
      () => resolveExpressions(`$(env:${TEST_VAR})`),
      (err: Error) => {
        assert.match(err.message, /not set or is empty/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// cmd resolver
// ---------------------------------------------------------------------------

describe('cmd resolver', () => {
  it('resolves command output with trailing newline trimmed', async () => {
    const restore = _testSetExecSync((() => 'secret-value\n') as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(cmd:echo secret-value)')
      assert.equal(result, 'secret-value')
    } finally {
      restore()
    }
  })

  it('throws when the command fails', async () => {
    const restore = _testSetExecSync((() => {
      throw new Error('Command not found: badcmd')
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(cmd:badcmd)'),
        (err: Error) => {
          assert.match(err.message, /Command failed: badcmd/)
          return true
        }
      )
    } finally {
      restore()
    }
  })

  it('includes the command text in the error message', async () => {
    const restore = _testSetExecSync((() => {
      throw new Error('exit code 1')
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(cmd:pass show elastic/key)'),
        (err: Error) => {
          assert.match(err.message, /pass show elastic\/key/)
          return true
        }
      )
    } finally {
      restore()
    }
  })
})

// ---------------------------------------------------------------------------
// keychain resolver
// ---------------------------------------------------------------------------

describe('keychain resolver', () => {
  it('resolves a keychain value on macOS', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    const restoreExec = _testSetExecSync(((cmd: string) => {
      assert.match(cmd, /security find-generic-password/)
      assert.match(cmd, /-s 'elastic-cli'/)
      assert.match(cmd, /-a 'my-api-key'/)
      return 'keychain-secret\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(keychain:elastic-cli/my-api-key)')
      assert.equal(result, 'keychain-secret')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('throws on non-macOS platforms', async () => {
    const restorePlatform = _testSetPlatform('linux')
    try {
      await assert.rejects(
        () => resolveExpressions('$(keychain:svc/acct)'),
        (err: Error) => {
          assert.match(err.message, /only supported on macOS/)
          assert.match(err.message, /linux/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for missing slash in parameter', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    try {
      await assert.rejects(
        () => resolveExpressions('$(keychain:no-slash)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for leading slash in parameter', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    try {
      await assert.rejects(
        () => resolveExpressions('$(keychain:/account)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for trailing slash in parameter', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    try {
      await assert.rejects(
        () => resolveExpressions('$(keychain:service/)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('splits on first slash only (account can contain slashes)', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    const restoreExec = _testSetExecSync(((cmd: string) => {
      assert.match(cmd, /-s 'my-service'/)
      assert.match(cmd, /-a 'path\/to\/key'/)
      return 'value\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(keychain:my-service/path/to/key)')
      assert.equal(result, 'value')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('shell-escapes special characters in service and account', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    let capturedCmd = ''
    const restoreExec = _testSetExecSync(((cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await resolveExpressions("$(keychain:it's-a-service/acct)")
      assert.ok(capturedCmd.includes("'it'\\''s-a-service'"), `expected shell-escaped service in: ${capturedCmd}`)
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('includes service and account in error message on failure', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    const restoreExec = _testSetExecSync((() => {
      throw new Error('The specified item could not be found')
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(keychain:my-svc/my-acct)'),
        (err: Error) => {
          assert.match(err.message, /service="my-svc"/)
          assert.match(err.message, /account="my-acct"/)
          return true
        }
      )
    } finally {
      restoreExec()
      restorePlatform()
    }
  })
})

// ---------------------------------------------------------------------------
// secret_service resolver
// ---------------------------------------------------------------------------

describe('secret_service resolver', () => {
  it('resolves a secret on Linux', async () => {
    const restorePlatform = _testSetPlatform('linux')
    const restoreExec = _testSetExecSync(((cmd: string) => {
      assert.match(cmd, /secret-tool lookup/)
      assert.match(cmd, /service 'elastic-cli'/)
      assert.match(cmd, /account 'my-api-key'/)
      return 'secret-value\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(secret_service:elastic-cli/my-api-key)')
      assert.equal(result, 'secret-value')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('throws on macOS', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:svc/acct)'),
        (err: Error) => {
          assert.match(err.message, /only supported on Linux/)
          assert.match(err.message, /darwin/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws on Windows', async () => {
    const restorePlatform = _testSetPlatform('win32')
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:svc/acct)'),
        (err: Error) => {
          assert.match(err.message, /only supported on Linux/)
          assert.match(err.message, /win32/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for missing slash in parameter', async () => {
    const restorePlatform = _testSetPlatform('linux')
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:no-slash)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for leading slash', async () => {
    const restorePlatform = _testSetPlatform('linux')
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:/account)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for trailing slash', async () => {
    const restorePlatform = _testSetPlatform('linux')
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:service/)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for non-printable characters', async () => {
    const restorePlatform = _testSetPlatform('linux')
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:svc/acct\x00)'),
        (err: Error) => {
          assert.match(err.message, /non-printable characters/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('splits on first slash only (account can contain slashes)', async () => {
    const restorePlatform = _testSetPlatform('linux')
    const restoreExec = _testSetExecSync(((cmd: string) => {
      assert.match(cmd, /service 'my-service'/)
      assert.match(cmd, /account 'path\/to\/key'/)
      return 'value\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(secret_service:my-service/path/to/key)')
      assert.equal(result, 'value')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('shell-escapes special characters', async () => {
    const restorePlatform = _testSetPlatform('linux')
    let capturedCmd = ''
    const restoreExec = _testSetExecSync(((cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await resolveExpressions("$(secret_service:it's-a-service/acct)")
      assert.ok(capturedCmd.includes("'it'\\''s-a-service'"), `expected shell-escaped service in: ${capturedCmd}`)
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('includes service and account in error on failure', async () => {
    const restorePlatform = _testSetPlatform('linux')
    const restoreExec = _testSetExecSync((() => {
      throw new Error('secret-tool: not found')
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(secret_service:my-svc/my-acct)'),
        (err: Error) => {
          assert.match(err.message, /service="my-svc"/)
          assert.match(err.message, /account="my-acct"/)
          return true
        }
      )
    } finally {
      restoreExec()
      restorePlatform()
    }
  })
})

// ---------------------------------------------------------------------------
// pass resolver
// ---------------------------------------------------------------------------

describe('pass resolver', () => {
  it('resolves the first line of pass output', async () => {
    const restoreExec = _testSetExecSync((() => {
      return 'my-password\nUsername: user\nURL: https://example.com\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(pass:elastic/api-key)')
      assert.equal(result, 'my-password')
    } finally {
      restoreExec()
    }
  })

  it('resolves single-line output', async () => {
    const restoreExec = _testSetExecSync((() => {
      return 'simple-password\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(pass:elastic/api-key)')
      assert.equal(result, 'simple-password')
    } finally {
      restoreExec()
    }
  })

  it('throws for empty parameter', async () => {
    await assert.rejects(
      () => resolveExpressions('$(pass: )'),
      (err: Error) => {
        assert.match(err.message, /path must not be empty/)
        return true
      }
    )
  })

  it('throws for non-printable characters', async () => {
    await assert.rejects(
      () => resolveExpressions('$(pass:elastic/key\x00)'),
      (err: Error) => {
        assert.match(err.message, /non-printable characters/)
        return true
      }
    )
  })

  it('shell-escapes the path', async () => {
    let capturedCmd = ''
    const restoreExec = _testSetExecSync(((cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await resolveExpressions("$(pass:it's/a-key)")
      assert.ok(capturedCmd.includes("'it'\\''s/a-key'"), `expected shell-escaped path in: ${capturedCmd}`)
    } finally {
      restoreExec()
    }
  })

  it('works on macOS', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    const restoreExec = _testSetExecSync((() => 'val\n') as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(pass:key)')
      assert.equal(result, 'val')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('works on Linux', async () => {
    const restorePlatform = _testSetPlatform('linux')
    const restoreExec = _testSetExecSync((() => 'val\n') as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(pass:key)')
      assert.equal(result, 'val')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('throws when pass command fails', async () => {
    const restoreExec = _testSetExecSync((() => {
      throw new Error('pass: key not found')
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(pass:elastic/missing)'),
        (err: Error) => {
          assert.match(err.message, /pass lookup failed/)
          assert.match(err.message, /elastic\/missing/)
          return true
        }
      )
    } finally {
      restoreExec()
    }
  })

  it('throws when pass returns empty output', async () => {
    const restoreExec = _testSetExecSync((() => '\n') as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(pass:elastic/empty)'),
        (err: Error) => {
          assert.match(err.message, /empty output/)
          return true
        }
      )
    } finally {
      restoreExec()
    }
  })
})

// ---------------------------------------------------------------------------
// credential_manager resolver
// ---------------------------------------------------------------------------

describe('credential_manager resolver', () => {
  it('resolves a credential on Windows via EncodedCommand', async () => {
    const restorePlatform = _testSetPlatform('win32')
    const restoreExec = _testSetExecSync(((cmd: string) => {
      assert.match(cmd, /powershell/)
      assert.match(cmd, /-EncodedCommand/)
      const b64 = cmd.split('-EncodedCommand ')[1]!
      const decoded = Buffer.from(b64, 'base64').toString('utf16le')
      assert.match(decoded, /Get-StoredCredential/)
      assert.match(decoded, /elastic-cli\/my-api-key/)
      return 'credential-secret\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(credential_manager:elastic-cli/my-api-key)')
      assert.equal(result, 'credential-secret')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('throws on macOS', async () => {
    const restorePlatform = _testSetPlatform('darwin')
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:svc/acct)'),
        (err: Error) => {
          assert.match(err.message, /only supported on Windows/)
          assert.match(err.message, /darwin/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws on Linux', async () => {
    const restorePlatform = _testSetPlatform('linux')
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:svc/acct)'),
        (err: Error) => {
          assert.match(err.message, /only supported on Windows/)
          assert.match(err.message, /linux/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for missing slash in parameter', async () => {
    const restorePlatform = _testSetPlatform('win32')
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:no-slash)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for leading slash', async () => {
    const restorePlatform = _testSetPlatform('win32')
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:/account)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for trailing slash', async () => {
    const restorePlatform = _testSetPlatform('win32')
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:service/)'),
        (err: Error) => {
          assert.match(err.message, /expected format "service\/account"/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('throws for non-printable characters', async () => {
    const restorePlatform = _testSetPlatform('win32')
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:svc/acct\x00)'),
        (err: Error) => {
          assert.match(err.message, /non-printable characters/)
          return true
        }
      )
    } finally {
      restorePlatform()
    }
  })

  it('splits on first slash only (account can contain slashes)', async () => {
    const restorePlatform = _testSetPlatform('win32')
    const restoreExec = _testSetExecSync(((cmd: string) => {
      const b64 = cmd.split('-EncodedCommand ')[1]!
      const decoded = Buffer.from(b64, 'base64').toString('utf16le')
      assert.match(decoded, /my-service\/path\/to\/key/)
      return 'value\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      const result = await resolveExpressions('$(credential_manager:my-service/path/to/key)')
      assert.equal(result, 'value')
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('uses PowerShell escaping (doubled single quotes) in encoded command', async () => {
    const restorePlatform = _testSetPlatform('win32')
    let capturedCmd = ''
    const restoreExec = _testSetExecSync(((cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await resolveExpressions("$(credential_manager:it's-a-service/acct)")
      const b64 = capturedCmd.split('-EncodedCommand ')[1]!
      const decoded = Buffer.from(b64, 'base64').toString('utf16le')
      assert.ok(decoded.includes("'it''s-a-service/acct'"), `expected PS-escaped target in decoded command: ${decoded}`)
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('throws when credential manager returns empty password', async () => {
    const restorePlatform = _testSetPlatform('win32')
    const restoreExec = _testSetExecSync((() => '\n') as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:my-svc/my-acct)'),
        (err: Error) => {
          assert.match(err.message, /empty password/)
          assert.match(err.message, /service="my-svc"/)
          return true
        }
      )
    } finally {
      restoreExec()
      restorePlatform()
    }
  })

  it('includes service and account in error on failure', async () => {
    const restorePlatform = _testSetPlatform('win32')
    const restoreExec = _testSetExecSync((() => {
      throw new Error('Get-StoredCredential is not recognized')
    }) as unknown as typeof import('node:child_process').execSync)
    try {
      await assert.rejects(
        () => resolveExpressions('$(credential_manager:my-svc/my-acct)'),
        (err: Error) => {
          assert.match(err.message, /service="my-svc"/)
          assert.match(err.message, /account="my-acct"/)
          return true
        }
      )
    } finally {
      restoreExec()
      restorePlatform()
    }
  })
})

// ---------------------------------------------------------------------------
// Integration: loadConfig with expressions
// ---------------------------------------------------------------------------

describe('loadConfig with resolver expressions', () => {
  const ENV_VAR = 'ELASTIC_CLI_TEST_RESOLVER_INTEGRATION'
  let tmpDir: string

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'elastic-cli-resolvers-'))
  })
  after(async () => {
    delete process.env[ENV_VAR]
    await rm(tmpDir, { recursive: true })
  })

  it('resolves $(env:...) expressions before Zod validation', async () => {
    process.env[ENV_VAR] = 'integration-api-key'
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: $(env:${ENV_VAR})
`.trimStart()
    const configPath = join(tmpDir, 'env-resolve.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok, `expected ok, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.equal(
      (result.value.context.elasticsearch!.auth as { api_key: string }).api_key,
      'integration-api-key'
    )
  })

  it('returns error when an expression fails to resolve', async () => {
    delete process.env[ENV_VAR]
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: $(env:${ENV_VAR})
`.trimStart()
    const configPath = join(tmpDir, 'env-fail.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(!result.ok, 'expected failure for unset env var')
    if (result.ok) return
    assert.match(result.error.message, /Failed to resolve config expressions/)
    assert.match(result.error.message, new RegExp(ENV_VAR))
  })

  it('works normally when config has no expressions (regression)', async () => {
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: http://localhost:9200
      auth:
        api_key: plain-key
`.trimStart()
    const configPath = join(tmpDir, 'no-expressions.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok, `expected ok, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.equal(
      (result.value.context.elasticsearch!.auth as { api_key: string }).api_key,
      'plain-key'
    )
  })

  it('resolves expressions in URL fields', async () => {
    process.env[ENV_VAR] = 'my-host.example.com'
    const yaml = `
current_context: local
contexts:
  local:
    elasticsearch:
      url: https://$(env:${ENV_VAR}):9200
      auth:
        api_key: plain-key
`.trimStart()
    const configPath = join(tmpDir, 'url-resolve.yml')
    await writeFile(configPath, yaml)
    const result = await loadConfig({ configPath })
    assert.ok(result.ok, `expected ok, got: ${!result.ok ? result.error.message : ''}`)
    if (!result.ok) return
    assert.equal(result.value.context.elasticsearch!.url, 'https://my-host.example.com:9200')
  })
})
