/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../factory.ts'
import { converse } from './client.ts'
import { startSpinner } from '../docs/stream.ts'
import { missingConfigError, kibanaApiError } from '../kb/errors.ts'

/** Dependency seam for unit tests. */
export interface AskDeps {
  converse: typeof converse
  stdout: { write: (s: string) => boolean }
  stderr: { write: (s: string) => boolean }
}

const defaultDeps: AskDeps = {
  converse,
  stdout: process.stdout,
  stderr: process.stderr,
}

const inputSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: {
      type: 'string',
      description: 'Question or instruction for the Nightshift investigation agent',
    },
    conversation_id: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
      description: 'Continue an existing conversation instead of starting a new one',
    },
  },
}

/**
 * Creates the `nightshift ask` command.
 *
 * Sends a prompt to the Nightshift investigation agent via the agent builder
 * converse endpoint and writes the prose answer to stdout. With `--json` (or
 * when stdout is not a TTY), emits `{ conversation_id, message }` instead.
 *
 * The `deps` parameter is a test seam — production callers omit it.
 */
export function createAskCommand (deps: AskDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'ask',
    description: 'Ask the Nightshift investigation agent a question (single answer)',
    input: inputSchema,
    positionalArg: { name: 'prompt', description: 'Question or instruction', required: false },
    options: [
      {
        long: 'timeout',
        type: 'string',
        description: 'Abort the request after this many seconds (default: no timeout)',
      },
      {
        long: 'verbose',
        type: 'boolean',
        description: 'Show agent tool call count after the answer',
      },
    ],
    handler: async (parsed): Promise<JsonValue> => {
      const inp = parsed.input as { prompt?: string; conversation_id?: string } | undefined
      const prompt = (parsed.arg ?? inp?.prompt ?? '').trim()
      if (prompt === '') return { error: { code: 'missing_input', message: 'prompt is required' } }

      // Auto-JSON when stdout is not a TTY so piped output is always machine-parseable.
      const useJson = parsed.options['json'] === true || process.stdout.isTTY !== true

      const conversationId = inp?.conversation_id
      const interactive = process.stderr.isTTY === true && !useJson
      const spinner = interactive ? startSpinner(deps.stderr, 'Thinking…') : undefined

      const rawTimeout = parsed.options['timeout']
      const timeoutSeconds = typeof rawTimeout === 'string' && rawTimeout.length > 0
        ? Number(rawTimeout)
        : undefined

      try {
        const answer = await deps.converse(prompt, conversationId, timeoutSeconds)
        spinner?.stop()

        if (useJson) {
          const result: Record<string, unknown> = {
            conversation_id: answer.conversationId,
            message: answer.message,
          }
          if (answer.steps !== undefined) result['tool_calls'] = answer.steps

          if (parsed.options['json'] === true) {
            // Let the factory serialize and write JSON (it uses process.stdout.write directly).
            return result as JsonValue
          }
          // Non-TTY auto-JSON: write ourselves so the factory doesn't swallow it.
          deps.stdout.write(JSON.stringify(result) + '\n')
          return null
        }

        const text = answer.message.endsWith('\n') ? answer.message : answer.message + '\n'
        deps.stdout.write(text)
        if (parsed.options['verbose'] === true && answer.steps !== undefined) {
          deps.stderr.write(`(${answer.steps} tool calls)\n`)
        }
        if (conversationId === undefined) {
          deps.stderr.write(`conversation: ${answer.conversationId}\n`)
        }
        return null
      } catch (err) {
        spinner?.stop()
        const message = err instanceof Error ? err.message : String(err)
        if (message.startsWith('missing_config:')) {
          return missingConfigError(err)
        }
        return kibanaApiError(err)
      }
    },
    formatOutput: (): string => '',
  })
}
