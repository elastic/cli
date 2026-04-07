/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from '../types.ts'

const projectIdParam = {
  name: 'project_id',
  description: 'ID of the Elasticsearch project',
  required: true,
}

export const projectApis: CloudApiDefinition[] = [
  {
    name: 'list',
    namespace: 'projects',
    description: 'List all Elasticsearch serverless projects',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch',
  },
  {
    name: 'get',
    namespace: 'projects',
    description: 'Retrieve information about an Elasticsearch serverless project',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch/{project_id}',
    pathParams: [projectIdParam],
  },
  {
    name: 'delete',
    namespace: 'projects',
    description: 'Delete an Elasticsearch serverless project',
    method: 'DELETE',
    path: '/api/v1/serverless/projects/elasticsearch/{project_id}',
    pathParams: [projectIdParam],
  },
]
