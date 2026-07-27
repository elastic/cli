/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander'
import { buildCliSchema } from '@cli-schema/commander'
import type { Environment, Parameter, ParameterRole } from '@cli-schema/spec'
import { defineCommand } from './factory.ts'
import type { OpaqueCommandHandle, JsonValue } from './factory.ts'
import { enrichEsArg, type SchemaArgDefinition } from './lib/schema-args.ts'
import type { NamespaceEntry } from './namespaces.ts'

// ---------------------------------------------------------------------------
// Environment declaration (sources: src/config/loader.ts, src/lib/logo.ts,
//                                   src/lib/cloud-client.ts)
// ---------------------------------------------------------------------------

const ENVIRONMENT: Environment = {
  variables: [
    {
      name: 'ELASTIC_CLI_CONFIG_FILE',
      required: false,
      description: 'Override the config file path (precedence: --config-file > this > home directory discovery)',
    },
    {
      name: 'ELASTIC_NO_BANNER',
      required: false,
      description: 'Set to 1 to suppress the startup logo',
    },
    {
      name: 'ELASTIC_CLOUD_ADMIN_API',
      required: false,
      description: 'Override the Elastic Cloud admin API base URL',
    },
  ],
  configFiles: [
    { path: '~/.elasticrc.yml',  required: false, description: 'Primary config file (recommended)' },
    { path: '~/.elasticrc.yaml', required: false, description: 'Alternative YAML extension' },
    { path: '~/.elasticrc.json', required: false, description: 'JSON form of the config file' },
    { path: '~/.elasticrc',      required: false, description: 'Extensionless form of the config file' },
  ],
}

// ---------------------------------------------------------------------------
// Role classification and parameter reconciliation
// ---------------------------------------------------------------------------

/**
 * Matches the emission this CLI has always produced: only `--dry-run` gets a dedicated role.
 * `@cli-schema/commander`'s own default heuristic also classifies `--force`/`--yes`/etc. as
 * `confirmationSkip`, which would change output for e.g. `config`'s hand-declared `--force`.
 */
function classifyRole (longName: string): ParameterRole {
  return longName === 'dry-run' ? 'dryRun' : 'flag'
}

/**
 * `acceptsArrayForm` fields routed to the request body need a CSV separator in their help text
 * (ES does not split comma-separated values inside JSON bodies, only in querystrings/paths) —
 * see `src/lib/schema-args.ts`'s `enrichEsArg` for where `foundIn` comes from.
 */
function postProcessInputParameter (param: Parameter, arg: SchemaArgDefinition): Parameter {
  return arg.acceptsArrayForm === true && arg.foundIn === 'body'
    ? { ...param, separator: ',' }
    : param
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export async function registerCliSchemaCommand (
  version: string,
  rootProgram: Command | undefined,
  namespaces: NamespaceEntry[],
): Promise<OpaqueCommandHandle> {
  return defineCommand({
    name: 'cli-schema',
    description: 'Emit the CLI structure as JSON',
    handler: async () => {
      const schemaRoot = new Command(rootProgram?.name() ?? 'elastic')
      schemaRoot.description(rootProgram?.description() ?? '')

      schemaRoot.addCommand(defineCommand({
        name: 'version',
        description: 'Print the elastic CLI version',
        handler: () => ({ version }),
      }))

      const loaded = await Promise.all(namespaces.map((ns) => ns.load({ eager: true })))
      for (const ns of loaded) schemaRoot.addCommand(ns)

      // Build the set of namespace names that don't require context/auth
      const noContextNames = new Set<string>([
        ...namespaces.filter(ns => ns.requiresContext === false).map(ns => ns.name),
        'version', // root-level version command needs no auth
      ])

      return buildCliSchema(schemaRoot, {
        name: rootProgram?.name() ?? 'elastic',
        version,
        ...(rootProgram?.description() && { description: rootProgram.description() }),
        environment: ENVIRONMENT,
        reservedMetaCommands: ['cli-schema'],
        noContextNames,
        classifyRole,
        // schemaRoot is a synthetic tree-discovery root with no options of its own — the real
        // global flags (--json, etc.) live on the actual running program.
        ...(rootProgram != null && { globalOptionsSource: rootProgram.options }),
        enrichSchemaArg: enrichEsArg,
        postProcessInputParameter: (param, arg) => postProcessInputParameter(param, arg as SchemaArgDefinition),
      }) as unknown as JsonValue
    },
    formatOutput: (result) => JSON.stringify(result, null, 2) + '\n',
  })
}
