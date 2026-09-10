/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import { createDefinitionResolver, requireSchemaModule } from '../lib/json-schema-refs.ts'
import { toExportStem } from '../lib/namespace-file-export.ts'
import { apiManifest } from './api-manifest.ts'

/** Lazily loaded cache of all hosted Cloud API definitions. */
let _allCloudApis: CloudApiDefinition[] | null = null

/**
 * Rewrites each definition's `input` into a self-contained schema, inlining
 * the shared type definitions its `$ref`s point at (`_defs.json`).
 */
const resolveDefinition = createDefinitionResolver<CloudApiDefinition>('@elastic/schemas/cloud/json')

/** Distinct namespace files to load, sourced from the manifest so this list never drifts. */
const CLOUD_NAMESPACE_FILES: readonly string[] = [...new Set(apiManifest.map((m) => m.namespaceFile))]

/**
 * Returns all hosted Cloud API definitions, lazy-loading the per-namespace
 * modules from `@elastic/schemas` on first call.
 */
export async function loadCloudApis (): Promise<CloudApiDefinition[]> {
  if (_allCloudApis != null) return _allCloudApis

  let all: CloudApiDefinition[] = []
  for (const file of CLOUD_NAMESPACE_FILES) {
    const mod = await requireSchemaModule(`@elastic/schemas/cloud/tools/apis/${file}.js`)
    const exportKey = `${toExportStem(file)}Definitions`
    const arr = mod[exportKey]
    if (!Array.isArray(arr)) {
      throw new Error(`internal error: ${file}.js did not export ${exportKey}`)
    }
    all = all.concat(arr as CloudApiDefinition[])
  }

  _allCloudApis = await Promise.all(all.map(resolveDefinition))

  return _allCloudApis
}
