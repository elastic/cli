/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic help [topic]` -- agent-facing help topics.
 * Config-free. Topics live in {@link catalog.ts}.
 */

import { Command } from 'commander'
import {
  ERROR_CODES,
  EXIT_CODES,
  HELP_TOPICS,
  STATUS_PROBE,
  formatExitCodesHelp,
  formatTopicsHelp,
} from './catalog.ts'

function wantsJson (cmd: Command): boolean {
  return cmd.opts().json === true || cmd.parent?.opts().json === true
}

function writeJsonError (code: string, message: string): void {
  process.stderr.write(JSON.stringify({ error: { code, message } }) + '\n')
}

export function registerHelpCommand (): Command {
  const cmd = new Command('help')
  cmd.description('Show help topics')
  cmd.argument('[topic]', 'topic name (exit-codes)')
  cmd.option('--json', 'output as JSON')
  cmd.action((topic: string | undefined) => {
    const json = wantsJson(cmd)
    if (topic == null || topic === '') {
      if (json) {
        process.stdout.write(JSON.stringify({ topics: HELP_TOPICS }) + '\n')
      } else {
        process.stdout.write(formatTopicsHelp())
      }
      return
    }
    if (topic === 'exit-codes') {
      if (json) {
        process.stdout.write(JSON.stringify({
          topic: 'exit-codes',
          exit_codes: EXIT_CODES,
          error_codes: ERROR_CODES,
          probe: STATUS_PROBE,
        }) + '\n')
      } else {
        process.stdout.write(formatExitCodesHelp())
      }
      return
    }
    const message = `Unknown help topic "${topic}". Topics: ${HELP_TOPICS.map(t => t.name).join(', ')}`
    if (json) writeJsonError('input_validation_failed', message)
    else process.stderr.write(`Error: ${message}\n`)
    process.exitCode = 1
  })
  return cmd
}
