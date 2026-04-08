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
    it('includes deployments and projects namespaces by default', () => {
      const group = registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('deployments'), 'should have deployments')
      assert.ok(subcommands.includes('projects'), 'should have projects')
    })

    it('deployments namespace has list, get, and shutdown commands', () => {
      const group = registerCloudCommands()
      const deploymentsGroup = group.commands.find((c) => c.name() === 'deployments')!
      const leafNames = deploymentsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list'))
      assert.ok(leafNames.includes('get'))
      assert.ok(leafNames.includes('shutdown'))
    })

    it('projects namespace has list, get, and delete commands', () => {
      const group = registerCloudCommands()
      const projectsGroup = group.commands.find((c) => c.name() === 'projects')!
      const leafNames = projectsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list'))
      assert.ok(leafNames.includes('get'))
      assert.ok(leafNames.includes('delete'))
    })
  })
})
