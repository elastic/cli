/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { EsApiDefinition } from '../types.ts'

// shared query param fields that appear on nearly every cat API
// note: `format` is intentionally omitted — it collides with the reserved --format CLI flag;
// users can supply it via --file/stdin with z.looseObject() passthrough if needed
const v = z.boolean().optional().describe('Include column headings in the output').meta({ found_in: 'query' })
const h = z.string().optional().describe('Comma-separated list of column names to display').meta({ found_in: 'query' })
const s = z.string().optional().describe('Comma-separated list of column names used to sort').meta({ found_in: 'query' })
const catCommon = { v, h, s }

const bytes = z.string().optional().describe('Unit used to display byte values').meta({ found_in: 'query' })
const expand_wildcards = z.string().optional().describe('Type of index that wildcard patterns can match').meta({ found_in: 'query' })

/** builds an optional path param field */
const pathParam = (description: string) =>
  z.string().optional().describe(description).meta({ found_in: 'path' })

export const catApis: EsApiDefinition[] = [
  {
    name: 'aliases',
    namespace: 'cat',
    description: "Returns the cluster's index aliases",
    method: 'GET',
    path: '/_cat/aliases/{name}',
    input: z.looseObject({
      name: pathParam('Comma-separated list of alias names'),
      ...catCommon,
      expand_wildcards,
    }),
    responseType: 'text',
  },
  {
    name: 'allocation',
    namespace: 'cat',
    description: 'Provides a snapshot of the number of shards allocated to each data node',
    method: 'GET',
    path: '/_cat/allocation/{node_id}',
    input: z.looseObject({
      node_id: pathParam('Comma-separated list of node IDs or names'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'component-templates',
    namespace: 'cat',
    description: 'Returns information about component templates',
    method: 'GET',
    path: '/_cat/component_templates/{name}',
    input: z.looseObject({
      name: pathParam('Comma-separated list of component template names'),
      ...catCommon,
    }),
    responseType: 'text',
  },
  {
    name: 'count',
    namespace: 'cat',
    description: 'Provides quick access to the document count of the entire cluster or an individual index',
    method: 'GET',
    path: '/_cat/count/{index}',
    input: z.looseObject({
      index: pathParam('Comma-separated list of indices'),
      ...catCommon,
    }),
    responseType: 'text',
  },
  {
    name: 'fielddata',
    namespace: 'cat',
    description: 'Reports the amount of heap memory currently used by the field data cache',
    method: 'GET',
    path: '/_cat/fielddata/{fields}',
    input: z.looseObject({
      fields: pathParam('Comma-separated list of fields used to limit returned information'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'health',
    namespace: 'cat',
    description: 'Returns the health status of the cluster',
    method: 'GET',
    path: '/_cat/health',
    input: z.looseObject({
      ...catCommon,
      ts: z.boolean().optional().describe('Return local time and date instead of epoch').meta({ found_in: 'query' }),
    }),
    responseType: 'text',
  },
  {
    name: 'indices',
    namespace: 'cat',
    description: 'Returns high-level information about indices in a cluster',
    method: 'GET',
    path: '/_cat/indices/{index}',
    input: z.looseObject({
      index: pathParam('Comma-separated list of indices'),
      ...catCommon,
      health: z.string().optional().describe('Filter by health status (green, yellow, red)').meta({ found_in: 'query' }),
      pri: z.boolean().optional().describe('Show primary shards only').meta({ found_in: 'query' }),
      bytes,
      expand_wildcards,
    }),
    responseType: 'text',
  },
  {
    name: 'master',
    namespace: 'cat',
    description: 'Returns information about the master node',
    method: 'GET',
    path: '/_cat/master',
    input: z.looseObject({ ...catCommon }),
    responseType: 'text',
  },
  {
    name: 'ml-data-frame-analytics',
    namespace: 'cat',
    description: 'Returns configuration and usage information about data frame analytics jobs',
    method: 'GET',
    path: '/_cat/ml/data_frame/analytics/{id}',
    input: z.looseObject({
      id: pathParam('The ID of the data frame analytics to fetch'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'ml-datafeeds',
    namespace: 'cat',
    description: 'Returns configuration and usage information about datafeeds',
    method: 'GET',
    path: '/_cat/ml/datafeeds/{datafeed_id}',
    input: z.looseObject({
      datafeed_id: pathParam('The ID of the datafeed to fetch'),
      ...catCommon,
    }),
    responseType: 'text',
  },
  {
    name: 'ml-jobs',
    namespace: 'cat',
    description: 'Returns configuration and usage information about anomaly detection jobs',
    method: 'GET',
    path: '/_cat/ml/anomaly_detectors/{job_id}',
    input: z.looseObject({
      job_id: pathParam('The ID of the anomaly detection job to fetch'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'ml-trained-models',
    namespace: 'cat',
    description: 'Returns configuration and usage information about trained models',
    method: 'GET',
    path: '/_cat/ml/trained_models/{model_id}',
    input: z.looseObject({
      model_id: pathParam('The ID of the trained model to fetch'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'nodeattrs',
    namespace: 'cat',
    description: 'Returns information about custom node attributes',
    method: 'GET',
    path: '/_cat/nodeattrs',
    input: z.looseObject({ ...catCommon }),
    responseType: 'text',
  },
  {
    name: 'nodes',
    namespace: 'cat',
    description: 'Returns information about the nodes in a cluster',
    method: 'GET',
    path: '/_cat/nodes',
    input: z.looseObject({
      ...catCommon,
      full_id: z.boolean().optional().describe('Return the full node ID').meta({ found_in: 'query' }),
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'pending-tasks',
    namespace: 'cat',
    description: 'Returns cluster-level changes that have not yet been executed',
    method: 'GET',
    path: '/_cat/pending_tasks',
    input: z.looseObject({ ...catCommon }),
    responseType: 'text',
  },
  {
    name: 'plugins',
    namespace: 'cat',
    description: 'Returns a list of installed plugins for each node',
    method: 'GET',
    path: '/_cat/plugins',
    input: z.looseObject({ ...catCommon }),
    responseType: 'text',
  },
  {
    name: 'recovery',
    namespace: 'cat',
    description: 'Returns information about index shard recoveries',
    method: 'GET',
    path: '/_cat/recovery/{index}',
    input: z.looseObject({
      index: pathParam('Comma-separated list of indices'),
      ...catCommon,
      bytes,
      active_only: z.boolean().optional().describe('If true, only recoveries that are currently on-going').meta({ found_in: 'query' }),
      detailed: z.boolean().optional().describe('If true, includes detailed information about shard recoveries').meta({ found_in: 'query' }),
    }),
    responseType: 'text',
  },
  {
    name: 'repositories',
    namespace: 'cat',
    description: 'Returns the snapshot repositories for the cluster',
    method: 'GET',
    path: '/_cat/repositories',
    input: z.looseObject({ ...catCommon }),
    responseType: 'text',
  },
  {
    name: 'segments',
    namespace: 'cat',
    description: 'Returns low-level information about the Lucene segments in index shards',
    method: 'GET',
    path: '/_cat/segments/{index}',
    input: z.looseObject({
      index: pathParam('Comma-separated list of indices'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'shards',
    namespace: 'cat',
    description: 'Provides a detailed view of shard allocation across nodes',
    method: 'GET',
    path: '/_cat/shards/{index}',
    input: z.looseObject({
      index: pathParam('Comma-separated list of indices'),
      ...catCommon,
      bytes,
    }),
    responseType: 'text',
  },
  {
    name: 'snapshots',
    namespace: 'cat',
    description: 'Returns all snapshots in a specific repository',
    method: 'GET',
    path: '/_cat/snapshots/{repository}',
    input: z.looseObject({
      repository: pathParam('Name of the snapshot repository'),
      ...catCommon,
      ignore_unavailable: z.boolean().optional().describe('If true, missing or closed indices are not included in the response').meta({ found_in: 'query' }),
    }),
    responseType: 'text',
  },
  {
    name: 'tasks',
    namespace: 'cat',
    description: 'Returns information about tasks currently executing in the cluster',
    method: 'GET',
    path: '/_cat/tasks',
    input: z.looseObject({
      ...catCommon,
      nodes: z.string().optional().describe('Comma-separated list of node IDs or names to limit the returned information').meta({ found_in: 'query' }),
      actions: z.string().optional().describe('Comma-separated list of actions to filter tasks').meta({ found_in: 'query' }),
      parent_task_id: z.string().optional().describe('Return tasks with specified parent task id').meta({ found_in: 'query' }),
    }),
    responseType: 'text',
  },
  {
    name: 'templates',
    namespace: 'cat',
    description: 'Returns information about index templates in a cluster',
    method: 'GET',
    path: '/_cat/templates/{name}',
    input: z.looseObject({
      name: pathParam('Comma-separated list of index template names'),
      ...catCommon,
    }),
    responseType: 'text',
  },
  {
    name: 'thread-pool',
    namespace: 'cat',
    description: 'Returns thread pool statistics for each node in a cluster',
    method: 'GET',
    path: '/_cat/thread_pool/{thread_pool_patterns}',
    input: z.looseObject({
      thread_pool_patterns: pathParam('Comma-separated list of thread pool names to limit the response'),
      ...catCommon,
    }),
    responseType: 'text',
  },
  {
    name: 'transforms',
    namespace: 'cat',
    description: 'Returns configuration and usage information about transforms',
    method: 'GET',
    path: '/_cat/transforms/{transform_id}',
    input: z.looseObject({
      transform_id: pathParam('The ID of the transform to get usage information for'),
      ...catCommon,
    }),
    responseType: 'text',
  },
]
