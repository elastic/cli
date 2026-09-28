/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Namespace {
  name: string
  description: string
  commands: string[]
}

export const namespaces: ReadonlyArray<Namespace> = [
  {
    name: 'es',
    description: 'Elasticsearch commands',
    commands: ['search', 'get', 'index', 'delete', 'bulk', 'cat', 'cluster', 'nodes', 'indices', 'aliases', 'mappings', 'settings', 'templates', 'snapshots', 'tasks', 'sql', 'transform', 'rollup', 'ilm', 'slm', 'license', 'pipeline', 'reindex', 'scroll', 'pit'],
  },
  {
    name: 'kibana',
    description: 'Kibana commands',
    commands: ['status', 'spaces', 'saved-objects', 'dashboards', 'data-views', 'alerts', 'cases', 'fleet', 'connectors'],
  },
  {
    name: 'fleet',
    description: 'Fleet commands',
    commands: ['agents', 'policies', 'packages', 'enrollment-keys', 'outputs', 'proxies', 'service-tokens'],
  },
  {
    name: 'connectors',
    description: 'Connector commands',
    commands: ['list', 'get', 'create', 'update', 'delete', 'sync', 'stats'],
  },
]
