/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const namespaces = [
  'es',
  'kibana',
  'fleet',
  'connectors',
  'status',
  'help',
] as const

export type Namespace = (typeof namespaces)[number]

/** Alias kept for backwards-compatibility with imports expecting `NAMESPACES`. */
export const NAMESPACES = namespaces
