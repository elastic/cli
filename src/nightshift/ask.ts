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

function experimentalBanner (isTTY: boolean): string {
  const text =
    'Warning: "nightshift ask" is experimental and in active development.\n' +
    '         Not yet suited for scripts or automation. Pass --accept-experimental to suppress this warning.\n\n'
  return isTTY ? `\x1b[33m${text}\x1b[0m` : text
}

/**
 * Creates the `nightshift ask` command.
 *
 * Sends a prompt to the Nightshift investigation agent via the agent builder
 * converse endpoint and writes the prose answer to stdout. With `--json`,
 * emits `{ conversation_id, response }` instead.
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
        long: 'accept-experimental',
        type: 'boolean',
        description: 'Acknowledge that this command is experimental and may be removed; suppresses the warning',
      },
    ],
    handler: async (parsed): Promise<JsonValue> => {
      const inp = parsed.input as { prompt?: string; conversation_id?: string } | undefined
      const prompt = (parsed.arg ?? inp?.prompt ?? '').trim()
      if (prompt === '') return { error: { code: 'missing_input', message: 'prompt is required' } }

      if (parsed.options['accept-experimental'] !== true && parsed.options['json'] !== true) {
        deps.stderr.write(experimentalBanner(process.stderr.isTTY === true))
      }

      const conversationId = inp?.conversation_id
      const interactive = process.stderr.isTTY === true && parsed.options['json'] !== true
      const spinner = interactive ? startSpinner(deps.stderr, 'Thinking…') : undefined

      try {
        const answer = await deps.converse(prompt, conversationId)
        spinner?.stop()

        if (parsed.options['json'] === true) {
          return { conversation_id: answer.conversationId, response: answer.message }
        }

        const text = answer.message.endsWith('\n') ? answer.message : answer.message + '\n'
        deps.stdout.write(text)
        deps.stderr.write(`conversation: ${answer.conversationId}\n`)
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
