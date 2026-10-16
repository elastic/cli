/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig, clearConfigCache } from '../../../src/config/loader.ts'
import {
  containsExpression,
  resolveString,
  resolveExpressions,
  type ResolverFn,
} from '../src/index.ts'

// Synthetic resolvers exercise the expression engine independently of the
// built-ins (none of which are async).
const deps = {
  resolvers: new Map<string, ResolverFn>([
    ['echo', (params) => params],
    ['async_echo', async (params) => params],
    ['slow', async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return 'done'
    }],
  ]),
}

afterEach(() => {
  clearConfigCache()
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
    const result = await resolveString('$(echo:hello)', 'test', deps)
    assert.equal(result, 'hello')
  })

  it('resolves an expression embedded in a string', async () => {
    const result = await resolveString('https://$(echo:myhost):9200', 'test', deps)
    assert.equal(result, 'https://myhost:9200')
  })

  it('resolves multiple expressions in one string', async () => {
    const result = await resolveString('$(echo:https)://$(echo:myhost)', 'test', deps)
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

  it('does not treat Object.prototype members as resolvers', async () => {
    for (const name of ['constructor', '__proto__', 'tostring']) {
      await assert.rejects(
        () => resolveString(`$(${name}:x)`, 'test'),
        new RegExp(`Unknown resolver "${name}"`)
      )
    }
  })

  it('replaces all occurrences of the same expression', async () => {
    const result = await resolveString('$(echo:val)-$(echo:val)', 'test', deps)
    assert.equal(result, 'val-val')
  })

  it('supports async resolvers', async () => {
    const result = await resolveString('$(async_echo:world)', 'test', deps)
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
    const input = {
      level1: {
        level2: '$(echo:deep)',
        plain: 'no-expression',
      },
    }
    const result = await resolveExpressions(input, '', deps)
    assert.deepEqual(result, {
      level1: {
        level2: 'deep',
        plain: 'no-expression',
      },
    })
  })

  it('resolves expressions in arrays', async () => {
    const input = ['$(echo:a)', 'plain', '$(echo:b)']
    const result = await resolveExpressions(input, '', deps)
    assert.deepEqual(result, ['a', 'plain', 'b'])
  })

  it('preserves non-string values in mixed objects', async () => {
    const input = {
      str: '$(echo:resolved)',
      num: 123,
      bool: false,
      nil: null,
    }
    const result = await resolveExpressions(input, '', deps)
    assert.deepEqual(result, {
      str: 'resolved',
      num: 123,
      bool: false,
      nil: null,
    })
  })

  it('keeps a __proto__ key as plain data without polluting prototypes', async () => {
    const input = JSON.parse('{"__proto__": {"polluted": "$(echo:yes)"}, "ok": 1}')
    const result = await resolveExpressions(input, '', deps) as Record<string, unknown>
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    assert.equal(({} as Record<string, unknown>)['polluted'], undefined)
    assert.equal(result['polluted'], undefined)
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, '__proto__')?.value, { polluted: 'yes' })
    assert.equal(result['ok'], 1)
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

  it('resolves object values concurrently, not sequentially', async () => {
    // Calibrate: measure average single-resolver run over 10 iterations
    let totalSingle = 0
    for (let i = 0; i < 10; i++) {
      const s = performance.now()
      await resolveExpressions({ x: '$(slow:1)' }, '', deps)
      totalSingle += performance.now() - s
    }
    const avgSingle = totalSingle / 10

    // Now resolve 3 concurrently -- should take ~1x avgSingle, not 3x
    const start = performance.now()
    const result = await resolveExpressions({ a: '$(slow:1)', b: '$(slow:2)', c: '$(slow:3)' }, '', deps)
    const elapsed = performance.now() - start
    assert.deepEqual(result, { a: 'done', b: 'done', c: 'done' })
    const limit = avgSingle * 1.5
    assert.ok(elapsed < limit, `expected parallel <${limit.toFixed(0)}ms (1.5x avg single), took ${elapsed.toFixed(0)}ms`)
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

  it('accepts a file of exactly the size limit', async () => {
    const filePath = join(tmpDir, 'at-limit.txt')
    await writeFile(filePath, 'x'.repeat(64 * 1024))
    const result = await resolveExpressions(`$(file:${filePath})`)
    assert.equal((result as string).length, 64 * 1024)
  })

  it('rejects a file one byte over the size limit', async () => {
    const filePath = join(tmpDir, 'over-limit.txt')
    await writeFile(filePath, 'x'.repeat(64 * 1024 + 1))
    await assert.rejects(
      () => resolveExpressions(`$(file:${filePath})`),
      /max 65536/
    )
  })

  // procfs reports st_size 0 for regular files with real content, so a
  // stat-based size check is bypassed; the cap must come from bytes read.
  it('enforces the size limit on bytes read, not on the stat size', { skip: !existsSync('/proc/kallsyms') }, async () => {
    await assert.rejects(
      () => resolveExpressions('$(file:/proc/kallsyms)'),
      /max 65536/
    )
  })

  it('rejects a FIFO without blocking on open', { skip: process.platform === 'win32' }, async () => {
    const fifoPath = join(tmpDir, 'fifo')
    execSync(`mkfifo ${fifoPath}`)
    await assert.rejects(
      () => resolveExpressions(`$(file:${fifoPath})`),
      /not a regular file/
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
    const exec = () => 'secret-value\n'
    const result = await resolveExpressions('$(cmd:echo secret-value)', '', { execSync: exec })
    assert.equal(result, 'secret-value')
  })

  it('throws when the command fails', async () => {
    const exec = () => {
      throw new Error('Command not found: badcmd')
    }
    await assert.rejects(
      () => resolveExpressions('$(cmd:badcmd)', '', { execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /Command failed: badcmd/)
        return true
      }
    )
  })

  it('includes the command text in the error message', async () => {
    const exec = () => {
      throw new Error('exit code 1')
    }
    await assert.rejects(
      () => resolveExpressions('$(cmd:pass show elastic/key)', '', { execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /pass show elastic\/key/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// keychain resolver
// ---------------------------------------------------------------------------

describe('keychain resolver', () => {
  it('resolves a keychain value on macOS', async () => {
    const platform = 'darwin'
    const exec = (cmd: string) => {
      assert.match(cmd, /security find-generic-password/)
      assert.match(cmd, /-s 'elastic-cli'/)
      assert.match(cmd, /-a 'my-api-key'/)
      return 'keychain-secret\n'
    }
    const result = await resolveExpressions('$(keychain:elastic-cli/my-api-key)', '', { platform, execSync: exec })
    assert.equal(result, 'keychain-secret')
  })

  it('throws on non-macOS platforms', async () => {
    const platform = 'linux'
    await assert.rejects(
      () => resolveExpressions('$(keychain:svc/acct)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /only supported on macOS/)
        assert.match(err.message, /linux/)
        return true
      }
    )
  })

  it('throws for missing slash in parameter', async () => {
    const platform = 'darwin'
    await assert.rejects(
      () => resolveExpressions('$(keychain:no-slash)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for leading slash in parameter', async () => {
    const platform = 'darwin'
    await assert.rejects(
      () => resolveExpressions('$(keychain:/account)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for trailing slash in parameter', async () => {
    const platform = 'darwin'
    await assert.rejects(
      () => resolveExpressions('$(keychain:service/)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('splits on first slash only (account can contain slashes)', async () => {
    const platform = 'darwin'
    const exec = (cmd: string) => {
      assert.match(cmd, /-s 'my-service'/)
      assert.match(cmd, /-a 'path\/to\/key'/)
      return 'value\n'
    }
    const result = await resolveExpressions('$(keychain:my-service/path/to/key)', '', { platform, execSync: exec })
    assert.equal(result, 'value')
  })

  it('shell-escapes special characters in service and account', async () => {
    const platform = 'darwin'
    let capturedCmd = ''
    const exec = (cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }
    await resolveExpressions("$(keychain:it's-a-service/acct)", '', { platform, execSync: exec })
    assert.ok(capturedCmd.includes("'it'\\''s-a-service'"), `expected shell-escaped service in: ${capturedCmd}`)
  })

  it('includes service and account in error message on failure', async () => {
    const platform = 'darwin'
    const exec = () => {
      throw new Error('The specified item could not be found')
    }
    await assert.rejects(
      () => resolveExpressions('$(keychain:my-svc/my-acct)', '', { platform, execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /service="my-svc"/)
        assert.match(err.message, /account="my-acct"/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// secret_service resolver
// ---------------------------------------------------------------------------

describe('secret_service resolver', () => {
  it('resolves a secret on Linux', async () => {
    const platform = 'linux'
    const exec = (cmd: string) => {
      assert.match(cmd, /secret-tool lookup/)
      assert.match(cmd, /service 'elastic-cli'/)
      assert.match(cmd, /account 'my-api-key'/)
      return 'secret-value\n'
    }
    const result = await resolveExpressions('$(secret_service:elastic-cli/my-api-key)', '', { platform, execSync: exec })
    assert.equal(result, 'secret-value')
  })

  it('throws on macOS', async () => {
    const platform = 'darwin'
    await assert.rejects(
      () => resolveExpressions('$(secret_service:svc/acct)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /only supported on Linux/)
        assert.match(err.message, /darwin/)
        return true
      }
    )
  })

  it('throws on Windows', async () => {
    const platform = 'win32'
    await assert.rejects(
      () => resolveExpressions('$(secret_service:svc/acct)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /only supported on Linux/)
        assert.match(err.message, /win32/)
        return true
      }
    )
  })

  it('throws for missing slash in parameter', async () => {
    const platform = 'linux'
    await assert.rejects(
      () => resolveExpressions('$(secret_service:no-slash)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for leading slash', async () => {
    const platform = 'linux'
    await assert.rejects(
      () => resolveExpressions('$(secret_service:/account)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for trailing slash', async () => {
    const platform = 'linux'
    await assert.rejects(
      () => resolveExpressions('$(secret_service:service/)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for non-printable characters', async () => {
    const platform = 'linux'
    await assert.rejects(
      () => resolveExpressions('$(secret_service:svc/acct\x00)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /non-printable characters/)
        return true
      }
    )
  })

  it('splits on first slash only (account can contain slashes)', async () => {
    const platform = 'linux'
    const exec = (cmd: string) => {
      assert.match(cmd, /service 'my-service'/)
      assert.match(cmd, /account 'path\/to\/key'/)
      return 'value\n'
    }
    const result = await resolveExpressions('$(secret_service:my-service/path/to/key)', '', { platform, execSync: exec })
    assert.equal(result, 'value')
  })

  it('shell-escapes special characters', async () => {
    const platform = 'linux'
    let capturedCmd = ''
    const exec = (cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }
    await resolveExpressions("$(secret_service:it's-a-service/acct)", '', { platform, execSync: exec })
    assert.ok(capturedCmd.includes("'it'\\''s-a-service'"), `expected shell-escaped service in: ${capturedCmd}`)
  })

  it('includes service and account in error on failure', async () => {
    const platform = 'linux'
    const exec = () => {
      throw new Error('secret-tool: not found')
    }
    await assert.rejects(
      () => resolveExpressions('$(secret_service:my-svc/my-acct)', '', { platform, execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /service="my-svc"/)
        assert.match(err.message, /account="my-acct"/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// pass resolver
// ---------------------------------------------------------------------------

describe('pass resolver', () => {
  it('resolves the first line of pass output', async () => {
    const exec = () => {
      return 'my-password\nUsername: user\nURL: https://example.com\n'
    }
    const result = await resolveExpressions('$(pass:elastic/api-key)', '', { execSync: exec })
    assert.equal(result, 'my-password')
  })

  it('resolves single-line output', async () => {
    const exec = () => {
      return 'simple-password\n'
    }
    const result = await resolveExpressions('$(pass:elastic/api-key)', '', { execSync: exec })
    assert.equal(result, 'simple-password')
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
    const exec = (cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }
    await resolveExpressions("$(pass:it's/a-key)", '', { execSync: exec })
    assert.ok(capturedCmd.includes("'it'\\''s/a-key'"), `expected shell-escaped path in: ${capturedCmd}`)
  })

  it('works on macOS', async () => {
    const platform = 'darwin'
    const exec = () => 'val\n'
    const result = await resolveExpressions('$(pass:key)', '', { platform, execSync: exec })
    assert.equal(result, 'val')
  })

  it('works on Linux', async () => {
    const platform = 'linux'
    const exec = () => 'val\n'
    const result = await resolveExpressions('$(pass:key)', '', { platform, execSync: exec })
    assert.equal(result, 'val')
  })

  it('throws when pass command fails', async () => {
    const exec = () => {
      throw new Error('pass: key not found')
    }
    await assert.rejects(
      () => resolveExpressions('$(pass:elastic/missing)', '', { execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /pass lookup failed/)
        assert.match(err.message, /elastic\/missing/)
        return true
      }
    )
  })

  it('throws when pass returns empty output', async () => {
    const exec = () => '\n'
    await assert.rejects(
      () => resolveExpressions('$(pass:elastic/empty)', '', { execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /empty output/)
        return true
      }
    )
  })
})

// ---------------------------------------------------------------------------
// credential_manager resolver
// ---------------------------------------------------------------------------

describe('credential_manager resolver', () => {
  it('resolves a credential on Windows via EncodedCommand', async () => {
    const platform = 'win32'
    const exec = (cmd: string) => {
      assert.match(cmd, /powershell/)
      assert.match(cmd, /-EncodedCommand/)
      const b64 = cmd.split('-EncodedCommand ')[1]!
      const decoded = Buffer.from(b64, 'base64').toString('utf16le')
      assert.match(decoded, /Get-StoredCredential/)
      assert.match(decoded, /elastic-cli\/my-api-key/)
      return 'credential-secret\n'
    }
    const result = await resolveExpressions('$(credential_manager:elastic-cli/my-api-key)', '', { platform, execSync: exec })
    assert.equal(result, 'credential-secret')
  })

  it('throws on macOS', async () => {
    const platform = 'darwin'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:svc/acct)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /only supported on Windows/)
        assert.match(err.message, /darwin/)
        return true
      }
    )
  })

  it('throws on Linux', async () => {
    const platform = 'linux'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:svc/acct)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /only supported on Windows/)
        assert.match(err.message, /linux/)
        return true
      }
    )
  })

  it('throws for missing slash in parameter', async () => {
    const platform = 'win32'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:no-slash)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for leading slash', async () => {
    const platform = 'win32'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:/account)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for trailing slash', async () => {
    const platform = 'win32'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:service/)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /expected format "service\/account"/)
        return true
      }
    )
  })

  it('throws for non-printable characters', async () => {
    const platform = 'win32'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:svc/acct\x00)', '', { platform }),
      (err: Error) => {
        assert.match(err.message, /non-printable characters/)
        return true
      }
    )
  })

  it('splits on first slash only (account can contain slashes)', async () => {
    const platform = 'win32'
    const exec = (cmd: string) => {
      const b64 = cmd.split('-EncodedCommand ')[1]!
      const decoded = Buffer.from(b64, 'base64').toString('utf16le')
      assert.match(decoded, /my-service\/path\/to\/key/)
      return 'value\n'
    }
    const result = await resolveExpressions('$(credential_manager:my-service/path/to/key)', '', { platform, execSync: exec })
    assert.equal(result, 'value')
  })

  it('uses PowerShell escaping (doubled single quotes) in encoded command', async () => {
    const platform = 'win32'
    let capturedCmd = ''
    const exec = (cmd: string) => {
      capturedCmd = cmd
      return 'val\n'
    }
    await resolveExpressions("$(credential_manager:it's-a-service/acct)", '', { platform, execSync: exec })
    const b64 = capturedCmd.split('-EncodedCommand ')[1]!
    const decoded = Buffer.from(b64, 'base64').toString('utf16le')
    assert.ok(decoded.includes("'it''s-a-service/acct'"), `expected PS-escaped target in decoded command: ${decoded}`)
  })

  it('throws when credential manager returns empty password', async () => {
    const platform = 'win32'
    const exec = () => '\n'
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:my-svc/my-acct)', '', { platform, execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /empty password/)
        assert.match(err.message, /service="my-svc"/)
        return true
      }
    )
  })

  it('includes service and account in error on failure', async () => {
    const platform = 'win32'
    const exec = () => {
      throw new Error('Get-StoredCredential is not recognized')
    }
    await assert.rejects(
      () => resolveExpressions('$(credential_manager:my-svc/my-acct)', '', { platform, execSync: exec }),
      (err: Error) => {
        assert.match(err.message, /service="my-svc"/)
        assert.match(err.message, /account="my-acct"/)
        return true
      }
    )
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
