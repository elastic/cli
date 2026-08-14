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
    it('returns a top-level "cloud" group', async () => {
      const group = await registerCloudCommands([])
      assert.equal(group.name(), 'cloud')
    })

    it('has renamed promoted namespaces, hosted, and serverless subgroups', async () => {
      const group = await registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(subcommands.includes('trust'),   'accounts → trust')
      assert.ok(subcommands.includes('auth'),    'authentication → auth')
      assert.ok(subcommands.includes('orgs'),    'organizations → orgs')
      assert.ok(subcommands.includes('users'),   'user-role-assignments → users')
      assert.ok(subcommands.includes('billing'), 'billing-costs-analysis promoted to billing')
      assert.ok(subcommands.includes('hosted'),     'should have "hosted" subgroup')
      assert.ok(subcommands.includes('serverless'), 'should have "serverless" subgroup')
    })

    it('does not expose hosted or serverless namespaces at the top level', async () => {
      const group = await registerCloudCommands()
      const subcommands = group.commands.map((c) => c.name())
      assert.ok(!subcommands.includes('deployments'),          'deployments must live under hosted')
      assert.ok(!subcommands.includes('extensions'),           'extensions must live under hosted')
      assert.ok(!subcommands.includes('stack'),                'stack must live under hosted')
      assert.ok(!subcommands.includes('regions'),              'regions must live under serverless')
      assert.ok(!subcommands.includes('traffic-filters'),      'traffic-filters must live under serverless')
      assert.ok(!subcommands.includes('elasticsearch-projects'),'elasticsearch-projects must live under serverless')
      // old names must not appear
      assert.ok(!subcommands.includes('accounts'),             'old name accounts must not appear')
      assert.ok(!subcommands.includes('authentication'),       'old name authentication must not appear')
      assert.ok(!subcommands.includes('organizations'),        'old name organizations must not appear')
      assert.ok(!subcommands.includes('user-role-assignments'),'old name user-role-assignments must not appear')
      assert.ok(!subcommands.includes('billing-costs-analysis'),'raw billing-costs-analysis must not appear')
    })
  })

  describe('promoted namespaces (cloud level)', () => {
    it('trust (was: accounts) has its codegen command names preserved', async () => {
      const group = await registerCloudCommands()
      const trustGroup = group.commands.find((c) => c.name() === 'trust')!
      const leafNames = trustGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('get-current-account'))
      assert.ok(leafNames.includes('update-current-account'))
    })

    it('orgs (was: organizations) has its codegen command names preserved', async () => {
      const group = await registerCloudCommands()
      const orgsGroup = group.commands.find((c) => c.name() === 'orgs')!
      const leafNames = orgsGroup.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list-organizations'))
      assert.ok(leafNames.includes('get-organization'))
    })

    it('billing (was: billing-costs-analysis) is promoted to top-level cloud', async () => {
      const group = await registerCloudCommands()
      const billing = group.commands.find((c) => c.name() === 'billing')!
      assert.ok(billing != null, 'billing must exist at top level')
      const leafNames = billing.commands.map((c) => c.name())
      assert.ok(leafNames.length > 0, 'billing must have commands')
    })

    it('promoted synthetic defs are lifted out of hosted with new display names', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-current-account', namespace: 'accounts', description: 'Get', method: 'GET', path: '/api/v1/account' },
        { name: 'list-deployments', namespace: 'deployments', description: 'List', method: 'GET', path: '/api/v1/deployments' },
      ]
      const group = await registerCloudCommands(defs)
      const top = group.commands.map((c) => c.name())
      assert.ok(top.includes('trust'))
      assert.ok(top.includes('hosted'))
      const hostedChildren = group.commands.find((c) => c.name() === 'hosted')!.commands.map((c) => c.name())
      assert.ok(!hostedChildren.includes('trust'),    'trust must not appear under hosted')
      assert.ok(!hostedChildren.includes('accounts'), 'accounts must not appear under hosted')
      assert.ok(hostedChildren.includes('deployments'))
    })
  })

  describe('hosted subgroup', () => {
    it('contains hosted-specific namespaces with renames applied', async () => {
      const group = await registerCloudCommands()
      const hosted = group.commands.find((c) => c.name() === 'hosted')!
      const namespaces = hosted.commands.map((c) => c.name())
      assert.ok(namespaces.includes('deployments'))
      assert.ok(namespaces.includes('deployment-templates'))
      assert.ok(namespaces.includes('traffic-filters'),      'deployments-traffic-filter → traffic-filters')
      assert.ok(!namespaces.includes('deployments-traffic-filter'), 'old name must not appear')
      assert.ok(namespaces.includes('extensions'))
      assert.ok(namespaces.includes('stack'))
      assert.ok(namespaces.includes('trusted-environments'))
      assert.ok(!namespaces.includes('billing-costs-analysis'), 'billing promoted to top-level cloud')
      assert.ok(!namespaces.includes('billing'),               'billing must not appear under hosted')
    })

    it('does not contain promoted namespaces', async () => {
      const group = await registerCloudCommands()
      const hosted = group.commands.find((c) => c.name() === 'hosted')!
      const namespaces = hosted.commands.map((c) => c.name())
      assert.ok(!namespaces.includes('accounts'))
      assert.ok(!namespaces.includes('trust'))
      assert.ok(!namespaces.includes('authentication'))
      assert.ok(!namespaces.includes('auth'))
      assert.ok(!namespaces.includes('organizations'))
      assert.ok(!namespaces.includes('orgs'))
      assert.ok(!namespaces.includes('user-role-assignments'))
      assert.ok(!namespaces.includes('users'))
    })

    it('deployments namespace has list, get, and shutdown commands', async () => {
      const group = await registerCloudCommands()
      const deployments = group.commands.find((c) => c.name() === 'hosted')!
        .commands.find((c) => c.name() === 'deployments')!
      const leafNames = deployments.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list-deployments'))
      assert.ok(leafNames.includes('get-deployment'))
      assert.ok(leafNames.includes('shutdown-deployment'))
    })
  })

  describe('serverless subgroup', () => {
    it('has inverted axis: projects group containing search|elasticsearch, observability, security', async () => {
      const group = await registerCloudCommands()
      const serverless = group.commands.find((c) => c.name() === 'serverless')!
      const namespaces = serverless.commands.map((c) => c.name())
      assert.ok(namespaces.includes('projects'),       'should have top-level projects group')
      assert.ok(namespaces.includes('cross-project'),  'should have cross-project group')
      assert.ok(namespaces.includes('regions'))
      assert.ok(namespaces.includes('traffic-filters'))
      // old flat project-type groups must not exist at serverless level
      assert.ok(!namespaces.includes('es'),            'es must be inside projects now')
      assert.ok(!namespaces.includes('observability'), 'observability must be inside projects now')
      assert.ok(!namespaces.includes('security'),      'security must be inside projects now')
      assert.ok(!namespaces.includes('linked-projects'),           'merged into cross-project')
      assert.ok(!namespaces.includes('linked-candidate-projects'), 'merged into cross-project')
    })

    it('projects group has search|elasticsearch, observability, and security type groups', async () => {
      const group = await registerCloudCommands()
      const projects = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
      const typeNames = projects.commands.map((c) => c.name())
      assert.ok(typeNames.includes('search'),       'should have search (was: es)')
      assert.ok(typeNames.includes('observability'))
      assert.ok(typeNames.includes('security'))
    })

    it('search type has elasticsearch alias', async () => {
      const group = await registerCloudCommands()
      const search = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
        .commands.find((c) => c.name() === 'search')!
      assert.ok((search as unknown as { aliases(): string[] }).aliases().includes('elasticsearch'))
    })

    it('search type has CRUD commands with short names', async () => {
      const group = await registerCloudCommands()
      const search = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
        .commands.find((c) => c.name() === 'search')!
      const leafNames = search.commands.map((c) => c.name())
      assert.ok(leafNames.includes('list'))
      assert.ok(leafNames.includes('create'))
      assert.ok(leafNames.includes('get'))
      assert.ok(leafNames.includes('delete'))
      assert.ok(leafNames.includes('patch'))
      assert.ok(leafNames.includes('resume'))
      assert.ok(leafNames.includes('get-status'))
      assert.ok(leafNames.includes('get-roles'))
      assert.ok(leafNames.includes('reset-credentials'))
    })

    it('restructures synthetic project defs under serverless > projects > <type>', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-observability-projects', namespace: 'observability-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/observability' },
        { name: 'get-observability-project', namespace: 'observability-projects', description: 'Get', method: 'GET', path: '/api/v1/serverless/projects/observability/{id}', input: { type: 'object', properties: { id: { type: 'string', description: 'ID', 'x-found-in': 'path' } }, required: ['id'] } },
      ]
      const group = await registerCloudCommands(defs)
      const observability = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
        .commands.find((c) => c.name() === 'observability')!
      assert.deepEqual(observability.commands.map((c) => c.name()), ['list', 'get'])
    })

    it('merges linked-projects and linked-candidate-projects into cross-project', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-elasticsearch-project-can-delete', namespace: 'linked-projects', description: 'Can delete', method: 'GET', path: '/api/v1/serverless/projects/elasticsearch/{id}/can-delete', input: { type: 'object', properties: { id: { type: 'string', description: 'ID', 'x-found-in': 'path' } }, required: ['id'] } },
        { name: 'get-elasticsearch-project-link-candidates', namespace: 'linked-candidate-projects', description: 'Candidates', method: 'GET', path: '/api/v1/serverless/link-candidates/elasticsearch' },
      ]
      const group = await registerCloudCommands(defs)
      const serverless = group.commands.find((c) => c.name() === 'serverless')!
      const namespaces = serverless.commands.map((c) => c.name())
      assert.ok(namespaces.includes('cross-project'), 'cross-project group must exist')
      assert.ok(!namespaces.includes('linked-projects'))
      assert.ok(!namespaces.includes('linked-candidate-projects'))
      const crossProject = serverless.commands.find((c) => c.name() === 'cross-project')!
      const leafNames = crossProject.commands.map((c) => c.name())
      assert.ok(leafNames.includes('get-elasticsearch-project-can-delete'))
      assert.ok(leafNames.includes('get-elasticsearch-project-link-candidates'))
    })

    it('keeps non-project serverless namespaces flat with codegen names', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list-regions', namespace: 'regions', description: 'List', method: 'GET', path: '/api/v1/serverless/regions' },
        { name: 'get-region', namespace: 'regions', description: 'Get', method: 'GET', path: '/api/v1/serverless/regions/{id}', input: { type: 'object', properties: { id: { type: 'string', description: 'ID', 'x-found-in': 'path' } }, required: ['id'] } },
      ]
      const group = await registerCloudCommands(defs)
      const regions = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'regions')!
      assert.deepEqual(regions.commands.map((c) => c.name()), ['list-regions', 'get-region'])
    })

    it('exposes --name and --region-id flags on create project commands', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'create-elasticsearch-project', namespace: 'elasticsearch-projects', description: 'Create', method: 'POST', path: '/api/v1/serverless/projects/elasticsearch',
          input: { type: 'object', properties: { name: { type: 'string', description: 'Name', 'x-found-in': 'body' }, region_id: { type: 'string', description: 'Region', 'x-found-in': 'body' } }, required: ['name', 'region_id'] } },
      ]
      const group = await registerCloudCommands(defs)
      const createCmd = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
        .commands.find((c) => c.name() === 'search')!
        .commands.find((c) => c.name() === 'create')!
      const flags = createCmd.options.map((o) => o.long)
      assert.ok(flags.includes('--name'), '--name flag should be registered')
      assert.ok(flags.includes('--region-id'), '--region-id flag should be registered')
    })

    it('adds --wait flag to create project commands only', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'create-elasticsearch-project', namespace: 'elasticsearch-projects', description: 'Create', method: 'POST', path: '/api/v1/serverless/projects/elasticsearch' },
        { name: 'list-elasticsearch-projects', namespace: 'elasticsearch-projects', description: 'List', method: 'GET', path: '/api/v1/serverless/projects/elasticsearch' },
      ]
      const group = await registerCloudCommands(defs)
      const search = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
        .commands.find((c) => c.name() === 'search')!
      const createCmd = search.commands.find((c) => c.name() === 'create')!
      const listCmd = search.commands.find((c) => c.name() === 'list')!
      assert.ok(createCmd.options.map((o) => o.long).includes('--wait'))
      assert.ok(!listCmd.options.map((o) => o.long).includes('--wait'))
    })
  })

  describe('validation', () => {
    it('throws on invalid definition', async () => {
      const defs: CloudApiDefinition[] = [
        { name: '', namespace: 'deployments', description: 'Bad', method: 'GET', path: '/test' },
      ]
      await assert.rejects(registerCloudCommands(defs), /invalid name/)
    })

    it('throws on duplicate command names within a hosted namespace', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'list', namespace: 'deployments', description: 'List 1', method: 'GET', path: '/a' },
        { name: 'list', namespace: 'deployments', description: 'List 2', method: 'GET', path: '/b' },
      ]
      await assert.rejects(registerCloudCommands(defs), /duplicate/)
    })

    it('throws on duplicate command names within a promoted namespace', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-current-account', namespace: 'accounts', description: '1', method: 'GET', path: '/a' },
        { name: 'get-current-account', namespace: 'accounts', description: '2', method: 'GET', path: '/b' },
      ]
      await assert.rejects(registerCloudCommands(defs), /duplicate/)
    })
  })

  describe('command aliases', () => {
    it('search type group has elasticsearch alias, all others have no aliases', async () => {
      const group = await registerCloudCommands()
      interface CommandNode {
        name(): string
        aliases(): string[]
        commands: CommandNode[]
      }
      const issues: string[] = []
      const visit = (cmd: CommandNode, path: string): void => {
        const aliases = cmd.aliases()
        const isSearchGroup = path === 'cloud.serverless.projects.search'
        if (isSearchGroup) {
          if (!aliases.includes('elasticsearch')) {
            issues.push(`${path} should have alias 'elasticsearch'`)
          }
        } else if (aliases.length > 0) {
          issues.push(`${path} should have no alias but has: ${aliases.join(', ')}`)
        }
        for (const child of cmd.commands) visit(child, `${path}.${child.name()}`)
      }
      for (const child of group.commands as unknown as CommandNode[]) {
        visit(child, `cloud.${child.name()}`)
      }
      assert.deepEqual(issues, [])
    })
  })

  describe('destructive intent', () => {
    it('registers --yes for a PUT flat leaf marked destructive: true', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'update-current-account', namespace: 'accounts', description: 'Update', method: 'PUT', path: '/api/v1/account', destructive: true },
      ]
      const group = await registerCloudCommands(defs)
      const cmd = group.commands.find((c) => c.name() === 'trust')!
        .commands.find((c) => c.name() === 'update-current-account')!
      assert.ok(cmd.options.map((o) => o.long).includes('--yes'), 'PUT def.destructive: true must expose --yes')
    })

    it('omits --yes for a PUT flat leaf marked destructive: false', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-current-account', namespace: 'accounts', description: 'Idempotent replace', method: 'PUT', path: '/api/v1/account', destructive: false },
      ]
      const group = await registerCloudCommands(defs)
      const cmd = group.commands.find((c) => c.name() === 'trust')!
        .commands.find((c) => c.name() === 'get-current-account')!
      assert.ok(!cmd.options.map((o) => o.long).includes('--yes'), 'PUT def.destructive: false must not expose --yes')
    })

    it('registers --yes for a PATCH flat leaf marked destructive: true', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'patch-current-account', namespace: 'accounts', description: 'Patch', method: 'PATCH', path: '/api/v1/account', destructive: true },
      ]
      const group = await registerCloudCommands(defs)
      const cmd = group.commands.find((c) => c.name() === 'trust')!
        .commands.find((c) => c.name() === 'patch-current-account')!
      assert.ok(cmd.options.map((o) => o.long).includes('--yes'), 'PATCH def.destructive: true must expose --yes')
    })

    it('registers --yes for a destructive PUT command inside a serverless project type group', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'reset-elasticsearch-project-credentials', namespace: 'elasticsearch-projects', description: 'Reset', method: 'PUT', path: '/api/v1/serverless/projects/elasticsearch/{id}/_reset-credentials', destructive: true, input: { type: 'object', properties: { id: { type: 'string', description: 'ID', 'x-found-in': 'path' } }, required: ['id'] } },
      ]
      const group = await registerCloudCommands(defs)
      const cmd = group.commands.find((c) => c.name() === 'serverless')!
        .commands.find((c) => c.name() === 'projects')!
        .commands.find((c) => c.name() === 'search')!
        .commands.find((c) => c.name() === 'reset-credentials')!
      assert.ok(cmd.options.map((o) => o.long).includes('--yes'), 'serverless PUT def.destructive: true must expose --yes')
    })

    it('omits --yes for a non-destructive GET command', async () => {
      const defs: CloudApiDefinition[] = [
        { name: 'get-current-account', namespace: 'accounts', description: 'Get', method: 'GET', path: '/api/v1/account', destructive: false },
      ]
      const group = await registerCloudCommands(defs)
      const cmd = group.commands.find((c) => c.name() === 'trust')!
        .commands.find((c) => c.name() === 'get-current-account')!
      assert.ok(!cmd.options.map((o) => o.long).includes('--yes'), 'GET def.destructive: false must not expose --yes')
    })
  })
})

