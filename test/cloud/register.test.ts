/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerCloudCommands, registerServerlessCommands, simplifyProjectCommandName } from '../../src/cloud/register.ts'
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
        { name: 'list', namespace: 'accounts', description: 'List', method: 'GET', path: '/api/v1/accounts' },
      ]
      const group = registerCloudCommands(defs)
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('deployments'))
      assert.ok(subcommands.includes('accounts'))
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

  describe('default API definitions (hosted cloud only)', () => {
    it('includes hosted cloud namespaces', () => {
      const group = registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('deployments'), 'should have deployments')
      assert.ok(subcommands.includes('accounts'), 'should have accounts')
      assert.ok(subcommands.includes('extensions'), 'should have extensions')
    })

    it('does not include serverless namespaces', () => {
      const group = registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(!subcommands.includes('elasticsearch-projects'), 'should not have elasticsearch-projects')
      assert.ok(!subcommands.includes('regions'), 'should not have regions')
      assert.ok(!subcommands.includes('traffic-filters'), 'should not have traffic-filters')
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

    it('no commands have aliases', () => {
      const group = registerCloudCommands()
      for (const ns of group.commands) {
        for (const cmd of ns.commands) {
          assert.deepEqual(cmd.aliases(), [], `${cmd.name()} should have no alias`)
        }
      }
    })
  })
})

describe('registerServerlessCommands', () => {
  describe('command tree structure', () => {
    it('returns a top-level "serverless" group', () => {
      const group = registerServerlessCommands([])
      assert.equal(group.name(), 'serverless')
    })

    it('restructures elasticsearch-projects under serverless > es > projects', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-elasticsearch-projects', namespace: 'elasticsearch-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/elasticsearch' },
        { name: 'create-elasticsearch-project', namespace: 'elasticsearch-projects', description: 'Create', method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' },
      ]
      const group = registerServerlessCommands(defs)
      const esGroup = group.commands.find((c) => c.name() === 'es')!
      assert.ok(esGroup, 'should have "es" subgroup')
      const projectsGroup = esGroup.commands.find((c) => c.name() === 'projects')!
      assert.ok(projectsGroup, 'should have "projects" under "es"')
      const leafNames = projectsGroup.commands.map((c) => c.name())
      assert.deepEqual(leafNames, ['list', 'create'])
    })

    it('restructures observability-projects under serverless > observability > projects', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-observability-projects', namespace: 'observability-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/observability' },
        { name: 'get-observability-project', namespace: 'observability-projects', description: 'Get', method: 'GET', path: '/api/v1/serverless/projects/observability/{id}', pathParams: [{ name: 'id', description: 'ID', required: true }] },
      ]
      const group = registerServerlessCommands(defs)
      const obsGroup = group.commands.find((c) => c.name() === 'observability')!
      const projectsGroup = obsGroup.commands.find((c) => c.name() === 'projects')!
      const leafNames = projectsGroup.commands.map((c) => c.name())
      assert.deepEqual(leafNames, ['list', 'get'])
    })

    it('restructures security-projects under serverless > security > projects', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'delete-security-project', namespace: 'security-projects', description: 'Delete', method: 'DELETE', path: '/api/v1/serverless/projects/security/{id}', pathParams: [{ name: 'id', description: 'ID', required: true }] },
      ]
      const group = registerServerlessCommands(defs)
      const secGroup = group.commands.find((c) => c.name() === 'security')!
      const projectsGroup = secGroup.commands.find((c) => c.name() === 'projects')!
      const leafNames = projectsGroup.commands.map((c) => c.name())
      assert.deepEqual(leafNames, ['delete'])
    })

    it('keeps non-project namespaces as direct children of serverless', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-regions', namespace: 'regions', description: 'List', method: 'GET', path: '/api/v1/serverless/regions' },
        { name: 'get-region', namespace: 'regions', description: 'Get', method: 'GET', path: '/api/v1/serverless/regions/{id}', pathParams: [{ name: 'id', description: 'ID', required: true }] },
      ]
      const group = registerServerlessCommands(defs)
      const regionsGroup = group.commands.find((c) => c.name() === 'regions')!
      assert.ok(regionsGroup, 'should have "regions" subgroup')
      const leafNames = regionsGroup.commands.map((c) => c.name())
      assert.deepEqual(leafNames, ['list-regions', 'get-region'])
    })

    it('adds --wait flag to create project commands', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'create-elasticsearch-project', namespace: 'elasticsearch-projects', description: 'Create', method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' },
        { name: 'list-elasticsearch-projects', namespace: 'elasticsearch-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/elasticsearch' },
      ]
      const group = registerServerlessCommands(defs)
      const projectsGroup = group.commands.find((c) => c.name() === 'es')!.commands.find((c) => c.name() === 'projects')!
      const createCmd = projectsGroup.commands.find((c) => c.name() === 'create')!
      const listCmd = projectsGroup.commands.find((c) => c.name() === 'list')!
      const createOpts = createCmd.options.map((o) => o.long)
      const listOpts = listCmd.options.map((o) => o.long)
      assert.ok(createOpts.includes('--wait'), 'create should have --wait')
      assert.ok(!listOpts.includes('--wait'), 'list should not have --wait')
    })
  })

  describe('default API definitions', () => {
    it('includes project types as restructured groups', () => {
      const group = registerServerlessCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('es'), 'should have "es" group')
      assert.ok(subcommands.includes('observability'), 'should have "observability" group')
      assert.ok(subcommands.includes('security'), 'should have "security" group')
    })

    it('includes non-project serverless namespaces', () => {
      const group = registerServerlessCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('regions'), 'should have regions')
      assert.ok(subcommands.includes('traffic-filters'), 'should have traffic-filters')
    })

    it('es projects has CRUD commands with short names', () => {
      const group = registerServerlessCommands()
      const esGroup = group.commands.find((c) => c.name() === 'es')!
      const projectsGroup = esGroup.commands.find((c) => c.name() === 'projects')!
      const leafNames = projectsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list'), 'should have list')
      assert.ok(leafNames.includes('create'), 'should have create')
      assert.ok(leafNames.includes('get'), 'should have get')
      assert.ok(leafNames.includes('delete'), 'should have delete')
      assert.ok(leafNames.includes('patch'), 'should have patch')
      assert.ok(leafNames.includes('resume'), 'should have resume')
      assert.ok(leafNames.includes('get-status'), 'should have get-status')
      assert.ok(leafNames.includes('get-roles'), 'should have get-roles')
      assert.ok(leafNames.includes('reset-credentials'), 'should have reset-credentials')
    })
  })
})

