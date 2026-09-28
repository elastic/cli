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
 * @param program - the Commander Command to register `schema` on
 * @param _schemaMap - ignored; kept for call-site compatibility during migration
 * @param _options - ignored; kept for call-site compatibility during migration
 */
export function registerCliSchemaCommand (program: Command, _schemaMap?: unknown, _options?: unknown): Command {
  return program
    .command('schema')
    .description('Print the JSON Schema for a command (machine-readable help)')
    .argument('[command...]', 'command path to print the schema for')
    .option('--json', 'output as JSON (default for this command)')
}
