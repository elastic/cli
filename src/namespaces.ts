/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const NAMESPACES = [
  'es',
  'kibana',
  'cloud',
  'fleet',
  'connectors',
] as const

export type Namespace = (typeof NAMESPACES)[number]
