/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloudApiDefinition } from './types.ts'

export const allServerlessApis: CloudApiDefinition[] = [
  // ── elasticsearch-projects ───────────────────────────────────────────────
  {
    name: 'list-elasticsearch-projects',
    namespace: 'elasticsearch-projects',
    description: 'Get Elasticsearch projects',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        traffic_filter: { type: 'string', description: 'Filters the returned list of projects. Only projects associated with the provided traffic_filter will be returned.', 'x-found-in': 'query' },
        linked: { type: 'string', description: 'Contains a project ID. If specified, the result will be filtered to only those origin projects that are linked to the specified project ID in a cross-project search configuration.', 'x-found-in': 'query' },
        tags: { type: 'string', description: 'If specified, the result will be filtered to only those projects that have the specified tags and corresponding values.', 'x-found-in': 'query' },
      },
    },
  },
  {
    name: 'create-elasticsearch-project',
    namespace: 'elasticsearch-projects',
    description: 'Create an Elasticsearch project',
    method: 'POST',
    path: '/api/v1/serverless/projects/elasticsearch',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Descriptive name for a project.', 'x-found-in': 'body' },
        region_id: { type: 'string', description: 'Unique human-readable identifier for a region in Elastic Cloud.', 'x-found-in': 'body' },
      },
      required: ['name', 'region_id'],
    },
  },
  {
    name: 'get-elasticsearch-project',
    namespace: 'elasticsearch-projects',
    description: 'Get an Elasticsearch project',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch/{id}',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete-elasticsearch-project',
    namespace: 'elasticsearch-projects',
    description: 'Delete an Elasticsearch project',
    method: 'DELETE',
    path: '/api/v1/serverless/projects/elasticsearch/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'patch-elasticsearch-project',
    namespace: 'elasticsearch-projects',
    description: 'Update an Elasticsearch project',
    method: 'PATCH',
    path: '/api/v1/serverless/projects/elasticsearch/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'reset-elasticsearch-project-credentials',
    namespace: 'elasticsearch-projects',
    description: 'Reset the project credentials',
    method: 'POST',
    path: '/api/v1/serverless/projects/elasticsearch/{id}/_reset-credentials',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resume-elasticsearch-project',
    namespace: 'elasticsearch-projects',
    description: 'Resume Elasticsearch project',
    method: 'POST',
    path: '/api/v1/serverless/projects/elasticsearch/{id}/_resume',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-elasticsearch-project-roles',
    namespace: 'elasticsearch-projects',
    description: 'Get roles for an Elasticsearch project',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch/{id}/roles',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-elasticsearch-project-status',
    namespace: 'elasticsearch-projects',
    description: 'Get the status of an Elasticsearch project',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch/{id}/status',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },

  // ── observability-projects ───────────────────────────────────────────────
  {
    name: 'list-observability-projects',
    namespace: 'observability-projects',
    description: 'Get Observability projects',
    method: 'GET',
    path: '/api/v1/serverless/projects/observability',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        traffic_filter: { type: 'string', description: 'Traffic filters associated with this project', 'x-found-in': 'query' },
        linked: { type: 'string', description: 'Contains a project ID. If specified, the result will be filtered to only those origin projects that are linked to the specified project ID in a cross-project search configuration.', 'x-found-in': 'query' },
        tags: { type: 'string', description: 'If specified, the result will be filtered to only those projects that have the specified tags and corresponding values.', 'x-found-in': 'query' },
      },
    },
  },
  {
    name: 'create-observability-project',
    namespace: 'observability-projects',
    description: 'Create an observability project',
    method: 'POST',
    path: '/api/v1/serverless/projects/observability',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Descriptive name for a project.', 'x-found-in': 'body' },
        region_id: { type: 'string', description: 'Unique human-readable identifier for a region in Elastic Cloud.', 'x-found-in': 'body' },
      },
      required: ['name', 'region_id'],
    },
  },
  {
    name: 'get-observability-project',
    namespace: 'observability-projects',
    description: 'Get an Observability project',
    method: 'GET',
    path: '/api/v1/serverless/projects/observability/{id}',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete-observability-project',
    namespace: 'observability-projects',
    description: 'Delete an Observability project',
    method: 'DELETE',
    path: '/api/v1/serverless/projects/observability/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'patch-observability-project',
    namespace: 'observability-projects',
    description: 'Update an Observability project',
    method: 'PATCH',
    path: '/api/v1/serverless/projects/observability/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'reset-observability-project-credentials',
    namespace: 'observability-projects',
    description: 'Reset the project credentials',
    method: 'POST',
    path: '/api/v1/serverless/projects/observability/{id}/_reset-credentials',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resume-observability-project',
    namespace: 'observability-projects',
    description: 'Resume Observability project',
    method: 'POST',
    path: '/api/v1/serverless/projects/observability/{id}/_resume',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-observability-project-roles',
    namespace: 'observability-projects',
    description: 'Get roles for an Observability project',
    method: 'GET',
    path: '/api/v1/serverless/projects/observability/{id}/roles',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-observability-project-status',
    namespace: 'observability-projects',
    description: 'Get the status of an Observability project',
    method: 'GET',
    path: '/api/v1/serverless/projects/observability/{id}/status',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },

  // ── security-projects ────────────────────────────────────────────────────
  {
    name: 'list-security-projects',
    namespace: 'security-projects',
    description: 'Get Security projects',
    method: 'GET',
    path: '/api/v1/serverless/projects/security',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        traffic_filter: { type: 'string', description: 'Traffic filters associated with this project', 'x-found-in': 'query' },
        linked: { type: 'string', description: 'Contains a project ID. If specified, the result will be filtered to only those origin projects that are linked to the specified project ID in a cross-project search configuration.', 'x-found-in': 'query' },
        tags: { type: 'string', description: 'If specified, the result will be filtered to only those projects that have the specified tags and corresponding values.', 'x-found-in': 'query' },
      },
    },
  },
  {
    name: 'create-security-project',
    namespace: 'security-projects',
    description: 'Create a security project',
    method: 'POST',
    path: '/api/v1/serverless/projects/security',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Descriptive name for a project.', 'x-found-in': 'body' },
        region_id: { type: 'string', description: 'Unique human-readable identifier for a region in Elastic Cloud.', 'x-found-in': 'body' },
      },
      required: ['name', 'region_id'],
    },
  },
  {
    name: 'get-security-project',
    namespace: 'security-projects',
    description: 'Get a Security project',
    method: 'GET',
    path: '/api/v1/serverless/projects/security/{id}',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete-security-project',
    namespace: 'security-projects',
    description: 'Delete a Security project',
    method: 'DELETE',
    path: '/api/v1/serverless/projects/security/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'patch-security-project',
    namespace: 'security-projects',
    description: 'Update a Security project',
    method: 'PATCH',
    path: '/api/v1/serverless/projects/security/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'reset-security-project-credentials',
    namespace: 'security-projects',
    description: 'Reset the project credentials',
    method: 'POST',
    path: '/api/v1/serverless/projects/security/{id}/_reset-credentials',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resume-security-project',
    namespace: 'security-projects',
    description: 'Resume Security project',
    method: 'POST',
    path: '/api/v1/serverless/projects/security/{id}/_resume',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-security-project-roles',
    namespace: 'security-projects',
    description: 'Get roles for a Security project',
    method: 'GET',
    path: '/api/v1/serverless/projects/security/{id}/roles',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-security-project-status',
    namespace: 'security-projects',
    description: 'Get the status of a Security project',
    method: 'GET',
    path: '/api/v1/serverless/projects/security/{id}/status',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },

  // ── regions ──────────────────────────────────────────────────────────────
  {
    name: 'list-regions',
    namespace: 'regions',
    description: 'Get regions',
    method: 'GET',
    path: '/api/v1/serverless/regions',
    destructive: false,
  },
  {
    name: 'get-region',
    namespace: 'regions',
    description: 'Get a region',
    method: 'GET',
    path: '/api/v1/serverless/regions/{id}',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the region', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },

  // ── traffic-filters ──────────────────────────────────────────────────────
  {
    name: 'list-traffic-filters',
    namespace: 'traffic-filters',
    description: 'List traffic filters',
    method: 'GET',
    path: '/api/v1/serverless/traffic-filters',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        include_by_default: { type: 'boolean', description: 'Retrieves a list of resources that have include_by_default set or not set', 'x-found-in': 'query' },
        region: { type: 'string', description: 'If provided limits the traffic filters to that region only.', 'x-found-in': 'query' },
      },
    },
  },
  {
    name: 'create-traffic-filter',
    namespace: 'traffic-filters',
    description: 'Create a traffic filter',
    method: 'POST',
    path: '/api/v1/serverless/traffic-filters',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the traffic filter', 'x-found-in': 'body' },
        type: { type: 'string', description: 'Type of the traffic filter', 'x-found-in': 'body' },
        region: { type: 'string', description: 'The traffic filter can be attached only to projects in the specific region', 'x-found-in': 'body' },
      },
      required: ['name', 'type', 'region'],
    },
  },
  {
    name: 'get-traffic-filter-metadata',
    namespace: 'traffic-filters',
    description: 'List PrivateLink region metadata',
    method: 'GET',
    path: '/api/v1/serverless/traffic-filters/metadata',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'Filter metadata to a specific region (e.g. aws-eu-west-1, azure-australiaeast).', 'x-found-in': 'query' },
        csp: { type: 'string', description: 'Filter metadata to a specific cloud service provider (aws, azure, gcp).', 'x-found-in': 'query' },
      },
    },
  },
  {
    name: 'get-traffic-filter',
    namespace: 'traffic-filters',
    description: 'Retrieves the traffic filter by ID.',
    method: 'GET',
    path: '/api/v1/serverless/traffic-filters/{id}',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The traffic filter ID.', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete-traffic-filter',
    namespace: 'traffic-filters',
    description: 'Delete a traffic filter',
    method: 'DELETE',
    path: '/api/v1/serverless/traffic-filters/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The traffic filter ID.', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'patch-traffic-filter',
    namespace: 'traffic-filters',
    description: 'Updates a traffic filter',
    method: 'PATCH',
    path: '/api/v1/serverless/traffic-filters/{id}',
    destructive: true,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The traffic filter ID.', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },

  // ── linked-projects ──────────────────────────────────────────────────────
  {
    name: 'get-elasticsearch-project-can-delete',
    namespace: 'linked-projects',
    description: 'Get Elasticsearch project delete status',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch/{id}/_can-delete',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-observability-project-can-delete',
    namespace: 'linked-projects',
    description: 'Get Observability project delete status',
    method: 'GET',
    path: '/api/v1/serverless/projects/observability/{id}/_can-delete',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-security-project-can-delete',
    namespace: 'linked-projects',
    description: 'Get Security project delete status',
    method: 'GET',
    path: '/api/v1/serverless/projects/security/{id}/_can-delete',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
      },
      required: ['id'],
    },
  },

  // ── linked-candidate-projects ────────────────────────────────────────────
  {
    name: 'get-elasticsearch-project-link-candidates',
    namespace: 'linked-candidate-projects',
    description: 'Get Elasticsearch project link candidates',
    method: 'GET',
    path: '/api/v1/serverless/projects/elasticsearch/{id}/link-candidates',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
        types: { type: 'string', description: 'One or more types of projects to return as link candidates.', 'x-found-in': 'query' },
        csp: { type: 'string', description: 'The Cloud Service Provider to filter the link candidate projects by.', 'x-found-in': 'query' },
        region: { type: 'string', description: 'The region to filter the link candidate projects by.', 'x-found-in': 'query' },
        name: { type: 'string', description: 'The project name to filter the link candidates by.', 'x-found-in': 'query' },
        alias: { type: 'string', description: 'The project alias to filter the link candidates by.', 'x-found-in': 'query' },
        tags: { type: 'string', description: 'If specified, the result will be filtered to only those projects that have the specified tags and corresponding values.', 'x-found-in': 'query' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-observability-project-link-candidates',
    namespace: 'linked-candidate-projects',
    description: 'Get Observability project link candidates',
    method: 'GET',
    path: '/api/v1/serverless/projects/observability/{id}/link-candidates',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
        types: { type: 'string', description: 'One or more types of projects to return as link candidates.', 'x-found-in': 'query' },
        csp: { type: 'string', description: 'The Cloud Service Provider to filter the link candidate projects by.', 'x-found-in': 'query' },
        region: { type: 'string', description: 'The region to filter the link candidate projects by.', 'x-found-in': 'query' },
        name: { type: 'string', description: 'The project name to filter the link candidates by.', 'x-found-in': 'query' },
        alias: { type: 'string', description: 'The project alias to filter the link candidates by.', 'x-found-in': 'query' },
        tags: { type: 'string', description: 'If specified, the result will be filtered to only those projects that have the specified tags and corresponding values.', 'x-found-in': 'query' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get-security-project-link-candidates',
    namespace: 'linked-candidate-projects',
    description: 'Get Security project link candidates',
    method: 'GET',
    path: '/api/v1/serverless/projects/security/{id}/link-candidates',
    destructive: false,
    input: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the project', 'x-found-in': 'path' },
        types: { type: 'string', description: 'One or more types of projects to return as link candidates.', 'x-found-in': 'query' },
        csp: { type: 'string', description: 'The Cloud Service Provider to filter the link candidate projects by.', 'x-found-in': 'query' },
        region: { type: 'string', description: 'The region to filter the link candidate projects by.', 'x-found-in': 'query' },
        name: { type: 'string', description: 'The project name to filter the link candidates by.', 'x-found-in': 'query' },
        alias: { type: 'string', description: 'The project alias to filter the link candidates by.', 'x-found-in': 'query' },
        tags: { type: 'string', description: 'If specified, the result will be filtered to only those projects that have the specified tags and corresponding values.', 'x-found-in': 'query' },
      },
      required: ['id'],
    },
  },
]
