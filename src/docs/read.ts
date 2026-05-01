/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../factory.ts'
import { docsRead, resolveDocsPath } from './client.ts'
import { renderMarkdown } from './renderer.ts'

export interface ReadDeps {
  docsRead: typeof docsRead
  resolveDocsPath: typeof resolveDocsPath
  stdout: { write: (s: string) => boolean }
}

const defaultDeps: ReadDeps = {
  docsRead,
  resolveDocsPath,
  stdout: process.stdout,
}

const inputSchema = z.object({
  path: z.string().describe('Docs path, full elastic.co URL, or search query'),
  raw: z.boolean().optional().describe('Output unrendered markdown instead of formatted output'),
})

export function createReadCommand (deps: ReadDeps = defaultDeps): OpaqueCommandHandle {
  return defineCommand({
    name: 'read',
    description: 'Read an Elastic documentation page',
    input: inputSchema,
    handler: async (parsed): Promise<JsonValue> => {
      const input = parsed.input!.path.trim()
      if (input === '') return { error: { code: 'missing_input', message: 'path is required' } }

      const raw = parsed.input!.raw === true

      try {
        const path = await deps.resolveDocsPath(input)
        const markdown = await deps.docsRead(path)

        if (parsed.options['json'] === true) {
          return { markdown }
        }

        deps.stdout.write(raw ? markdown : renderMarkdown(markdown) + '\n')
      } catch (err) {
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
