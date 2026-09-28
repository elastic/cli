/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'

/**
 * Registers the `elastic schema` command on the program.
 *
 * The command prints the JSON Schema for a given subcommand when invoked as:
 *   elastic schema <command...>
 * or lists available schemas when invoked without arguments.
 *
 * The actual output logic lives in the action handler wired up in namespaces.ts.
 *
 * @param nameOrProgram - either the sub-command name string (legacy) or the parent Command
 * @param programOrSchemaMap - the parent Command when nameOrProgram is a string, or schemaMap otherwise
 * @param _options - ignored; kept for call-site compatibility during migration
 */
export function registerCliSchemaCommand (nameOrProgram: string | Command, programOrSchemaMap?: Command | unknown, _options?: unknown): Command {
  let program: Command
  if (typeof nameOrProgram === 'string') {
    // Legacy call: registerCliSchemaCommand('schema', program, options)
    program = programOrSchemaMap as Command
  } else {
    // New call: registerCliSchemaCommand(program, schemaMap, options)
    program = nameOrProgram
  }

  // Guard against double-registration: if `schema` was already added (e.g. by
  // cli.ts directly), return the existing sub-command instead of adding a
  // duplicate, which Commander forbids.
  const existing = program.commands.find((c) => c.name() === 'schema')
  if (existing != null) {
    return existing
  }

  return program
    .command('schema')
    .description('Print the JSON Schema for a command (machine-readable help)')
    .argument('[command...]', 'command path to print the schema for')
    .option('--json', 'output as JSON (default for this command)')
}
