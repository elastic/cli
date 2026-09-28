/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'

export interface Namespace {
  name: string
  description: string
  shortcuts: string[]
  load: (program: Command) => Promise<void> | void
}

const namespaceList: Namespace[] = [
  {
    name: 'es',
    description: 'Elasticsearch commands',
    shortcuts: [],
    load: async (program: Command) => {
      const { register } = await import('./es/register.ts')
      register(program)
    },
  },
  {
    name: 'kibana',
    description: 'Kibana commands',
    shortcuts: [],
    load: async (program: Command) => {
      const { register } = await import('./kibana/register.ts')
      register(program)
    },
  },
  {
    name: 'fleet',
    description: 'Fleet commands',
    shortcuts: [],
    load: async (program: Command) => {
      const { register } = await import('./fleet/register.ts')
      register(program)
    },
  },
  {
    name: 'connectors',
    description: 'Connectors commands',
    shortcuts: [],
    load: async (program: Command) => {
      const { register } = await import('./connectors/register.ts')
      register(program)
    },
  },
  {
    name: 'status',
    description: 'Status commands',
    shortcuts: [],
    load: async (program: Command) => {
      const { register } = await import('./status/register.ts')
      register(program)
    },
  },
  {
    name: 'help',
    description: 'Help commands',
    shortcuts: [],
    load: async (program: Command) => {
      const { register } = await import('./help/register.ts')
      register(program)
    },
  },
]

export const namespaces: ReadonlyMap<string, Namespace> = new Map(
  namespaceList.map((ns) => [ns.name, ns])
)
