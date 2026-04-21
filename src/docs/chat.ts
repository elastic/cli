/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createInterface } from 'node:readline'
import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue, ParsedResult } from '../factory.ts'
import { docsAskStream, newUuid, type AskStreamEvent } from './client.ts'
import { startSpinner, streamAnswer, type SpinnerHandle } from './stream.ts'
import { renderMarkdown } from './renderer.ts'

export interface ChatDeps {
  docsAskStream: (message: string, conversationId: string) => AsyncGenerator<AskStreamEvent>
  stdout: { write: (s: string) => boolean }
  stderr: { write: (s: string) => boolean }
  /** Injected for testing; defaults to process.stdin */
  getStdin: () => NodeJS.ReadableStream
}

const defaultDeps: ChatDeps = {
  docsAskStream,
  stdout: process.stdout,
  stderr: process.stderr,
  getStdin: () => process.stdin,
}

async function askQuestion (
  question: string,
  conversationId: string,
  deps: ChatDeps,
  spinner?: SpinnerHandle,
): Promise<void> {
  try {
    const gen = deps.docsAskStream(question, conversationId)
    await streamAnswer(gen, renderMarkdown, deps.stdout, spinner)
  } catch (err) {
    spinner?.stop()
    deps.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

export function createChatCommand (deps: ChatDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'chat',
    description: 'Ask a question about Elastic documentation using AI, with follow-up conversation',
    positionalArg: { name: 'question', description: 'Opening question', required: true },
    handler: async (parsed: ParsedResult): Promise<JsonValue> => {
      const question = (parsed.arg ?? '').trim()
      if (question === '') return { error: { code: 'missing_input', message: 'question is required' } }

      // Spinner and interactive loop are disabled when stderr is not a TTY (piped/redirected)
      // or when --json is requested, so agents and scripts get clean output.
      const interactive = process.stderr.isTTY === true && parsed.options['json'] !== true

      const conversationId = newUuid()

      if (parsed.options['json'] === true) {
        const chunks: string[] = []
        try {
          for await (const event of deps.docsAskStream(question, conversationId)) {
            if (event.kind === 'chunk') chunks.push(event.text)
          }
        } catch (err) {
          return {
            error: {
              code: 'docs_error',
              message: err instanceof Error ? err.message : String(err),
            },
          }
        }
        return { answer: chunks.join('') }
      }

      await askQuestion(question, conversationId, deps, interactive ? startSpinner(deps.stderr, 'Thinking…') : undefined)

      if (interactive) {
        const rl = createInterface({ input: deps.getStdin(), output: process.stderr, terminal: false })

        await new Promise<void>((resolve) => {
          const prompt = (): void => {
            process.stderr.write('\nAsk a follow-up (or press Enter to quit): ')
            rl.once('line', async (answer) => {
              const followUp = answer.trim()
              if (followUp === '') {
                rl.close()
                resolve()
                return
              }
              await askQuestion(followUp, conversationId, deps, startSpinner(deps.stderr, 'Thinking…'))
              prompt()
            })
          }
          prompt()
          rl.on('close', resolve)
        })
      }

      return null
    },
    formatOutput: () => '',
  })
}