describe('simplifyProjectCommandName', () => {
  it('strips plural namespace suffix', async () => {
    assert.equal(simplifyProjectCommandName('list-elasticsearch-projects', 'elasticsearch-projects'), 'list')
  })

  it('strips singular namespace suffix', async () => {
    assert.equal(simplifyProjectCommandName('create-elasticsearch-project', 'elasticsearch-projects'), 'create')
  })

  it('strips mid-name project type leaving hyphenated remainder', async () => {
    assert.equal(simplifyProjectCommandName('reset-elasticsearch-project-credentials', 'elasticsearch-projects'), 'reset-credentials')
  })

  it('strips project type from compound action names', async () => {
    assert.equal(simplifyProjectCommandName('get-elasticsearch-project-status', 'elasticsearch-projects'), 'get-status')
    assert.equal(simplifyProjectCommandName('get-elasticsearch-project-roles', 'elasticsearch-projects'), 'get-roles')
  })

  it('works for observability namespace', async () => {
    assert.equal(simplifyProjectCommandName('list-observability-projects', 'observability-projects'), 'list')
    assert.equal(simplifyProjectCommandName('resume-observability-project', 'observability-projects'), 'resume')
  })

  it('works for security namespace', async () => {
    assert.equal(simplifyProjectCommandName('delete-security-project', 'security-projects'), 'delete')
    assert.equal(simplifyProjectCommandName('get-security-project-status', 'security-projects'), 'get-status')
  })
})
