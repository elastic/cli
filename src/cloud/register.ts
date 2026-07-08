/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { defineCommand, defineGroup } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import type { CloudApiDefinition } from './types.ts'
import { validateCloudApiDefinition, buildCloudJsonSchema } from './types.ts'
import { allCloudApis } from './apis.ts'
import { allServerlessApis } from './serverless-apis.ts'

import { createCloudHandler, isCreateProjectCommand } from './handler.ts'
import {
  applyCredentialPolicy,
  isCredentialCommand,
  readCredentialPolicyOptions,
} from './credentials.ts'
import type { JsonValue, ParsedResult } from '../factory.ts'

/**
 * Maps project-type namespaces from codegen to short CLI group names.
 */
const PROJECT_NAMESPACES: Record<string, string> = {
  'elasticsearch-projects': 'search',
  'observability-projects': 'observability',
  'security-projects': 'security',
}

import { PROMOTED_NAMESPACES } from './constants.ts'

const CROSS_PROJECT_NAMESPACES = new Set<string>([
  'linked-projects',
  'linked-candidate-projects',
])

const HOSTED_NAMESPACE_RENAMES = new Map<string, string>([
  ['deployments-traffic-filter', 'traffic-filters'],
])

const SERVERLESS_NAMESPACES = new Set<string>([
  'elasticsearch-projects',
  'observability-projects',
  'security-projects',
  'regions',
  'traffic-filters',
  'linked-projects',
  'linked-candidate-projects',
])

export function simplifyProjectCommandName (name: string, namespace: string): string {
  const singular = namespace.endsWith('s') ? namespace.slice(0, -1) : namespace
  let simplified = name.replace(`-${namespace}`, '')
  if (simplified === name) simplified = name.replace(`-${singular}`, '')
  return simplified || name
}

function groupByNamespace (definitions: CloudApiDefinition[]): Map<string, CloudApiDefinition[]> {
  const byNamespace = new Map<string, CloudApiDefinition[]>()
  for (const def of definitions) {
    let grp = byNamespace.get(def.namespace)
    if (grp == null) { grp = []; byNamespace.set(def.namespace, grp) }
    grp.push(def)
  }
  return byNamespace
}

function checkDuplicates (defs: CloudApiDefinition[], namespace: string): void {
  const seen = new Set<string>()
  for (const def of defs) {
    if (seen.has(def.name)) throw new Error(`duplicate command name "${def.name}" in namespace "${namespace}"`)
    seen.add(def.name)
  }
}

function buildFlatLeaf (def: CloudApiDefinition): OpaqueCommandHandle {
  const schema = buildCloudJsonSchema(def)
  return defineCommand({
    name: def.name,
    description: def.description,
    input: schema,
    readOnly: def.method === 'GET',
    handler: createCloudHandler(def),
  })
}

function buildFlatNamespaceGroups (
  defsByNamespace: Map<string, CloudApiDefinition[]>,
  descriptionPrefix: string,
  renames: ReadonlyMap<string, string> = new Map(),
): OpaqueCommandHandle[] {
  const handles: OpaqueCommandHandle[] = []
  for (const [namespace, defs] of defsByNamespace) {
    const displayName = renames.get(namespace) ?? namespace
    checkDuplicates(defs, displayName)
    const leaves = defs.map(buildFlatLeaf)
    handles.push(
      defineGroup({ name: displayName, description: `${descriptionPrefix} ${displayName} commands` }, ...leaves),
    )
  }
  return handles
}

function buildServerlessTypeGroup (
  namespace: string,
  defs: CloudApiDefinition[],
): OpaqueCommandHandle {
  const typeShort = PROJECT_NAMESPACES[namespace]!
  const typeLabel = namespace.replace(/-projects$/, '')

  const leaves = defs.map((def) => {
    const shortName = simplifyProjectCommandName(def.name, namespace)
    const schema = buildCloudJsonSchema(def)
    const baseHandler = createCloudHandler(def)
    const handler: (parsed: ParsedResult) => Promise<JsonValue> = isCredentialCommand(def.name)
      ? async (parsed) => wrapWithCredentialPolicy(def.name, baseHandler, parsed)
      : baseHandler
    const cmd = defineCommand({
      name: shortName,
      description: def.description,
      input: schema,
      readOnly: def.method === 'GET',
      handler,
    })
    if (isCreateProjectCommand(def.name)) {
      (cmd as Command).option('--wait', 'Wait for the project to reach "initialized" phase before returning')
    }
    if (isCredentialCommand(def.name)) {
      (cmd as Command)
        .option('--save-as <name>', 'store returned credentials in the OS keychain and upsert a context of this name')
        .option('--credentials-file <path>', 'write credentials to a standalone YAML config fragment at this path (0600)')
        .option('--config-file <path>', 'override the config file written by --save-as (defaults to ~/.elasticrc.yml)')
        .option('--force', 'overwrite an existing context (--save-as) or file (--credentials-file)')
    }
    return cmd
  })

  const grp = defineGroup(
    { name: typeShort, description: `Manage ${typeLabel} projects` },
    ...leaves,
  )
  if (typeShort === 'search') {
    ;(grp as Command).alias('elasticsearch')
  }
  return grp
}

