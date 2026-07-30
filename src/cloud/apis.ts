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

/**
 * Returns all hosted Cloud API definitions, lazy-loading the per-namespace
 * modules from `@elastic/schemas` on first call.
 */
export async function loadCloudApis (): Promise<CloudApiDefinition[]> {
  if (_allCloudApis != null) return _allCloudApis

  const [
    { accountsDefinitions },
    { authenticationDefinitions },
    { billingCostsAnalysisDefinitions },
    { deploymentTemplatesDefinitions },
    { deploymentsDefinitions },
    { deploymentsTrafficFilterDefinitions },
    { extensionsDefinitions },
    { organizationsDefinitions },
    { stackDefinitions },
    { trustedEnvironmentsDefinitions },
    { userRoleAssignmentsDefinitions },
  ] = await Promise.all([
    import('@elastic/schemas/cloud/tools/apis/accounts.js'),
    import('@elastic/schemas/cloud/tools/apis/authentication.js'),
    import('@elastic/schemas/cloud/tools/apis/billing-costs-analysis.js'),
    import('@elastic/schemas/cloud/tools/apis/deployment-templates.js'),
    import('@elastic/schemas/cloud/tools/apis/deployments.js'),
    import('@elastic/schemas/cloud/tools/apis/deployments-traffic-filter.js'),
    import('@elastic/schemas/cloud/tools/apis/extensions.js'),
    import('@elastic/schemas/cloud/tools/apis/organizations.js'),
    import('@elastic/schemas/cloud/tools/apis/stack.js'),
    import('@elastic/schemas/cloud/tools/apis/trusted-environments.js'),
    import('@elastic/schemas/cloud/tools/apis/user-role-assignments.js'),
  ])

  _allCloudApis = [
    ...accountsDefinitions,
    ...authenticationDefinitions,
    ...billingCostsAnalysisDefinitions,
    ...deploymentTemplatesDefinitions,
    ...deploymentsDefinitions,
    ...deploymentsTrafficFilterDefinitions,
    ...extensionsDefinitions,
    ...organizationsDefinitions,
    ...stackDefinitions,
    ...trustedEnvironmentsDefinitions,
    ...userRoleAssignmentsDefinitions,
  ] as CloudApiDefinition[]

  _allCloudApis = await Promise.all(_allCloudApis.map(resolveDefinition))

  return _allCloudApis
}
