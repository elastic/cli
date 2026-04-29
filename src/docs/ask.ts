/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../factory.ts'
import { docsAskStream, newUuid, type AskStreamEvent } from './client.ts'
import { startSpinner, streamAnswer } from './stream.ts'
import { renderMarkdown } from './renderer.ts'

export interface AskDeps {
  docsAskStream: (message: string, conversationId: string) => AsyncGenerator<AskStreamEvent>
  stdout: { write: (s: string) => boolean }
  stderr: { write: (s: string) => boolean }
}

const defaultDeps: AskDeps = {
  docsAskStream,
  stdout: process.stdout,
  stderr: process.stderr,
}

const inputSchema = z.object({
  question: z.string().describe('Question to ask'),
})

export function createAskCommand (deps: AskDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'ask',
    description: 'Ask a question about Elastic documentation using AI (single answer)',
    input: inputSchema,
    handler: async (parsed): Promise<JsonValue> => {
      const question = parsed.input!.question.trim()
      if (question === '') return { error: { code: 'missing_input', message: 'question is required' } }

      const conversationId = newUuid()
      const interactive = process.stderr.isTTY === true && parsed.options['json'] !== true
      const spinner = interactive ? startSpinner(deps.stderr, 'Thinking…') : undefined

      try {
        if (parsed.options['json'] === true) {
          const chunks: string[] = []
          for await (const event of deps.docsAskStream(question, conversationId)) {
            if (event.kind === 'chunk') chunks.push(event.text)
          }
          return { answer: chunks.join('') }
        }

        const gen = deps.docsAskStream(question, conversationId)
        await streamAnswer(gen, renderMarkdown, deps.stdout, spinner)
      } catch (err) {
        spinner?.stop()
        return {
          error: {
            code: 'docs_error',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }

      return null
    },
    formatOutput: () => '',
  })
}
