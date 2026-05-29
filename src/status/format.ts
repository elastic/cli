/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plain-text formatter for `elastic status` output.
 *
 * Produces the aligned-column layout from the issue mock, e.g.
 *
 * ```
 * Context: local
 *
 *   Elasticsearch  http://localhost:9200          ✓  green (3 nodes)
 *   Kibana         http://localhost:5601          ✓  available (8.18.0)
 *   Cloud          https://api.elastic-cloud.com  ✗  auth failed (401)
 * ```
 */

import type { StatusResult } from './types.ts'
import type { EsCheck, KbCheck, CloudCheck } from './checks.ts'

interface Row {
  label: string
  url: string
  ok: boolean
  summary: string
}

function esSummary (s: EsCheck): string {
  if (!s.ok) return s.error
  const noun = s.nodes === 1 ? 'node' : 'nodes'
  return `${s.status} (${s.nodes} ${noun})`
}

function kbSummary (s: KbCheck): string {
  if (!s.ok) return s.error
  return `${s.status} (${s.version})`
}

function cloudSummary (s: CloudCheck): string {
  if (!s.ok) return s.error
  return 'available'
}

/**
 * Renders a {@link StatusResult} as a multi-line human-readable string.
 *
 * Services absent from the active context are omitted from the table. The
 * output always ends with a trailing newline.
 */
export function formatStatusText (result: StatusResult): string {
  const rows: Row[] = []
  const s = result.services
  if (s.elasticsearch != null) {
    rows.push({ label: 'Elasticsearch', url: s.elasticsearch.url, ok: s.elasticsearch.ok, summary: esSummary(s.elasticsearch) })
  }
  if (s.kibana != null) {
    rows.push({ label: 'Kibana', url: s.kibana.url, ok: s.kibana.ok, summary: kbSummary(s.kibana) })
  }
  if (s.cloud != null) {
    rows.push({ label: 'Cloud', url: s.cloud.url, ok: s.cloud.ok, summary: cloudSummary(s.cloud) })
  }

  const labelW = rows.reduce((m, r) => Math.max(m, r.label.length), 0)
  const urlW = rows.reduce((m, r) => Math.max(m, r.url.length), 0)

  const header = `Context: ${result.context}\n\n`
  if (rows.length === 0) return header
  const lines = rows.map((r) =>
    `  ${r.label.padEnd(labelW)}  ${r.url.padEnd(urlW)}  ${r.ok ? '✓' : '✗'}  ${r.summary}`
  )
  return header + lines.join('\n') + '\n'
}
