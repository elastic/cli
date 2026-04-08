/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerCloudCommands } from '../../src/cloud/register.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'

describe('registerCloudCommands', () => {
  describe('command tree structure', () => {
    it('returns a top-level "cloud" group', () => {
      const group = registerCloudCommands([])
      assert.equal(group.name(), 'cloud')
    })

    it('creates namespace subgroups from definitions', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list', namespace: 'deployments', description: 'List', method: 'GET', path: '/api/v1/deployments' },
        { name: 'list', namespace: 'projects', description: 'List', method: 'GET', path: '/api/v1/projects' },
      ]
      const group = registerCloudCommands(defs)
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('deployments'))
      assert.ok(subcommands.includes('projects'))
    })

    it('registers leaf commands under their namespace', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list', namespace: 'deployments', description: 'List', method: 'GET', path: '/api/v1/deployments' },
        { name: 'get', namespace: 'deployments', description: 'Get', method: 'GET', path: '/api/v1/deployments/{deployment_id}', pathParams: [{ name: 'deployment_id', description: 'ID', required: true }] },
      ]
      const group = registerCloudCommands(defs)
      const deploymentsGroup = group.commands.find((c) => c.name() === 'deployments')!
      const leafNames = deploymentsGroup.commands.map((c) => c.name())
      assert.deepEqual(leafNames, ['list', 'get'])
    })
  })

  describe('validation', () => {
    it('throws on invalid definition', () => {
      const defs: CloudApiDefinition[] = [
        { name: '', namespace: 'deployments', description: 'Bad', method: 'GET', path: '/test' },
      ]
      assert.throws(() => registerCloudCommands(defs), /invalid name/)
    })

    it('throws on duplicate command names within a namespace', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list', namespace: 'deployments', description: 'List 1', method: 'GET', path: '/a' },
        { name: 'list', namespace: 'deployments', description: 'List 2', method: 'GET', path: '/b' },
      ]
      assert.throws(() => registerCloudCommands(defs), /duplicate/)
    })
  })

  describe('default API definitions', () => {
    it('includes cloud and serverless namespaces by default', () => {
      const group = registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('deployments'), 'should have deployments')
      assert.ok(subcommands.includes('accounts'), 'should have accounts')
      assert.ok(subcommands.includes('extensions'), 'should have extensions')
      assert.ok(subcommands.includes('elasticsearch-projects'), 'should have elasticsearch-projects')
      assert.ok(subcommands.includes('regions'), 'should have regions')
      assert.ok(subcommands.includes('traffic-filters'), 'should have traffic-filters')
    })

    it('deployments namespace has list, get, and shutdown commands', () => {
      const group = registerCloudCommands()
      const deploymentsGroup = group.commands.find((c) => c.name() === 'deployments')!
      const leafNames = deploymentsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list-deployments'))
      assert.ok(leafNames.includes('get-deployment'))
      assert.ok(leafNames.includes('shutdown-deployment'))
    })

    it('accounts namespace has get and update commands', () => {
      const group = registerCloudCommands()
      const accountsGroup = group.commands.find((c) => c.name() === 'accounts')!
      const leafNames = accountsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('get-current-account'))
      assert.ok(leafNames.includes('update-current-account'))
    })

    it('elasticsearch-projects namespace has CRUD commands', () => {
      const group = registerCloudCommands()
      const esProjects = group.commands.find((c) => c.name() === 'elasticsearch-projects')!
      const leafNames = esProjects.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list-elasticsearch-projects'))
      assert.ok(leafNames.includes('get-elasticsearch-project'))
      assert.ok(leafNames.includes('delete-elasticsearch-project'))
      assert.ok(leafNames.includes('create-elasticsearch-project'))
    })
  })
})
