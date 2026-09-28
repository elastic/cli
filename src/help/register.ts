/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic help [topic]` -- agent-facing help topics.
 * Config-free. Topics live in {@link catalog.ts} (exit-codes) and
 * {@link ../help-topics.ts} (formatting, environment, exit-codes).
 */

import { defineCommand } from '../factory.ts'
import type { JsonValue, OpaqueCommandHandle, ParsedResult } from '../factory.ts'
import {
  ERROR_CODES,
  EXIT_CODES,
  STATUS_PROBE,
  formatExitCodesHelp,
} from './catalog.ts'
import {
  HELP_TOPIC_NAMES,
  HELP_TOPICS,
  formatHelpTopicIndex,
  isHelpTopicName,
} from '../help-topics.ts'

// Build the topics list from the single source of truth in help-topics.ts
const HELP_TOPICS_LIST = HELP_TOPIC_NAMES.map((name) => ({ name }))

function formatHelpText (result: JsonValue): string {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) {
    return formatHelpTopicIndex()
  }
  if ('exit_codes' in result) {
    return formatExitCodesHelp()
  }
  if ('body' in result && typeof (result as Record<string, unknown>).body === 'string') {
    return (result as Record<string, unknown>).body as string
  }
  return formatHelpTopicIndex()
}

function helpHandler (parsed: ParsedResult): JsonValue {
  const topic = parsed.arg
  if (topic == null || topic === '') {
    return { topics: HELP_TOPICS_LIST as unknown as JsonValue }
  }

  if (!isHelpTopicName(topic)) {
    return {
      error: {
        code: 'input_validation_failed',
        message: `Unknown help topic "${topic}". Topics: ${HELP_TOPIC_NAMES.join(', ')}`,
      },
    }
  }

  if (topic === 'exit-codes') {
    return {
      topic: 'exit-codes',
      exit_codes: EXIT_CODES as unknown as JsonValue,
      error_codes: ERROR_CODES as unknown as JsonValue,
      probe: STATUS_PROBE,
    }
  }

  // formatting | environment
  return {
    topic,
    body: HELP_TOPICS[topic],
  }
}

export function registerHelpCommand (): OpaqueCommandHandle {
  return defineCommand({
    name: 'help',
    description: 'Show help topics (formatting, environment, exit-codes)',
    positionalArg: {
      name: 'topic',
      required: false,
      description: `topic name (${HELP_TOPIC_NAMES.join(', ')})`,
    },
    handler: helpHandler,
    formatOutput: formatHelpText,
  })
}
