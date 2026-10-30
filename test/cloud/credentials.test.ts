/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import {
  applyCredentialPolicy,
  extractProjectFields,
  isCredentialCommand,
  isResetCredentialsCommand,
  readCredentialPolicyOptions,
  redactCredentials,
} from '../../src/cloud/credentials.ts'
import type { JsonValue } from '../../src/factory.ts'
import type { SecretStoreDeps } from '../../src/config/secret-store.ts'

const CREATE_RESPONSE: JsonValue = {
  id: 'p-123',
  name: 'scratch-es',
  type: 'elasticsearch',
  region_id: 'aws-us-east-1',
  endpoints: {
    elasticsearch: 'https://p-123.es.us-east-1.aws.elastic.cloud',
    kibana: 'https://p-123.kb.us-east-1.aws.elastic.cloud',
  },
  credentials: {
    username: 'admin',
    password: 'super-secret-admin-pass',
  },
}

const RESET_RESPONSE: JsonValue = {
  credentials: {
    username: 'admin',
    password: 'new-rotated-password',
  },
}

describe('isCredentialCommand / isResetCredentialsCommand', () => {
  it('matches create + reset across all three project types', () => {
    for (const prefix of ['elasticsearch', 'observability', 'security']) {
      assert.equal(isCredentialCommand(`create-${prefix}-project`), true)
      assert.equal(isCredentialCommand(`reset-${prefix}-project-credentials`), true)
      assert.equal(isResetCredentialsCommand(`reset-${prefix}-project-credentials`), true)
    }
  })
  it('does not match list / get / patch / delete', () => {
    for (const n of ['list-elasticsearch-projects', 'get-elasticsearch-project', 'patch-elasticsearch-project', 'delete-elasticsearch-project']) {
      assert.equal(isCredentialCommand(n), false)
    }
  })
})

describe('extractProjectFields', () => {
  it('pulls id, endpoints, and credentials from a create response', () => {
    const x = extractProjectFields(CREATE_RESPONSE)
    assert.equal(x.id, 'p-123')
    assert.equal(x.endpoints.elasticsearch, 'https://p-123.es.us-east-1.aws.elastic.cloud')
    assert.equal(x.credentials.username, 'admin')
    assert.equal(x.credentials.password, 'super-secret-admin-pass')
  })

  it('pulls only credentials from a reset response', () => {
    const x = extractProjectFields(RESET_RESPONSE)
    assert.equal(x.id, undefined)
    assert.equal(x.endpoints.elasticsearch, undefined)
    assert.equal(x.credentials.password, 'new-rotated-password')
  })

  it('tolerates flat {username, password} responses', () => {
    const x = extractProjectFields({ username: 'admin', password: 'flat' } as JsonValue)
    assert.equal(x.credentials.password, 'flat')
  })

  it('returns empty shape for non-objects', () => {
    const x = extractProjectFields('not-an-object' as unknown as JsonValue)
    assert.deepEqual(x, { credentials: {}, endpoints: {} })
  })
})

describe('redactCredentials', () => {
  it('replaces password with a marker and keeps username', () => {
    const out = redactCredentials(CREATE_RESPONSE, '(saved)') as { credentials: { password: string; username: string } }
    assert.equal(out.credentials.password, '(saved)')
    assert.equal(out.credentials.username, 'admin')
  })

  it('handles flat-shape responses', () => {
    const out = redactCredentials({ username: 'admin', password: 'x' } as JsonValue, '(saved)') as { password: string; username: string }
    assert.equal(out.password, '(saved)')
    assert.equal(out.username, 'admin')
  })

  it('is a no-op for non-objects', () => {
    assert.equal(redactCredentials('hi' as unknown as JsonValue, '(saved)'), 'hi')
  })
})

