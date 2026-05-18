/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards against a recurrence of the broken-`npm install -g @elastic/cli`
 * failure where the binary crashed with `Cannot find package 'zod'` because
 * the global install left `node_modules/zod/` empty.
 *
 * Root cause: `@elastic/es-schemas` is shipped via `bundledDependencies`
 * and declares `zod` as a peer dependency. During a global install npm
 * cannot hoist `zod` to a parent `node_modules`, and the bundled-dep +
 * peer-dep interaction makes its dependency resolver create an empty
 * placeholder directory for `zod` without populating it. The simplest
 * deterministic fix is to ship `zod` inside the published tarball by
 * adding it to `bundledDependencies` as well.
 *
 * These invariants make sure nobody silently removes `zod` from the
 * bundle or lets the version drift out of sync with the peer dep
 * required by the bundled `@elastic/es-schemas` workspace package.
 */

interface PackageJsonShape {
  dependencies?: Record<string, string>
  bundledDependencies?: string[]
  peerDependencies?: Record<string, string>
}

function readJson (relPath: string): PackageJsonShape {
  const raw = readFileSync(resolve(process.cwd(), relPath), 'utf8')
  return JSON.parse(raw) as PackageJsonShape
}

describe('package.json -- npm install invariants', () => {
  const root = readJson('package.json')
  const esSchemas = readJson('packages/es-schemas/package.json')

  it('declares zod as a regular dependency', () => {
    assert.ok(
      root.dependencies?.['zod'] != null,
      'zod must be listed under "dependencies" so it is recorded as a production dep'
    )
  })

  it('bundles zod into the published tarball', () => {
    assert.ok(
      Array.isArray(root.bundledDependencies),
      '"bundledDependencies" must be an array'
    )
    assert.ok(
      root.bundledDependencies?.includes('zod') ?? false,
      'zod must appear in "bundledDependencies" so `npm install -g` does not leave node_modules/zod/ empty'
    )
  })

  it('bundles every workspace package that declares zod as a peer dependency', () => {
    // If a bundled workspace package needs zod, the top-level zod must be
    // bundled too -- otherwise npm tries to resolve the peer dep at install
    // time and trips the empty-placeholder bug.
    if (esSchemas.peerDependencies?.['zod'] != null) {
      assert.ok(
        root.bundledDependencies?.includes('zod') ?? false,
        '@elastic/es-schemas declares a peer dep on zod, so the top-level zod must be bundled'
      )
    }
  })
})