function buildHostedGroup (defs: CloudApiDefinition[]): OpaqueCommandHandle {
  const byNamespace = groupByNamespace(defs)
  const namespaceHandles = buildFlatNamespaceGroups(byNamespace, 'Cloud hosted', HOSTED_NAMESPACE_RENAMES)
  return defineGroup({ name: 'hosted', description: 'Manage Elastic Cloud Hosted deployments' }, ...namespaceHandles)
}

function buildServerlessGroup (defs: CloudApiDefinition[]): OpaqueCommandHandle {
  const projectDefs = new Map<string, CloudApiDefinition[]>()
  const crossProjectDefs: CloudApiDefinition[] = []
  const otherDefs = new Map<string, CloudApiDefinition[]>()

  for (const def of defs) {
    if (PROJECT_NAMESPACES[def.namespace] != null) {
      let grp = projectDefs.get(def.namespace)
      if (grp == null) { grp = []; projectDefs.set(def.namespace, grp) }
      grp.push(def)
    } else if (CROSS_PROJECT_NAMESPACES.has(def.namespace)) {
      crossProjectDefs.push(def)
    } else {
      let grp = otherDefs.get(def.namespace)
      if (grp == null) { grp = []; otherDefs.set(def.namespace, grp) }
      grp.push(def)
    }
  }

  const children: OpaqueCommandHandle[] = []

  if (projectDefs.size > 0) {
    const typeGroups: OpaqueCommandHandle[] = []
    for (const [namespace, nsDefs] of projectDefs) {
      typeGroups.push(buildServerlessTypeGroup(namespace, nsDefs))
    }
    children.push(defineGroup({ name: 'projects', description: 'Manage Serverless projects' }, ...typeGroups))
  }

  if (crossProjectDefs.length > 0) {
    checkDuplicates(crossProjectDefs, 'cross-project')
    children.push(defineGroup(
      { name: 'cross-project', description: 'Serverless cross-project commands' },
      ...crossProjectDefs.map(buildFlatLeaf),
    ))
  }

  children.push(...buildFlatNamespaceGroups(otherDefs, 'Serverless'))

  return defineGroup({ name: 'serverless', description: 'Manage Elastic Serverless projects and resources' }, ...children)
}

interface PartitionedDefinitions {
  promoted: Map<string, CloudApiDefinition[]>
  hosted: CloudApiDefinition[]
  serverless: CloudApiDefinition[]
}

function partitionDefinitions (definitions: CloudApiDefinition[]): PartitionedDefinitions {
  const promoted = new Map<string, CloudApiDefinition[]>()
  const hosted: CloudApiDefinition[] = []
  const serverless: CloudApiDefinition[] = []

  for (const def of definitions) {
    if (PROMOTED_NAMESPACES.has(def.namespace)) {
      let grp = promoted.get(def.namespace)
      if (grp == null) { grp = []; promoted.set(def.namespace, grp) }
      grp.push(def)
    } else if (SERVERLESS_NAMESPACES.has(def.namespace)) {
      serverless.push(def)
    } else {
      hosted.push(def)
    }
  }

  return { promoted, hosted, serverless }
}

async function wrapWithCredentialPolicy (
  cmdName: string,
  baseHandler: (parsed: ParsedResult) => Promise<JsonValue>,
  parsed: ParsedResult,
): Promise<JsonValue> {
  const body = await baseHandler(parsed)
  if (body != null && typeof body === 'object' && !Array.isArray(body) && 'error' in body) return body
  const opts = readCredentialPolicyOptions(parsed.options)
  if (opts.saveAs == null && opts.credentialsFile == null) return body
  try {
    const result = await applyCredentialPolicy(cmdName, body, opts)
    for (const w of result.log.warnings) process.stderr.write(`Warning: ${w}\n`)
    return result.body
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: { code: 'credential_policy_error', message } }
  }
}

/**
 * Registers the unified Cloud command tree.
 */
export function registerCloudCommands (
  definitions: CloudApiDefinition[] = [...allCloudApis, ...allServerlessApis],
): OpaqueCommandHandle {
  for (const def of definitions) {
    validateCloudApiDefinition(def)
  }

  const { promoted, hosted, serverless } = partitionDefinitions(definitions)
  const promotedGroups = buildFlatNamespaceGroups(promoted, 'Cloud', PROMOTED_NAMESPACES)
  const hostedGroup = buildHostedGroup(hosted)
  const serverlessGroup = buildServerlessGroup(serverless)

  return defineGroup(
    { name: 'cloud', description: 'Manage Elastic Cloud (hosted deployments and serverless projects)' },
    ...promotedGroups,
    hostedGroup,
    serverlessGroup,
  )
}
