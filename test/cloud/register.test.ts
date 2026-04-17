/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerCloudCommands, simplifyProjectCommandName } from '../../src/cloud/register.ts'
import type { CloudApiDefinition } from '../../src/cloud/types.ts'

describe('registerCloudCommands', () => {
  describe('top-level tree', () => {
    it('returns a top-level "cloud" group', () => {
      const group = registerCloudCommands([])
      assert.equal(group.name(), 'cloud')
    })

    it('has promoted, hosted, and serverless subgroups with default definitions', () => {
      const group = registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('accounts'), 'should have promoted "accounts"')
      assert.ok(subcommands.includes('authentication'), 'should have promoted "authentication"')
      assert.ok(subcommands.includes('organizations'), 'should have promoted "organizations"')
      assert.ok(subcommands.includes('user-role-assignments'), 'should have promoted "user-role-assignments"')
      assert.ok(subcommands.includes('hosted'), 'should have "hosted" subgroup')
      assert.ok(subcommands.includes('serverless'), 'should have "serverless" subgroup')
    })

    it('does not expose hosted or serverless namespaces at the top level', () => {
      const group = registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(!subcommands.includes('deployments'), 'deployments must live under hosted')
      assert.ok(!subcommands.includes('extensions'), 'extensions must live under hosted')
      assert.ok(!subcommands.includes('stack'), 'stack must live under hosted')
      assert.ok(!subcommands.includes('regions'), 'regions must live under serverless')
      assert.ok(!subcommands.includes('traffic-filters'), 'traffic-filters must live under serverless')
      assert.ok(!subcommands.includes('elasticsearch-projects'), 'elasticsearch-projects must live under serverless es')
    })
  })

  describe('promoted namespaces (cloud level)', () => {
    it('accounts has its codegen command names preserved', () => {
      const group = registerCloudCommands()
      const accountsGroup = group.commands.find((c) => c.name() === 'accounts')!
      const leafNames = accountsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('get-current-account'))
      assert.ok(leafNames.includes('update-current-account'))
    })

    it('organizations has its codegen command names preserved', () => {
      const group = registerCloudCommands()
      const orgsGroup = group.commands.find((c) => c.name() === 'organizations')!
      const leafNames = orgsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list-organizations'))
      assert.ok(leafNames.includes('get-organization'))
    })

    it('promoted synthetic defs are lifted out of hosted', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-current-account', namespace: 'accounts', description: 'Get', method: 'GET', path: '/api/v1/account' },
        { name: 'list-deployments', namespace: 'deployments', description: 'List', method: 'GET', path: '/api/v1/deployments' },
      ]
      const group = registerCloudCommands(defs)
      const top = group.commands.map((c) => c.name())
      assert.ok(top.includes('accounts'))
      assert.ok(top.includes('hosted'))
      const hostedChildren = group.commands.find((c) => c.name() === 'hosted')!.commands.map((c) => c.name())
      assert.ok(!hostedChildren.includes('accounts'), 'accounts must not appear under hosted')
      assert.ok(hostedChildren.includes('deployments'))
    })
  })

  describe('hosted subgroup', () => {
    it('contains hosted-specific namespaces', () => {
      const group = registerCloudCommands()
      const hosted = group.commands.find((c) => c.name() === 'hosted')!
      const namespaces = hosted.commands.map((c) => c.name())
      assert.ok(namespaces.includes('deployments'))
      assert.ok(namespaces.includes('deployment-templates'))
      assert.ok(namespaces.includes('deployments-traffic-filter'))
      assert.ok(namespaces.includes('extensions'))
      assert.ok(namespaces.includes('stack'))
      assert.ok(namespaces.includes('trusted-environments'))
      assert.ok(namespaces.includes('billing-costs-analysis'))
    })

    it('does not contain promoted namespaces', () => {
      const group = registerCloudCommands()
      const hosted = group.commands.find((c) => c.name() === 'hosted')!
      const namespaces = hosted.commands.map((c) => c.name())
      assert.ok(!namespaces.includes('accounts'))
      assert.ok(!namespaces.includes('authentication'))
      assert.ok(!namespaces.includes('organizations'))
      assert.ok(!namespaces.includes('user-role-assignments'))
    })

    it('deployments namespace has list, get, and shutdown commands', () => {
      const group = registerCloudCommands()
      const deployments = group.commands.find((c) => c.name() === 'hosted')!
        .commands.find((c) => c.name() === 'deployments')!
      const leafNames = deployments.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list-deployments'))
      assert.ok(leafNames.includes('get-deployment'))
      assert.ok(leafNames.includes('shutdown-deployment'))
    })
  })

  describe('serverless subgroup', () => {
    it('contains project-type groups and flat serverless namespaces', () => {
      const group = registerCloudCommands()
      const serverless = group.commands.find((c) => c.name() === 'serverless')!
      const namespaces = serverless.commands.map((c) => c.name())
      assert.ok(namespaces.includes('es'), 'should have "es" project-type group')
      assert.ok(namespaces.includes('observability'))
      assert.ok(namespaces.includes('security'))
      assert.ok(namespaces.includes('regions'))
      assert.ok(namespaces.includes('traffic-filters'))
    })

    it('es projects has CRUD commands with short names', () => {
      const group = registerCloudCommands()
      const projects = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'es')!
        .commands.find((c) => c.name() === 'projects')!
      const leafNames = projects.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list'), 'should have list')
      assert.ok(leafNames.includes('create'), 'should have create')
      assert.ok(leafNames.includes('get'), 'should have get')
      assert.ok(leafNames.includes('delete'), 'should have delete')
      assert.ok(leafNames.includes('patch'), 'should have patch')
      assert.ok(leafNames.includes('resume'), 'should have resume')
      assert.ok(leafNames.includes('get-status'))
      assert.ok(leafNames.includes('get-roles'))
      assert.ok(leafNames.includes('reset-credentials'))
    })

    it('restructures synthetic project defs under serverless > <type> > projects', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-observability-projects', namespace: 'observability-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/observability' },
        { name: 'get-observability-project', namespace: 'observability-projects', description: 'Get', method: 'GET', path: '/api/v1/serverless/projects/observability/{id}', pathParams: [{ name: 'id', description: 'ID', required: true }] },
      ]
      const group = registerCloudCommands(defs)
      const projects = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'observability')!
        .commands.find((c) => c.name() === 'projects')!
      assert.deepEqual(projects.commands.map((c) => c.name()), ['list', 'get'])
    })

    it('keeps non-project serverless namespaces flat with codegen names', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-regions', namespace: 'regions', description: 'List', method: 'GET', path: '/api/v1/serverless/regions' },
        { name: 'get-region', namespace: 'regions', description: 'Get', method: 'GET', path: '/api/v1/serverless/regions/{id}', pathParams: [{ name: 'id', description: 'ID', required: true }] },
      ]
      const group = registerCloudCommands(defs)
      const regions = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'regions')!
      assert.deepEqual(regions.commands.map((c) => c.name()), ['list-regions', 'get-region'])
    })

    it('adds --wait flag to create project commands only', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'create-elasticsearch-project', namespace: 'elasticsearch-projects', description: 'Create', method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' },
        { name: 'list-elasticsearch-projects', namespace: 'elasticsearch-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/elasticsearch' },
      ]
      const group = registerCloudCommands(defs)
      const projects = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'es')!
        .commands.find((c) => c.name() === 'projects')!
      const createCmd = projects.commands.find((c) => c.name() === 'create')!
      const listCmd = projects.commands.find((c) => c.name() === 'list')!
      assert.ok(createCmd.options.map((o) => o.long).includes('--wait'))
      assert.ok(!listCmd.options.map((o) => o.long).includes('--wait'))
    })
  })

  describe('validation', () => {
    it('throws on invalid definition', () => {
      const defs: CloudApiDefinition[] = [
        { name: '', namespace: 'deployments', description: 'Bad', method: 'GET', path: '/test' },
      ]
      assert.throws(() => registerCloudCommands(defs), /invalid name/)
    })

    it('throws on duplicate command names within a hosted namespace', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list', namespace: 'deployments', description: 'List 1', method: 'GET', path: '/a' },
        { name: 'list', namespace: 'deployments', description: 'List 2', method: 'GET', path: '/b' },
      ]
      assert.throws(() => registerCloudCommands(defs), /duplicate/)
    })

    it('throws on duplicate command names within a promoted namespace', () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-current-account', namespace: 'accounts', description: '1', method: 'GET', path: '/a' },
        { name: 'get-current-account', namespace: 'accounts', description: '2', method: 'GET', path: '/b' },
      ]
      assert.throws(() => registerCloudCommands(defs), /duplicate/)
    })
  })

  describe('default command aliases', () => {
    it('no commands have aliases', () => {
      const group = registerCloudCommands()
      interface CommandNode {
        name(): string
        aliases(): string[]
        commands: CommandNode[]
      }
      const visit = (cmd: CommandNode): void => {
        assert.deepEqual(cmd.aliases(), [], `${cmd.name()} should have no alias`)
        for (const child of cmd.commands) visit(child)
      }
      for (const child of group.commands as unknown as CommandNode[]) visit(child)
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
