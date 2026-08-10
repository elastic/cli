/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Derives the export identifier stem @elastic/schemas uses for a namespace file: kebab
 * segments become camelCase and any other non-identifier character (e.g. the dot in
 * "get_agent_builder_a2a_agentid.json") becomes an underscore.
 */
export function toExportStem (stem: string): string {
  return stem
    .replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
    .replace(/[^A-Za-z0-9_$]/g, '_')
}
