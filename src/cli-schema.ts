/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs'
import path from 'node:path'
import type { Command } from 'commander'

/**
 * Builds the CLI schema by walking the command tree and collecting JSON Schemas
 * from each leaf command's `--help --json` output.
 */
export async function buildCliSchema (program: Command): Promise<Record<string, unknown>> {
  const schema: Record<string, unknown> = {}

  function walk (cmd: Command, parts: string[]): void {
    if (cmd.commands.length === 0) {
      // leaf – record the schema key
      schema[parts.join(' ')] = {
        name: parts[parts.length - 1],
        path: parts,
        description: cmd.description(),
        options: cmd.options.map((o) => ({
          flags: o.flags,
          description: o.description,
          required: o.mandatory,
          defaultValue: o.defaultValue,
        })),
      }
    } else {
      for (const sub of cmd.commands) {
        walk(sub, [...parts, sub.name()])
      }
    }
  }

  for (const sub of program.commands) {
    walk(sub, [sub.name()])
  }

  return schema
}

/**
 * Writes the CLI schema to `dest` as pretty-printed JSON.
 */
export async function emitCliSchema (program: Command, dest: string): Promise<void> {
  const schema = await buildCliSchema(program)
  const dir = path.dirname(dest)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(dest, JSON.stringify(schema, null, 2) + '\n', 'utf8')
}

/**
 * Registers the `elastic schema` command on the program.
 *
 * When invoked as `elastic schema <command...>` it prints the JSON Schema for
 * the given subcommand; invoked without arguments it lists available schemas.
 *
 * Output is written via process.stdout.write / process.stderr.write rather
 * than console.log so that the output stream is controlled and no extra
 * newlines or formatting are injected by the runtime.
 *
 * @param program - the root Commander program
 */
export function registerCliSchemaCommand (program: Command): Command {
  // Guard against double-registration
  const existing = program.commands.find((c) => c.name() === 'schema')
  if (existing != null) {
    return existing
  }

  return program
    .command('schema')
    .description('Print the JSON Schema for a command (machine-readable help)')
    .argument('[command...]', 'command path to print the schema for')
    .option('--json', 'output as JSON (default for this command)')
    .action(async (commandPath: string[]) => {
      const schema = await buildCliSchema(program)
      if (commandPath.length === 0) {
        process.stdout.write(JSON.stringify({ schemas: Object.keys(schema) }, null, 2) + '\n')
      } else {
        const key = commandPath.join(' ')
        const entry = schema[key]
        if (entry == null) {
          process.stderr.write(`Error: no schema found for command "${key}"\n`)
          process.exitCode = 1
        } else {
          process.stdout.write(JSON.stringify(entry, null, 2) + '\n')
        }
      }
    })
}
