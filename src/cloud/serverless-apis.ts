/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import { serverlessManifest } from '@elastic/schemas/serverless/tools/manifest.js'

/** Lazily loaded cache of all Serverless API definitions. */
let _allServerlessApis: CloudApiDefinition[] | null = null

/**
 * Returns all Serverless API definitions, lazy-loading the per-namespace
 * modules from `@elastic/schemas` on first call. The set of modules is
 * derived from the unique `namespaceFile` values in `serverlessManifest` so
 * new namespaces are picked up automatically on upgrade.
 */
export async function loadServerlessApis (): Promise<CloudApiDefinition[]> {
  if (_allServerlessApis != null) return _allServerlessApis

  const namespaceFiles = [...new Set(serverlessManifest.map(e => e.namespaceFile))]

  const modules = await Promise.all(
    namespaceFiles.map(nf => import(`@elastic/schemas/serverless/tools/apis/${nf}.js`))
  )

  _allServerlessApis = modules.flatMap((mod, i) => {
    const nf = namespaceFiles[i]!
    const defKey = Object.keys(mod as Record<string, unknown>).find(
      k => Array.isArray((mod as Record<string, unknown>)[k]) && k.endsWith('Definitions')
    )
    if (defKey == null) throw new Error(`serverless module ${nf}.js has no *Definitions array export`)
    return (mod as Record<string, unknown[]>)[defKey] as CloudApiDefinition[]
  })

  return _allServerlessApis
}
