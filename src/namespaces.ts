/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type NamespaceId = 'es' | 'kibana' | 'cloud' | 'fleet' | 'connectors'

export interface Namespace {
  name: NamespaceId
  description: string
  shortcuts: string[]
  load: () => Promise<unknown>
}

export const NAMESPACES: ReadonlyMap<string, Namespace> = new Map<string, Namespace>([
  [
    'es',
    {
      name: 'es',
      description: 'Elasticsearch commands',
      shortcuts: [],
      load: async () => import('./es/register.ts'),
    },
  ],
  [
    'kibana',
    {
      name: 'kibana',
      description: 'Kibana commands',
      shortcuts: [],
      load: async () => import('./kibana/register.ts'),
    },
  ],
  [
    'cloud',
    {
      name: 'cloud',
      description: 'Elastic Cloud commands',
      shortcuts: [],
      load: async () => import('./cloud/register.ts'),
    },
  ],
  [
    'fleet',
    {
      name: 'fleet',
      description: 'Fleet commands',
      shortcuts: [],
      load: async () => import('./fleet/register.ts'),
    },
  ],
  [
    'connectors',
    {
      name: 'connectors',
      description: 'Connectors commands',
      shortcuts: [],
      load: async () => import('./connectors/register.ts'),
    },
  ],
])
