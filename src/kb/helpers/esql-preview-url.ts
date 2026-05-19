/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import lzString from 'lz-string'
const { compressToBase64 } = lzString
import { defineCommand } from '../../factory.ts'
import type { OpaqueCommandHandle, JsonValue } from '../../factory.ts'
import { getKibanaClient } from '../../lib/kibana-client.ts'

interface DiscoverLocatorParams {
  query: { esql: string }
  timeRange: { from: string; to: string }
  tab: { id: string; label: string }
  dataViewSpec?: { title: string }
  columns?: string[]
}

/** Extracts the first index/pattern from the FROM clause of an ES|QL query. */
function deriveIndexTitle (query: string): string | undefined {
  const match = query.match(/^\s*FROM\s+([^\s|,]+)/i)
  return match?.[1]
}

export function buildPreviewUrl (
  baseUrl: string,
  query: string,
  timeFrom: string,
  timeTo: string,
  columns?: string[],
): string {
  const indexTitle = deriveIndexTitle(query)
  const params: DiscoverLocatorParams = {
    query: { esql: query },
    timeRange: { from: timeFrom, to: timeTo },
    tab: { id: 'new', label: 'ES|QL preview' },
    ...(indexTitle != null ? { dataViewSpec: { title: indexTitle } } : {}),
    ...(columns != null && columns.length > 0 ? { columns } : {}),
  }
  const lz = encodeURIComponent(compressToBase64(JSON.stringify(params)))
  return `${baseUrl}/app/r?l=DISCOVER_APP_LOCATOR&v=9.1.0&lz=${lz}`
}

export function createEsqlPreviewUrlCommand (): OpaqueCommandHandle {
  return defineCommand({
    name: 'preview-url',
    description: 'Generate a Kibana Discover URL to preview an ES|QL query.',
    positionalArg: { name: 'query', description: 'The ES|QL query to preview' },
    options: [
      {
        long: 'time-from',
        type: 'string',
        description: 'Start of the time range (default: now-15m)',
        defaultValue: 'now-15m',
      },
      {
        long: 'time-to',
        type: 'string',
        description: 'End of the time range (default: now)',
        defaultValue: 'now',
      },
      {
        long: 'columns',
        type: 'string',
        description: 'Comma-separated list of columns to display',
      },
    ],
    handler: (parsed): JsonValue => {
      const query = parsed.arg!
      const timeFrom = String(parsed.options['time-from'] ?? 'now-15m')
      const timeTo = String(parsed.options['time-to'] ?? 'now')
      const columnsRaw = parsed.options['columns'] as string | undefined

      let baseUrl: string
      try {
        baseUrl = getKibanaClient().baseUrl
      } catch (err) {
        return {
          error: {
            code: 'missing_config',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }

      const columns = columnsRaw != null
        ? columnsRaw.split(',').map((c) => c.trim()).filter((c) => c.length > 0)
        : undefined

      const url = buildPreviewUrl(baseUrl, query, timeFrom, timeTo, columns)
      return { url }
    },
    formatOutput: (result) => {
      const r = result as { url?: string }
      return r.url != null ? r.url + '\n' : ''
    },
  })
}
