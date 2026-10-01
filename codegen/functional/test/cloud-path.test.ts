/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cloudCliPath } from '../cloud-path.ts'
import type { CloudApiDefinition } from '../../../src/cloud/types.ts'

function def (namespace: string, name: string): CloudApiDefinition {
  return { namespace, name, description: '', method: 'GET', path: '/', destructive: false } as CloudApiDefinition
}

describe('cloudCliPath', () => {
  it('promotes cross-cutting namespaces to a direct child of cloud', () => {
    assert.deepEqual(cloudCliPath(def('accounts', 'get-current-account')), ['trust', 'get-current-account'])
  })

  it('nests hosted namespaces under hosted with display renames', () => {
    assert.deepEqual(cloudCliPath(def('deployments', 'get-deployment')), ['hosted', 'deployments', 'get-deployment'])
    assert.deepEqual(
      cloudCliPath(def('deployments-traffic-filter', 'get-traffic-filter-ruleset')),
      ['hosted', 'traffic-filters', 'get-traffic-filter-ruleset']
    )
  })

  it('inverts serverless project namespaces into projects <type> <short-action>', () => {
    assert.deepEqual(
      cloudCliPath(def('elasticsearch-projects', 'get-elasticsearch-project')),
      ['serverless', 'projects', 'search', 'get']
    )
    assert.deepEqual(
      cloudCliPath(def('security-projects', 'list-security-projects')),
      ['serverless', 'projects', 'security', 'list']
    )
  })

  it('keeps other serverless namespaces flat under serverless', () => {
    assert.deepEqual(cloudCliPath(def('regions', 'list-regions')), ['serverless', 'regions', 'list-regions'])
  })

  it('merges linked-project namespaces into cross-project', () => {
    assert.deepEqual(
      cloudCliPath(def('linked-projects', 'get-elasticsearch-project-can-delete')),
      ['serverless', 'cross-project', 'get-elasticsearch-project-can-delete']
    )
  })
})
