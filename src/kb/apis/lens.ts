/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { KbApiDefinition } from '../types.ts'

/**
 * Kibana Lens visualization commands.
 *
 * Uses the Kibana Saved Objects API (`/api/saved_objects`) to provide CRUD
 * operations on Lens visualizations. Kibana Lens objects have type `"lens"`.
 *
 * @see https://www.elastic.co/docs/api/doc/kibana/operation/operation-getsobjecttype
 */
export const lensApis: KbApiDefinition[] = [
  {
    name: 'list',
    namespace: 'lens',
    description: 'List Lens visualizations.',
    method: 'GET',
    path: '/api/saved_objects/_find',
    input: z.object({
      type: z.string()
        .default('lens')
        .meta({ description: 'Saved object type to filter by (default: lens)', found_in: 'query' }),
      search: z.string()
        .optional()
        .meta({ description: 'Text to search for in Lens visualization titles', found_in: 'query' }),
      page: z.number()
        .int()
        .optional()
        .meta({ description: 'Page number (default: 1)', found_in: 'query' }),
      per_page: z.number()
        .int()
        .optional()
        .meta({ description: 'Number of results per page (default: 20)', found_in: 'query' }),
    }),
  },

  {
    name: 'get',
    namespace: 'lens',
    description: 'Get a Lens visualization by ID.',
    method: 'GET',
    path: '/api/saved_objects/lens/{id}',
    input: z.object({
      id: z.string()
        .meta({ description: 'Lens visualization ID', found_in: 'path' }),
    }),
  },

  {
    name: 'create',
    namespace: 'lens',
    description: 'Create a Lens visualization.',
    method: 'POST',
    path: '/api/saved_objects/lens',
    input: z.looseObject({
      attributes: z.record(z.string(), z.unknown())
        .meta({ description: 'Lens visualization attributes (see `elastic kb lens schema`)', found_in: 'body' }),
    }),
  },

  {
    name: 'delete',
    namespace: 'lens',
    description: 'Delete a Lens visualization by ID.',
    method: 'DELETE',
    path: '/api/saved_objects/lens/{id}',
    input: z.object({
      id: z.string()
        .meta({ description: 'Lens visualization ID', found_in: 'path' }),
    }),
  },
]
