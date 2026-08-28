/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves a Cloud API definition to its CLI arg path, mirroring the command
 * tree built by `src/cloud/register.ts`. The YAML test definitions reference
 * raw `namespace.name` operations (the `@elastic/schemas` source of truth);
 * this is the only place that knows how those map onto the restructured
 * `cloud …` command tree (promoted namespaces, hosted/serverless partitioning,
 * project-type inversion, cross-project merging, and display renames).
 *
 * The partition constants and `simplifyProjectCommandName` are imported from
 * `register.ts` so this resolver can never drift from the registered tree.
 */

import {
  PROJECT_NAMESPACES,
  CROSS_PROJECT_NAMESPACES,
  HOSTED_NAMESPACE_RENAMES,
  SERVERLESS_NAMESPACES,
  simplifyProjectCommandName,
} from '../../src/cloud/register.ts'
import { PROMOTED_NAMESPACES } from '../../src/cloud/constants.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'

/**
 * Returns the CLI arg tokens that follow the top-level `cloud` group for a
 * given definition (e.g. `['hosted', 'deployments', 'get-deployment']`).
 */
export function cloudCliPath (def: CloudApiDefinition): string[] {
  const ns = def.namespace

  const promoted = PROMOTED_NAMESPACES.get(ns)
  if (promoted != null) return [promoted, def.name]

  if (SERVERLESS_NAMESPACES.has(ns)) {
    const projectType = PROJECT_NAMESPACES[ns]
    if (projectType != null) {
      return ['serverless', 'projects', projectType, simplifyProjectCommandName(def.name, ns)]
    }
    if (CROSS_PROJECT_NAMESPACES.has(ns)) {
      return ['serverless', 'cross-project', def.name]
    }
    return ['serverless', ns, def.name]
  }

  const hostedDisplay = HOSTED_NAMESPACE_RENAMES.get(ns) ?? ns
  return ['hosted', hostedDisplay, def.name]
}
