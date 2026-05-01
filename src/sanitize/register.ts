/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic sanitize <type> <value>` command tree.
 *
 * Exposes the pure sanitization functions from {@link ../lib/sanitize.ts} as
 * CLI subcommands. Each value type is a leaf command with a single positional
 * argument. The handler returns a structured {@link SanitizeResult} for
 * `--json` mode; plain-text mode emits just the sanitized string (suitable
 * for shell substitution via `$(elastic sanitize index-name '...')`).
 */

import { defineCommand, defineGroup } from '../factory.ts'
import type { JsonValue, OpaqueCommandHandle } from '../factory.ts'
import {
  sanitizeIndexName,
  sanitizeSnapshotName,
  sanitizeDataStreamType,
  sanitizeDataStreamDataset,
  sanitizeDataStreamNamespace,
  sanitizeFieldName,
  sanitizePipelineName,
  sanitizeRepositoryName,
  type SanitizeResult,
} from '../lib/sanitize.ts'

interface SanitizerEntry {
  name: string
  description: string
  fn: (value: string) => SanitizeResult
}

const SANITIZERS: SanitizerEntry[] = [
  { name: 'index-name', description: 'Sanitize an Elasticsearch index or alias name', fn: sanitizeIndexName },
  { name: 'snapshot-name', description: 'Sanitize an Elasticsearch snapshot name', fn: sanitizeSnapshotName },
  { name: 'data-stream-type', description: 'Sanitize a data stream type component', fn: sanitizeDataStreamType },
  { name: 'data-stream-dataset', description: 'Sanitize a data stream dataset component', fn: sanitizeDataStreamDataset },
  { name: 'data-stream-namespace', description: 'Sanitize a data stream namespace component', fn: sanitizeDataStreamNamespace },
  { name: 'field-name', description: 'Sanitize a mapping field name', fn: sanitizeFieldName },
  { name: 'pipeline-name', description: 'Sanitize an ingest pipeline name', fn: sanitizePipelineName },
  { name: 'repository-name', description: 'Sanitize a snapshot repository name', fn: sanitizeRepositoryName },
]

/**
 * Builds the `elastic sanitize` command group with one leaf command per
 * value type.
 */
export function registerSanitizeCommands (): OpaqueCommandHandle {
  const commands = SANITIZERS.map(({ name, description, fn }) =>
    defineCommand({
      name,
      description,
      positionalArg: { name: 'value', description: 'the value to sanitize', required: true },
      handler: (parsed) => {
        const value = parsed.arg ?? ''
        const result = fn(value)
        if (result.sanitized.length === 0 && value.length > 0) {
          return {
            error: {
              code: 'sanitize_empty',
              message: `value became empty after sanitization`,
              original: value,
              type: result.type,
              changes: result.changes,
            },
          }
        }
        return result as unknown as JsonValue
      },
      formatOutput: (result) => {
        const r = result as unknown as SanitizeResult
        if (r.changes.length > 0) {
          process.stderr.write(`# changes: ${r.changes.join(', ')}\n`)
        }
        return r.sanitized + '\n'
      },
    }),
  )

  return defineGroup(
    { name: 'sanitize', description: 'Sanitize values for safe use in Elasticsearch' },
    ...commands,
  )
}
