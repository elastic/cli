/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `src/es/api-manifest.ts` and `src/kb/api-manifest.ts` are thin re-exports of
 * `@elastic/schemas`' manifests -- the manifest itself is upstream-owned. A
 * `@elastic/schemas` version bump can silently add, rename, or drop commands
 * with nothing in CI noticing, and registration silently depends on the
 * manifest and the per-namespace definition files staying in agreement.
 *
 * This file guards against that drift for every namespace registered from
 * `@elastic/schemas` (es, kb, cloud, serverless). It doesn't belong in any
 * single existing per-namespace test file (apis.test.ts, register.test.ts)
 * because it is a cross-cutting, cross-namespace concern about the manifest
 * boundary itself, not any one namespace's loading/registration behavior.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apiManifest, loadEsApi, loadAllEsApis } from '../../src/es/apis.ts'
import { kbApiManifest, loadKbApi, loadAllKbApis } from '../../src/kb/apis.ts'
import { loadCloudApis } from '../../src/cloud/apis.ts'
import { loadServerlessApis } from '../../src/cloud/serverless-apis.ts'

/** Builds an actionable failure message for a command-count pin. Names what changed and
 * warns against reflexively updating the expected count. */
function countDriftMessage (namespace: string, expected: number, actual: number): string {
  return `${namespace} command count changed: expected ${expected}, got ${actual} (${actual > expected ? '+' : ''}${actual - expected}).\n` +
    `This means an @elastic/schemas upgrade added or removed ${namespace} command(s). Review what changed ` +
    `(new/renamed/removed commands) before updating the expected count in this test to ${actual} -- ` +
    'do not bump it reflexively without checking which commands moved.'
}

describe('manifest/definition parity (upstream drift guard)', () => {
  describe('es', () => {
    it('every manifest entry resolves to a loadable definition', async () => {
      for (const meta of apiManifest) {
        await assert.doesNotReject(
          loadEsApi(meta),
          `es manifest entry "${meta.namespace != null ? `${meta.namespace} ${meta.name}` : meta.name}" (${meta.namespaceFile}.js) has no matching definition`
        )
      }
    })

    it('every definition is reachable from the manifest (no orphaned commands)', async () => {
      const all = await loadAllEsApis()
      const reachable = new Set<string>()
      for (const meta of apiManifest) {
        const def = await loadEsApi(meta)
        reachable.add(`${def.namespace ?? ''}\u0000${def.name}`)
      }
      const orphans = all
        .filter((d) => !reachable.has(`${d.namespace ?? ''}\u0000${d.name}`))
        .map((d) => (d.namespace != null ? `${d.namespace} ${d.name}` : d.name))
      assert.deepEqual(orphans, [], `es definitions exported but not reachable from the manifest: ${orphans.join(', ')}`)
    })

    it('pins the es command count', () => {
      const expected = 573
      assert.equal(apiManifest.length, expected, countDriftMessage('es', expected, apiManifest.length))
    })
  })

  describe('kb', () => {
    it('every manifest entry resolves to a loadable definition', async () => {
      for (const meta of kbApiManifest) {
        await assert.doesNotReject(
          loadKbApi(meta),
          `kb manifest entry "${meta.namespace} ${meta.name}" (${meta.namespaceFile}.js) has no matching definition`
        )
      }
    })

    it('every definition is reachable from the manifest (no orphaned commands)', async () => {
      const all = await loadAllKbApis()
      const reachable = new Set<string>()
      for (const meta of kbApiManifest) {
        const def = await loadKbApi(meta)
        reachable.add(`${def.namespace}\u0000${def.name}`)
      }
      const orphans = all
        .filter((d) => !reachable.has(`${d.namespace}\u0000${d.name}`))
        .map((d) => `${d.namespace} ${d.name}`)
      assert.deepEqual(orphans, [], `kb definitions exported but not reachable from the manifest: ${orphans.join(', ')}`)
    })

    it('pins the kb command count', () => {
      const expected = 555
      assert.equal(kbApiManifest.length, expected, countDriftMessage('kb', expected, kbApiManifest.length))
    })
  })

  // cloud and serverless have no upstream manifest -- src/cloud/apis.ts and
  // src/cloud/serverless-apis.ts each hardcode their own list of namespace-file
  // imports, so there's no manifest/definition parity to check. Pinning the
  // loaded count still catches an upstream add/remove going unnoticed.
  describe('cloud', () => {
    it('pins the cloud command count', async () => {
      const expected = 112
      const actual = (await loadCloudApis()).length
      assert.equal(actual, expected, countDriftMessage('cloud', expected, actual))
    })
  })

  describe('serverless', () => {
    it('pins the serverless command count', async () => {
      const expected = 41
      const actual = (await loadServerlessApis()).length
      assert.equal(actual, expected, countDriftMessage('serverless', expected, actual))
    })
  })
})
