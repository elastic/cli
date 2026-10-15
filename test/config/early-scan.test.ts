/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from 'yaml'
import { scanEarlyHints } from '../../src/config/early-scan.ts'

const bench = 'current_context: bench\ncontexts:\n  bench:\n    elasticsearch:\n      url: http://localhost:9200\n      auth:\n        api_key: static-key\n'

/** Ground truth via the real parser: active context's version hints, or undefined when not derivable. */
function viaYaml (text: string, override?: string): { elasticsearch?: string, kibana?: string } | undefined {
  const raw = parse(text) as { current_context?: string, contexts?: Record<string, Record<string, { version?: unknown }>> }
  const ctx = raw.contexts?.[override ?? raw.current_context ?? '']
  if (ctx == null) return undefined
  const out: { elasticsearch?: string, kibana?: string } = {}
  if (typeof ctx['elasticsearch']?.version === 'string') out.elasticsearch = ctx['elasticsearch'].version
  if (typeof ctx['kibana']?.version === 'string') out.kibana = ctx['kibana'].version
  return out
}

describe('scanEarlyHints', () => {
  const supported: Array<[string, string, string?]> = [
    ['no versions', bench],
    ['quoted version', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      version: "9.1"\n      url: http://x\n'],
    ['single quoted', "current_context: a\ncontexts:\n  a:\n    kibana:\n      version: '9.2.3'\n"],
    ['plain semver and serverless', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      version: 9.2.3\n    kibana:\n      version: serverless\n'],
    ['comments and blank lines', '# top\n\ncurrent_context: a # active\ncontexts:\n  a: # ctx\n    elasticsearch:\n      version: "9.1" # pinned\n\n'],
    ['version only in inactive context', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: http://x\n  b:\n    elasticsearch:\n      version: "8.0"\n'],
    ['context before current_context', 'contexts:\n  a:\n    elasticsearch:\n      version: "9.1"\ncurrent_context: a\n'],
    ['override picks another context', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      version: "9.1"\n  b:\n    elasticsearch:\n      version: "8.0"\n', 'b'],
  ]
  for (const [name, text, override] of supported) {
    it(`matches yaml: ${name}`, () => {
      assert.deepEqual(scanEarlyHints(text, override), viaYaml(text, override))
    })
  }

  const unsupported: Array<[string, string]> = [
    ['anchors', 'current_context: a\ncontexts:\n  a: &x\n    elasticsearch:\n      version: "9.1"\n'],
    ['aliases', 'current_context: a\nbase: &b\n  version: "9.1"\ncontexts:\n  a:\n    elasticsearch: *b\n'],
    ['merge key', 'current_context: a\ncontexts:\n  a:\n    <<: {}\n'],
    ['flow mapping', 'current_context: a\ncontexts: {a: {elasticsearch: {version: "9.1"}}}\n'],
    ['flow version', 'current_context: a\ncontexts:\n  a:\n    elasticsearch: {version: "9.1"}\n'],
    ['multi-doc', '---\ncurrent_context: a\n---\ncontexts: {}\n'],
    ['tabs', 'current_context: a\ncontexts:\n\ta:\n\t\telasticsearch: {}\n'],
    ['quoted key', 'current_context: a\n"contexts":\n  a:\n    elasticsearch:\n      version: "9.1"\n'],
    ['json', '{"current_context":"a","contexts":{"a":{"elasticsearch":{"version":"9.1"}}}}'],
    ['commands policy', 'current_context: a\ncommands:\n  allowed: [x]\ncontexts:\n  a:\n    elasticsearch:\n      url: http://x\n'],
    ['context commands policy', 'current_context: a\ncontexts:\n  a:\n    commands:\n      blocked:\n        - x\n'],
    ['default_profile', 'current_context: a\ndefault_profile: serverless\ncontexts:\n  a:\n    elasticsearch:\n      url: http://x\n'],
    ['numeric version', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      version: 9.1\n'],
    ['null version', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      version: null\n'],
    ['block scalar', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: |\n        http://x\n'],
    ['multiline quote', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: "http://x\n        y"\n'],
    ['escaped quote', 'current_context: a\ncontexts:\n  a:\n    elasticsearch:\n      url: "a\\"b"\n'],
    ['duplicate key', 'current_context: a\ncurrent_context: b\ncontexts:\n  a: {}\n'],
    ['child under scalar', 'current_context: a\n  extra: 1\ncontexts:\n  a:\n    elasticsearch:\n      version: "9.1"\n'],
    ['unknown active context', 'current_context: zzz\ncontexts:\n  a:\n    elasticsearch:\n      version: "9.1"\n'],
    ['missing current_context', 'contexts:\n  a:\n    elasticsearch:\n      version: "9.1"\n'],
    ['empty', ''],
  ]
  for (const [name, text] of unsupported) {
    it(`fails open to 'unsupported': ${name}`, () => {
      assert.equal(scanEarlyHints(text), 'unsupported')
    })
  }
})
