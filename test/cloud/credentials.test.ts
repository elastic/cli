/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
import {
  _testSetExecSync as setSecretStoreExec,
  _testSetPlatform as setSecretStorePlatform,
} from '../../src/config/secret-store.ts'

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
  it('extracts all four flags', () => {
    const opts = readCredentialPolicyOptions({
      'save-as': 'prod',
      'credentials-file': '/tmp/c.yml',
      'force': true,
      'config-file': '/tmp/cfg.yml',
      'irrelevant': 'x',
    })
    assert.deepEqual(opts, { saveAs: 'prod', credentialsFile: '/tmp/c.yml', force: true, configFile: '/tmp/cfg.yml' })
  })

  it('skips empty strings', () => {
    const opts = readCredentialPolicyOptions({ 'save-as': '' })
    assert.deepEqual(opts, {})
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

  function stubSecretStore (kind: 'keychain' | 'none'): Array<{ cmd: string; options: unknown }> {
    const calls: Array<{ cmd: string; options: unknown }> = []
    if (kind === 'keychain') {
      restores.push(setSecretStorePlatform('darwin'))
      restores.push(setSecretStoreExec(((cmd: string, options?: unknown) => {
        calls.push({ cmd, options })
        return ''
      }) as unknown as typeof import('node:child_process').execSync))
    } else {
      restores.push(setSecretStorePlatform('linux'))
      restores.push(setSecretStoreExec(((cmd: string, options?: unknown) => {
        calls.push({ cmd, options })
        throw new Error('not installed')
      }) as unknown as typeof import('node:child_process').execSync))
    }
    return calls
  }

  it('passthrough when no relevant flags are set', async () => {
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {})
    assert.equal(res.log.mode, 'passthrough')
    assert.deepEqual(res.body, CREATE_RESPONSE)
  })

  it('--save-as writes a context, redacts the response, and stores the password in the keychain', async () => {
    const cfg = join(dir, 'save-as-keychain.yml')
    const calls = stubSecretStore('keychain')
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'scratch',
      configFile: cfg,
    })

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

  it('--save-as without --force on an existing context throws', async () => {
    const cfg = join(dir, 'collision.yml')
    stubSecretStore('keychain')
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'only', configFile: cfg })
    await assert.rejects(
      () => applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'only', configFile: cfg }),
      /already exists/
    )
  })

  it('--save-as --force overwrites', async () => {
    const cfg = join(dir, 'overwrite.yml')
    stubSecretStore('keychain')
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'x', configFile: cfg })
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'x', configFile: cfg, force: true,
    })
    assert.equal(res.log.mode, 'save-as')
  })

  it('reset-credentials --save-as updates an existing context', async () => {
    const cfg = join(dir, 'reset.yml')
    stubSecretStore('keychain')
    // seed the context via create
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { saveAs: 'live', configFile: cfg })
    // rotate
    const res = await applyCredentialPolicy('reset-elasticsearch-project-credentials', RESET_RESPONSE, {
      saveAs: 'live', configFile: cfg,
    })
    assert.equal(res.log.mode, 'save-as')
    const yaml = await readFile(cfg, 'utf-8')
    const parsed = parseYaml(yaml) as { contexts: { live: { elasticsearch: { url: string; auth: { password: string } } } } }
    // URL unchanged, password still a $(keychain:...) expression
    assert.equal(parsed.contexts.live.elasticsearch.url, 'https://p-123.es.us-east-1.aws.elastic.cloud')
    assert.match(parsed.contexts.live.elasticsearch.auth.password, /^\$\(keychain:/)
  })

  it('reset-credentials --save-as on an unknown context errors clearly', async () => {
    const cfg = join(dir, 'reset-missing.yml')
    stubSecretStore('keychain')
    await assert.rejects(
      () => applyCredentialPolicy('reset-elasticsearch-project-credentials', RESET_RESPONSE, { saveAs: 'ghost', configFile: cfg }),
      /requires an existing context/
    )
  })

  it('--credentials-file writes a standalone fragment', async () => {
    const cfg = join(dir, 'main.yml')
    const frag = join(dir, 'fragment.yml')
    stubSecretStore('keychain')
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      credentialsFile: frag, configFile: cfg,
    })
    assert.equal(res.log.mode, 'credentials-file')
    const body = res.body as { credentialsFile: string }
    assert.equal(body.credentialsFile, frag)
    const yaml = await readFile(frag, 'utf-8')
    const parsed = parseYaml(yaml) as { current_context: string; contexts: Record<string, unknown> }
    assert.ok(parsed.current_context.length > 0)
  })

  it('falls back to inline secrets when no keychain is available and warns', async () => {
    const cfg = join(dir, 'no-keychain.yml')
    stubSecretStore('none')
    const res = await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, {
      saveAs: 'inline-fallback', configFile: cfg,
    })
    assert.equal(res.log.mode, 'save-as')
    assert.ok(res.log.warnings.some(w => /No OS secret store/i.test(w)))
    const yaml = await readFile(cfg, 'utf-8')
    const parsed = parseYaml(yaml) as { contexts: { 'inline-fallback': { elasticsearch: { auth: { password: string } } } } }
    assert.equal(parsed.contexts['inline-fallback'].elasticsearch.auth.password, 'super-secret-admin-pass')
    // stdout redaction marker reflects the actual storage path — inline, not keychain
    const body = res.body as { credentials: { password: string } }
    assert.equal(body.credentials.password, '(saved inline to config)')
  })

  it('passthrough when response has no password field', async () => {
    const res = await applyCredentialPolicy('create-elasticsearch-project', { id: 'no-creds' } as JsonValue, { saveAs: 'nope' })
    assert.equal(res.log.mode, 'passthrough')
  })

  it('--credentials-file refuses existing file without --force', async () => {
    const frag = join(dir, 'already-there.yml')
    stubSecretStore('keychain')
    await applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { credentialsFile: frag })
    await assert.rejects(
      () => applyCredentialPolicy('create-elasticsearch-project', CREATE_RESPONSE, { credentialsFile: frag }),
      /already exists/
    )
  })
})