describe('readCredentialPolicyOptions', () => {
  it('extracts all five flags', () => {
    const opts = readCredentialPolicyOptions({
      'save-as': 'prod',
      'credentials-file': '/tmp/c.yml',
      'force': true,
      'config-file': '/tmp/cfg.yml',
      'show-credentials': true,
      'irrelevant': 'x',
    })
    assert.deepEqual(opts, { saveAs: 'prod', credentialsFile: '/tmp/c.yml', force: true, configFile: '/tmp/cfg.yml', showCredentials: true })
  })

  it('skips empty strings', () => {
    const opts = readCredentialPolicyOptions({ 'save-as': '' })
    assert.deepEqual(opts, {})
  })

  it('does not set showCredentials when flag is absent', () => {
    const opts = readCredentialPolicyOptions({ 'save-as': 'dev' })
    assert.equal(opts.showCredentials, undefined)
  })
})

describe('applyCredentialPolicy', () => {
  let dir: string
  const restores: Array<() => void> = []

  before(async () => { dir = await mkdtemp(join(tmpdir(), 'elastic-cli-cred-policy-')) })
  after(async () => rm(dir, { recursive: true, force: true }))

  beforeEach(() => {
    while (restores.length > 0) restores.pop()!()
  })

  interface SecretStoreStub {
    calls: Array<{ cmd: string; options: unknown }>
    deps: SecretStoreDeps
  }

  function stubSecretStore (kind: 'keychain' | 'none'): SecretStoreStub {
    const calls: Array<{ cmd: string; options: unknown }> = []
    if (kind === 'keychain') {
      return {
        calls,
        deps: {
          platform: 'darwin',
          execSync: ((cmd: string, options?: unknown) => {
            calls.push({ cmd, options })
            return ''
          }) as unknown as typeof import('node:child_process').execSync,
          spawnSync: ((file: string, args?: readonly string[], options?: unknown) => {
            calls.push({ cmd: [file, ...(args ?? [])].join(' '), options })
            return { status: 0, stdout: '', stderr: '', error: undefined, pid: 0, output: [null, '', ''], signal: null }
          }) as unknown as typeof import('node:child_process').spawnSync,
        },
      }
    }
    return {
      calls,
      deps: {
        platform: 'linux',
        execSync: ((cmd: string, options?: unknown) => {
          calls.push({ cmd, options })
          throw new Error('not installed')
        }) as unknown as typeof import('node:child_process').execSync,
        spawnSync: ((file: string, args?: readonly string[], options?: unknown) => {
          calls.push({ cmd: [file, ...(args ?? [])].join(' '), options })
          const missing = Object.assign(new Error('not found'), { code: 'ENOENT' })
          return { status: null, stdout: '', stderr: '', error: missing, pid: 0, output: [null, '', ''], signal: null }
        }) as unknown as typeof import('node:child_process').spawnSync,
      },
    }
  }

  it('passthrough without --show-credentials redacts the password', async () => {
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {})
    assert.equal(res.log.mode, 'passthrough')
    const body = res.body as { credentials: { password: string; username: string } }
    assert.match(body.credentials.password, /redacted/)
    assert.equal(body.credentials.username, 'admin')
    assert.equal(res.log.warnings.length, 0)
  })

  it('passthrough with showCredentials: true returns the password and warns', async () => {
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { showCredentials: true })
    assert.equal(res.log.mode, 'passthrough')
    const body = res.body as { credentials: { password: string } }
    assert.equal(body.credentials.password, 'super-secret-admin-pass')
    assert.ok(res.log.warnings.some(w => /plain text/i.test(w)))
  })

  it('--save-as writes a context, redacts the response, and stores the password in the keychain', async () => {
    const cfg = join(dir, 'save-as-keychain.yml')
    const { calls, deps } = stubSecretStore('keychain')
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'scratch',
      configFile: cfg,
    }, deps)

    // stdout redaction
    const body = res.body as { credentials: { password: string; username: string }; savedAs: string; configFile: string }
    assert.equal(body.credentials.password, '(saved to keychain)')
    assert.equal(body.credentials.username, 'admin')
    assert.equal(body.savedAs, 'scratch')
    assert.equal(body.configFile, cfg)

    // YAML written with $(keychain:...) expressions
    const yaml = await readFile(cfg, 'utf-8')
    const parsed = parseYaml(yaml) as { contexts: { scratch: { elasticsearch: { auth: { password: string } } } } }
    assert.match(
      parsed.contexts.scratch.elasticsearch.auth.password,
      /^\$\(keychain:elastic-cli\/scratch:elasticsearch\.auth\.password\)$/
    )

    // keychain put was called for both elasticsearch + kibana passwords
    assert.ok(calls.some(c => (c.cmd as string).includes('elasticsearch.auth.password')))
    assert.ok(calls.some(c => (c.cmd as string).includes('kibana.auth.password')))
  })

  it('--save-as updates the existing ~/.elasticrc instead of creating ~/.elasticrc.yml (#727)', async () => {
    const home = await mkdtemp(join(tmpdir(), 'elastic-cli-save-as-home-'))
    for (const key of ['HOME', 'USERPROFILE', 'ELASTIC_CLI_CONFIG_FILE']) {
      const prev = process.env[key]
      restores.push(() => {
        if (prev === undefined) delete process.env[key]
        else process.env[key] = prev
      })
    }
    process.env.HOME = home
    process.env.USERPROFILE = home
    delete process.env.ELASTIC_CLI_CONFIG_FILE
    try {
      const { deps } = stubSecretStore('keychain')
      await writeFile(join(home, '.elasticrc'), 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: http://a:9200\n')
      const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'scratch' }, deps)
      assert.equal((res.body as { configFile: string }).configFile, join(home, '.elasticrc'))
      const parsed = parseYaml(await readFile(join(home, '.elasticrc'), 'utf-8')) as { contexts: Record<string, unknown> }
      assert.deepEqual(Object.keys(parsed.contexts), ['a', 'scratch'])
      await assert.rejects(stat(join(home, '.elasticrc.yml')), { code: 'ENOENT' })
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('--save-as without --force on an existing context throws', async () => {
    const cfg = join(dir, 'collision.yml')
    const { deps } = stubSecretStore('keychain')
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'only', configFile: cfg }, deps)
    await assert.rejects(
      () => applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'only', configFile: cfg }, deps),
      /already exists/
    )
  })

  it('--save-as --force overwrites', async () => {
    const cfg = join(dir, 'overwrite.yml')
    const { deps } = stubSecretStore('keychain')
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'x', configFile: cfg }, deps)
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'x', configFile: cfg, force: true,
    }, deps)
    assert.equal(res.log.mode, 'save-as')
  })

  it('reset-credentials --save-as updates an existing context', async () => {
    const cfg = join(dir, 'reset.yml')
    const { deps } = stubSecretStore('keychain')
    // seed the context via create
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'live', configFile: cfg }, deps)
    // rotate
    const res = await applyCredentialPolicy('reset-elasticsearch-project-credentials', RESET_RESPONSE, {
      saveAs: 'live', configFile: cfg,
    }, deps)
    assert.equal(res.log.mode, 'save-as')
    const yaml = await readFile(cfg, 'utf-8')
    const parsed = parseYaml(yaml) as { contexts: { live: { elasticsearch: { url: string; auth: { password: string } } } } }
    // URL unchanged, password still a $(keychain:...) expression
    assert.equal(parsed.contexts.live.elasticsearch.url, 'https://p-123.es.us-east-1.aws.elastic.cloud')
    assert.match(parsed.contexts.live.elasticsearch.auth.password, /^\$\(keychain:/)
  })

  it('reset-credentials --save-as on an unknown context errors clearly', async () => {
    const cfg = join(dir, 'reset-missing.yml')
    const { deps } = stubSecretStore('keychain')
    await assert.rejects(
      () => applyCredentialPolicy('reset-elasticsearch-project-credentials', RESET_RESPONSE, { saveAs: 'ghost', configFile: cfg }, deps),
      /requires an existing context/
    )
  })

  it('--credentials-file writes a standalone fragment', async () => {
    const cfg = join(dir, 'main.yml')
    const frag = join(dir, 'fragment.yml')
    const { deps } = stubSecretStore('keychain')
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      credentialsFile: frag, configFile: cfg,
    }, deps)
    assert.equal(res.log.mode, 'credentials-file')
    const body = res.body as { credentialsFile: string }
    assert.equal(body.credentialsFile, frag)
    const yaml = await readFile(frag, 'utf-8')
    const parsed = parseYaml(yaml) as { current_context: string; contexts: Record<string, unknown> }
    assert.ok(parsed.current_context.length > 0)
  })

  it('falls back to inline secrets when no keychain is available and warns', async () => {
    const cfg = join(dir, 'no-keychain.yml')
    const { deps } = stubSecretStore('none')
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'inline-fallback', configFile: cfg,
    }, deps)
    assert.equal(res.log.mode, 'save-as')
    assert.ok(res.log.warnings.some(w => /No OS secret store/i.test(w)))
    const yaml = await readFile(cfg, 'utf-8')
    const parsed = parseYaml(yaml) as { contexts: { 'inline-fallback': { elasticsearch: { auth: { password: string } } } } }
    assert.equal(parsed.contexts['inline-fallback'].elasticsearch.auth.password, 'super-secret-admin-pass')
    // stdout redaction marker reflects the actual storage path — inline, not keychain
    const body = res.body as { credentials: { password: string } }
    assert.equal(body.credentials.password, '(saved inline to config)')
  })

  it('writes inline when secret-tool exists but the keyring rejects the write', async () => {
    const cfg = join(dir, 'secret-tool-reject.yml')
    const calls: Array<{ cmd: string }> = []
    const deps: SecretStoreDeps = {
      platform: 'linux',
      execSync: ((cmd: string) => {
        calls.push({ cmd })
        throw new Error('pass missing')
      }) as unknown as typeof import('node:child_process').execSync,
      spawnSync: ((file: string, args?: readonly string[]) => {
        calls.push({ cmd: [file, ...(args ?? [])].join(' ') })
        const argv = args ?? []
        if (argv[0] === 'store') {
          return { status: 1, stdout: '', stderr: 'no D-Bus session', error: undefined, pid: 0, output: [null, '', 'no D-Bus session'], signal: null }
        }
        return { status: 2, stdout: '', stderr: 'usage: secret-tool', error: undefined, pid: 0, output: [null, '', 'usage: secret-tool'], signal: null }
      }) as unknown as typeof import('node:child_process').spawnSync,
    }
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'rejected',
      configFile: cfg,
    }, deps)
    assert.equal(res.log.storage, 'none')
    assert.ok(res.log.warnings.some(w => /No OS secret store/i.test(w)))
    assert.ok(calls.some(c => c.cmd.includes('secret-tool store')))
    const yaml = await readFile(cfg, 'utf-8')
    const parsed = parseYaml(yaml) as { contexts: { rejected: { elasticsearch: { auth: { password: string } } } } }
    assert.equal(parsed.contexts.rejected.elasticsearch.auth.password, 'super-secret-admin-pass')
    const body = res.body as { credentials: { password: string } }
    assert.equal(body.credentials.password, '(saved inline to config)')
  })

  it('passthrough when response has no password field', async () => {
    const res = await applyCredentialPolicy('create-elasticsearch-project', { id: 'no-creds' } as JsonValue, { saveAs: 'nope' })
    assert.equal(res.log.mode, 'passthrough')
  })

  it('--credentials-file refuses existing file without --force', async () => {
    const frag = join(dir, 'already-there.yml')
    const { deps } = stubSecretStore('keychain')
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { credentialsFile: frag }, deps)
    await assert.rejects(
      () => applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { credentialsFile: frag }, deps),
      /already exists/
    )
  })
})
