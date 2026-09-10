/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards against broken `npm install -g @elastic/cli` failures where
 * dependencies are missing because the global install left their node_modules/
 * directories empty. The fix is to ship bundled dependencies inside the
 * published tarball via `bundleDependencies`.
 *
 * Only private workspace packages (not published to npm) need bundling.
 * Public npm packages like @elastic/schemas are resolved normally by the
 * installer and must NOT appear here.
 */

interface PackageJsonShape {
  dependencies?: Record<string, string>
  bundleDependencies?: string[]
}

function readJson (relPath: string): PackageJsonShape {
  const raw = readFileSync(resolve(process.cwd(), relPath), 'utf8')
  return JSON.parse(raw) as PackageJsonShape
}

describe('package.json -- npm install invariants', () => {
  const root = readJson('package.json')

  it('bundles @elastic/config-resolver (private workspace package) into the published tarball', () => {
    assert.ok(
      root.bundleDependencies?.includes('@elastic/config-resolver') ?? false,
      '@elastic/config-resolver must appear in "bundleDependencies" (it is a private workspace package not on npm)'
    )
  })

  it('does not bundle @elastic/schemas (public npm package)', () => {
    assert.ok(
      !(root.bundleDependencies?.includes('@elastic/schemas') ?? false),
      '@elastic/schemas must not appear in "bundleDependencies" (it is a public npm package)'
    )
  })
})
