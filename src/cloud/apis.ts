/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'
import { createDefinitionResolver } from '../lib/json-schema-refs.ts'

/** Lazily loaded cache of all hosted Cloud API definitions. */
let _allCloudApis: CloudApiDefinition[] | null = null

/**
 * Rewrites each definition's `input` into a self-contained schema, inlining
 * the shared type definitions its `$ref`s point at (`_defs.json`).
 */
const resolveDefinition = createDefinitionResolver<CloudApiDefinition>('@elastic/schemas/cloud/json')

/** Per-namespace-file module to load, and the export key it exposes its definitions under. */
const CLOUD_API_MODULES: ReadonlyArray<{ file: string; exportKey: string }> = [
  { file: 'accounts', exportKey: 'accountsDefinitions' },
  { file: 'authentication', exportKey: 'authenticationDefinitions' },
  { file: 'billing-costs-analysis', exportKey: 'billingCostsAnalysisDefinitions' },
  { file: 'deployment-templates', exportKey: 'deploymentTemplatesDefinitions' },
  { file: 'deployments', exportKey: 'deploymentsDefinitions' },
  { file: 'deployments-traffic-filter', exportKey: 'deploymentsTrafficFilterDefinitions' },
  { file: 'extensions', exportKey: 'extensionsDefinitions' },
  { file: 'organizations', exportKey: 'organizationsDefinitions' },
  { file: 'stack', exportKey: 'stackDefinitions' },
  { file: 'trusted-environments', exportKey: 'trustedEnvironmentsDefinitions' },
  { file: 'user-role-assignments', exportKey: 'userRoleAssignmentsDefinitions' },
]

/**
 * Returns all hosted Cloud API definitions, lazy-loading the per-namespace
 * modules from `@elastic/schemas` on first call.
 */
export async function loadCloudApis (): Promise<CloudApiDefinition[]> {
  if (_allCloudApis != null) return _allCloudApis

  const mods = await Promise.all(
    CLOUD_API_MODULES.map(async ({ file }) => {
      const fileUrl = import.meta.resolve(`@elastic/schemas/cloud/tools/apis/${file}.js`)
      return import(fileUrl) as Promise<Record<string, unknown>>
    })
  )

  let all: CloudApiDefinition[] = []
  for (let i = 0; i < mods.length; i++) {
    const { file, exportKey } = CLOUD_API_MODULES[i]!
    const arr = mods[i]![exportKey]
    if (!Array.isArray(arr)) {
      throw new Error(`internal error: ${file}.js did not export ${exportKey}`)
    }
    all = all.concat(arr as CloudApiDefinition[])
  }

  _allCloudApis = await Promise.all(all.map(resolveDefinition))

  return _allCloudApis
}
