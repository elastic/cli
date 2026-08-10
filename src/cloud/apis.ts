/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import { createDefinitionResolver } from '../lib/json-schema-refs.ts'
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

  const mods = await Promise.all(
    CLOUD_NAMESPACE_FILES.map(async (file) => {
      const fileUrl = import.meta.resolve(`@elastic/schemas/cloud/tools/apis/${file}.js`)
      return import(fileUrl) as Promise<Record<string, unknown>>
    })
  )

  let all: CloudApiDefinition[] = []
  for (let i = 0; i < mods.length; i++) {
    const file = CLOUD_NAMESPACE_FILES[i]!
    const exportKey = `${toExportStem(file)}Definitions`
    const arr = mods[i]![exportKey]
    if (!Array.isArray(arr)) {
      throw new Error(`internal error: ${file}.js did not export ${exportKey}`)
    }
    all = all.concat(arr as CloudApiDefinition[])
  }

  _allCloudApis = await Promise.all(all.map(resolveDefinition))

  return _allCloudApis
}
