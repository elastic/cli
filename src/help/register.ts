/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic help [topic]` -- agent-facing help topics.
 * Config-free. Topics live in {@link catalog.ts}.
 */

import { defineCommand } from '../factory.ts'
import type { JsonValue, OpaqueCommandHandle, ParsedResult } from '../factory.ts'
import {
  ERROR_CODES,
  EXIT_CODES,
  HELP_TOPICS,
  STATUS_PROBE,
  formatExitCodesHelp,
  formatTopicsHelp,
} from './catalog.ts'

function formatHelpText (result: JsonValue): string {
  if (result != null && typeof result === 'object' && !Array.isArray(result) && 'exit_codes' in result) {
    return formatExitCodesHelp()
  }
  return formatTopicsHelp()
}

function helpHandler (parsed: ParsedResult): JsonValue {
  const topic = parsed.arg
  if (topic == null || topic === '') {
    return { topics: HELP_TOPICS as unknown as JsonValue }
  }
  if (topic === 'exit-codes') {
    return {
      topic: 'exit-codes',
      exit_codes: EXIT_CODES as unknown as JsonValue,
      error_codes: ERROR_CODES as unknown as JsonValue,
      probe: STATUS_PROBE,
    }
  }
  return {
    error: {
      code: 'input_validation_failed',
      message: `Unknown help topic "${topic}". Topics: ${HELP_TOPICS.map(t => t.name).join(', ')}`,
    },
  }
}

export function registerHelpCommand (): OpaqueCommandHandle {
  return defineCommand({
    name: 'help',
    description: 'Show help topics',
    positionalArg: { name: 'topic', required: false, description: 'topic name (exit-codes)' },
    handler: helpHandler,
    formatOutput: formatHelpText,
  })
}