describe('simplifyProjectCommandName', () => {
  it('strips plural namespace suffix', () => {
    assert.equal(simplifyProjectCommandName('list-elasticsearch-projects', 'elasticsearch-projects'), 'list')
  })

  it('strips singular namespace suffix', () => {
    assert.equal(simplifyProjectCommandName('create-elasticsearch-project', 'elasticsearch-projects'), 'create')
  })

  it('strips mid-name project type leaving hyphenated remainder', () => {
    assert.equal(simplifyProjectCommandName('reset-elasticsearch-project-credentials', 'elasticsearch-projects'), 'reset-credentials')
  })

  it('strips project type from compound action names', () => {
    assert.equal(simplifyProjectCommandName('get-elasticsearch-project-status', 'elasticsearch-projects'), 'get-status')
    assert.equal(simplifyProjectCommandName('get-elasticsearch-project-roles', 'elasticsearch-projects'), 'get-roles')
  })

  it('works for observability namespace', () => {
    assert.equal(simplifyProjectCommandName('list-observability-projects', 'observability-projects'), 'list')
    assert.equal(simplifyProjectCommandName('resume-observability-project', 'observability-projects'), 'resume')
  })

  it('works for security namespace', () => {
    assert.equal(simplifyProjectCommandName('delete-security-project', 'security-projects'), 'delete')
    assert.equal(simplifyProjectCommandName('get-security-project-status', 'security-projects'), 'get-status')
  })
})
