/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from '../types.ts'

const deploymentIdParam = {
  name: 'deployment_id',
  description: 'Identifier for the Deployment',
  required: true,
}

export const deploymentApis: CloudApiDefinition[] = [
  {
    name: 'list',
    namespace: 'deployments',
    description: 'List all deployments belonging to the authenticated user',
    method: 'GET',
    path: '/api/v1/deployments',
  },
  {
    name: 'get',
    namespace: 'deployments',
    description: 'Retrieve information about a specific deployment',
    method: 'GET',
    path: '/api/v1/deployments/{deployment_id}',
    pathParams: [deploymentIdParam],
    queryParams: [
      { name: 'show_metadata', type: 'boolean', description: 'Include the full cluster metadata in the response' },
      { name: 'show_plans', type: 'boolean', description: 'Include the full current and pending plan information' },
      { name: 'show_settings', type: 'boolean', description: 'Include cluster settings in the response' },
    ],
  },
  {
    name: 'shutdown',
    namespace: 'deployments',
    description: 'Shut down all resources in a deployment',
    method: 'POST',
    path: '/api/v1/deployments/{deployment_id}/_shutdown',
    pathParams: [deploymentIdParam],
    queryParams: [
      { name: 'skip_snapshot', type: 'boolean', description: 'Whether to skip snapshots before shutting down' },
    ],
  },
]
