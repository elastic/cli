/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod'
import type { EsApiDefinition } from '../types.ts'

// shared query param field helpers
const qstr = (desc: string) => z.string().optional().describe(desc).meta({ found_in: 'query' })
const qbool = (desc: string) => z.boolean().optional().describe(desc).meta({ found_in: 'query' })
const qnum = (desc: string) => z.number().optional().describe(desc).meta({ found_in: 'query' })

// body field helpers
const bstr = (desc: string) => z.string().optional().describe(desc).meta({ found_in: 'body' })
const bbool = (desc: string) => z.boolean().optional().describe(desc).meta({ found_in: 'body' })
const bnum = (desc: string) => z.number().optional().describe(desc).meta({ found_in: 'body' })
const brecord = (desc: string) => z.record(z.string(), z.unknown()).optional().describe(desc).meta({ found_in: 'body' })
const barrstr = (desc: string) => z.array(z.string()).optional().describe(desc).meta({ found_in: 'body' })

// path param helpers
const pstr = (desc: string) => z.string().describe(desc).meta({ found_in: 'path' })
const popt = (desc: string) => z.string().optional().describe(desc).meta({ found_in: 'path' })

// shared query param fields
const master_timeout = qstr('Timeout for connection to master node')
const timeout = qstr('Timeout for the request')
const wait_for_active_shards = qstr('Number of active shards to wait for')
const ignore_unavailable = qbool('Ignore unavailable indices')
const allow_no_indices = qbool('Allow request if no matching indices found')
const expand_wildcards = qstr('Type of index that wildcard patterns can match')
const flat_settings = qbool('Return settings in flat format')
const include_defaults = qbool('Include default settings')
const local = qbool('Return local information only')

// shared common filter set for most multi-index operations
const indexFilters = { ignore_unavailable, allow_no_indices, expand_wildcards }

// required index path param
const index_req = pstr('Comma-separated list of indices')
// optional index path param
const index_opt = popt('Comma-separated list of indices')

export const indicesApis: EsApiDefinition[] = [
  {
    name: 'add-block',
    namespace: 'indices',
    description: 'Adds a block to an index',
    method: 'PUT',
    path: '/{index}/_block/{block}',
    input: z.looseObject({
      index: index_req,
      block: pstr('The block type to add (metadata, read, read_only, write)'),
      master_timeout, timeout,
      ...indexFilters,
    }),
    responseType: 'json',
  },
  {
    name: 'analyze',
    namespace: 'indices',
    description: 'Performs analysis on a text string and returns the resulting tokens',
    method: 'POST',
    path: '/{index}/_analyze',
    input: z.looseObject({
      index: popt('Index used to derive the analyzer'),
      analyzer: bstr('The name of the analyzer'),
      text: z.union([z.string(), z.array(z.string())]).optional().describe('Text to analyze').meta({ found_in: 'body' }),
      tokenizer: bstr('The name of the tokenizer to use'),
      filter: barrstr('Array of token filters'),
      char_filter: barrstr('Array of character filters'),
      field: bstr('Field used to derive the analyzer'),
    }),
    responseType: 'json',
  },
  {
    name: 'clear-cache',
    namespace: 'indices',
    description: 'Clears the caches of one or more indices',
    method: 'POST',
    path: '/{index}/_cache/clear',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
      fielddata: qbool('Clear the fielddata cache'),
      fields: qstr('Comma-separated list of fields to clear from the fielddata cache'),
      query: qbool('Clear the query cache'),
      request: qbool('Clear the request cache'),
    }),
    responseType: 'json',
  },
  {
    name: 'clone',
    namespace: 'indices',
    description: 'Clones an existing index',
    method: 'PUT',
    path: '/{index}/_clone/{target}',
    input: z.looseObject({
      index: pstr('Name of the source index'),
      target: pstr('Name of the target index'),
      master_timeout, timeout, wait_for_active_shards,
      settings: brecord('Index settings for the target index'),
      aliases: brecord('Aliases for the target index'),
    }),
    responseType: 'json',
  },
  {
    name: 'close',
    namespace: 'indices',
    description: 'Closes an index',
    method: 'POST',
    path: '/{index}/_close',
    input: z.looseObject({
      index: index_req,
      master_timeout, timeout, wait_for_active_shards,
      ...indexFilters,
    }),
    responseType: 'json',
  },
  {
    name: 'create',
    namespace: 'indices',
    description: 'Creates a new index',
    method: 'PUT',
    path: '/{index}',
    input: z.looseObject({
      index: index_req,
      wait_for_active_shards, master_timeout, timeout,
      settings: brecord('Index settings'),
      mappings: brecord('Index mappings'),
      aliases: brecord('Index aliases'),
    }),
    responseType: 'json',
  },
  {
    name: 'delete',
    namespace: 'indices',
    description: 'Deletes one or more indices',
    method: 'DELETE',
    path: '/{index}',
    input: z.looseObject({
      index: index_req,
      master_timeout, timeout,
      ...indexFilters,
    }),
    responseType: 'json',
  },
  {
    name: 'delete-alias',
    namespace: 'indices',
    description: 'Deletes an alias',
    method: 'DELETE',
    path: '/{index}/_alias/{name}',
    input: z.looseObject({
      index: index_req,
      name: pstr('Comma-separated list of aliases to delete'),
      master_timeout, timeout,
    }),
    responseType: 'json',
  },
  {
    name: 'delete-index-template',
    namespace: 'indices',
    description: 'Deletes an index template',
    method: 'DELETE',
    path: '/_index_template/{name}',
    input: z.looseObject({
      name: pstr('Comma-separated list of index template names'),
      master_timeout, timeout,
    }),
    responseType: 'json',
  },
  {
    name: 'delete-template',
    namespace: 'indices',
    description: 'Deletes a legacy index template',
    method: 'DELETE',
    path: '/_template/{name}',
    input: z.looseObject({
      name: pstr('Name of the legacy index template to delete'),
      master_timeout, timeout,
    }),
    responseType: 'json',
  },
  {
    name: 'exists',
    namespace: 'indices',
    description: 'Returns whether one or more indices exist',
    method: 'HEAD',
    path: '/{index}',
    input: z.looseObject({
      index: index_req,
      ...indexFilters,
      flat_settings, include_defaults,
    }),
    responseType: 'json',
  },
  {
    name: 'flush',
    namespace: 'indices',
    description: 'Flushes one or more indices',
    method: 'POST',
    path: '/{index}/_flush',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
      force: qbool('Force a flush even if it is not necessary'),
      wait_if_ongoing: qbool('Block until the flush succeeds if another flush is running'),
    }),
    responseType: 'json',
  },
  {
    name: 'forcemerge',
    namespace: 'indices',
    description: 'Forces a merge on the shards of one or more indices',
    method: 'POST',
    path: '/{index}/_forcemerge',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
      max_num_segments: qnum('Maximum number of segments to merge to'),
      only_expunge_deletes: qbool('Expunge deleted documents only'),
      flush: qbool('Flush each index after performing the force merge'),
    }),
    responseType: 'json',
  },
  {
    name: 'get',
    namespace: 'indices',
    description: 'Returns information about one or more indices',
    method: 'GET',
    path: '/{index}',
    input: z.looseObject({
      index: index_req,
      master_timeout,
      ...indexFilters,
      flat_settings, include_defaults,
    }),
    responseType: 'json',
  },
  {
    name: 'get-alias',
    namespace: 'indices',
    description: 'Returns information about one or more aliases',
    method: 'GET',
    path: '/{index}/_alias/{name}',
    input: z.looseObject({
      index: index_opt,
      name: popt('Comma-separated list of aliases'),
      ...indexFilters,
    }),
    responseType: 'json',
  },
  {
    name: 'get-index-template',
    namespace: 'indices',
    description: 'Returns information about one or more index templates',
    method: 'GET',
    path: '/_index_template/{name}',
    input: z.looseObject({
      name: popt('Comma-separated list of index template names'),
      master_timeout, flat_settings, local,
    }),
    responseType: 'json',
  },
  {
    name: 'get-mapping',
    namespace: 'indices',
    description: 'Returns mapping definitions for one or more indices',
    method: 'GET',
    path: '/{index}/_mapping',
    input: z.looseObject({
      index: index_opt,
      master_timeout,
      ...indexFilters,
      local,
    }),
    responseType: 'json',
  },
  {
    name: 'get-settings',
    namespace: 'indices',
    description: 'Returns setting information for one or more indices',
    method: 'GET',
    path: '/{index}/_settings/{name}',
    input: z.looseObject({
      index: index_opt,
      name: popt('Comma-separated list of settings to retrieve'),
      master_timeout,
      ...indexFilters,
      flat_settings, include_defaults, local,
    }),
    responseType: 'json',
  },
  {
    name: 'get-template',
    namespace: 'indices',
    description: 'Returns information about one or more legacy index templates',
    method: 'GET',
    path: '/_template/{name}',
    input: z.looseObject({
      name: popt('Comma-separated list of index template names'),
      master_timeout, flat_settings, local,
    }),
    responseType: 'json',
  },
  {
    name: 'open',
    namespace: 'indices',
    description: 'Opens a closed index',
    method: 'POST',
    path: '/{index}/_open',
    input: z.looseObject({
      index: index_req,
      master_timeout, timeout, wait_for_active_shards,
      ...indexFilters,
    }),
    responseType: 'json',
  },
  {
    name: 'put-alias',
    namespace: 'indices',
    description: 'Creates or updates an alias',
    method: 'PUT',
    path: '/{index}/_alias/{name}',
    input: z.looseObject({
      index: index_req,
      name: pstr('Name of the alias'),
      master_timeout, timeout,
      filter: brecord('Query used to filter documents the alias applies to'),
      index_routing: bstr('Value used to route indexing operations to a specific shard'),
      is_write_index: bbool('If true, sets the write index or data stream for the alias'),
      routing: bstr('Value used to route indexing and search operations to a specific shard'),
      search_routing: bstr('Value used to route search operations to a specific shard'),
    }),
    responseType: 'json',
  },
  {
    name: 'put-index-template',
    namespace: 'indices',
    description: 'Creates or updates an index template',
    method: 'PUT',
    path: '/_index_template/{name}',
    // note: _meta excluded from input — provide via --file/stdin with looseObject passthrough
    input: z.looseObject({
      name: pstr('Name of the index template'),
      master_timeout,
      index_patterns: barrstr('Array of wildcard expressions to match index names'),
      composed_of: barrstr('Array of component template names'),
      priority: bnum('Priority to determine index template precedence'),
      template: brecord('Template to be applied'),
    }),
    responseType: 'json',
  },
  {
    name: 'put-mapping',
    namespace: 'indices',
    description: 'Adds new fields to an existing index or changes the search settings of existing fields',
    method: 'PUT',
    path: '/{index}/_mapping',
    // note: _meta excluded from input — provide via --file/stdin with looseObject passthrough
    input: z.looseObject({
      index: index_req,
      master_timeout, timeout,
      ...indexFilters,
      write_index_only: qbool('If true, applies mappings only to the write index of an alias or data stream'),
      properties: brecord('Mapping for fields in the index'),
      dynamic: z.union([z.boolean(), z.string()]).optional().describe('Controls whether new fields are added dynamically').meta({ found_in: 'body' }),
    }),
    responseType: 'json',
  },
  {
    name: 'put-settings',
    namespace: 'indices',
    description: 'Changes a dynamic index setting in real time',
    method: 'PUT',
    path: '/{index}/_settings',
    input: z.looseObject({
      index: index_opt,
      master_timeout, timeout,
      ...indexFilters,
      flat_settings,
      preserve_existing: qbool('If true, existing index settings remain unchanged'),
    }),
    responseType: 'json',
  },
  {
    name: 'put-template',
    namespace: 'indices',
    description: 'Creates or updates a legacy index template',
    method: 'PUT',
    path: '/_template/{name}',
    input: z.looseObject({
      name: pstr('Name of the legacy index template'),
      master_timeout, timeout,
      create: qbool('If true, this request cannot replace or update existing index templates'),
      index_patterns: barrstr('Array of wildcard expressions to match index names'),
      settings: brecord('Index settings'),
      mappings: brecord('Mapping for fields in the index'),
      aliases: brecord('Index aliases'),
      order: bnum('Order in which to apply this template if multiple match'),
    }),
    responseType: 'json',
  },
  {
    name: 'recovery',
    namespace: 'indices',
    description: 'Returns information about ongoing and completed shard recoveries for one or more indices',
    method: 'GET',
    path: '/{index}/_recovery',
    input: z.looseObject({
      index: index_opt,
      bytes: qstr('Unit used to display byte values'),
      detailed: qbool('If true, include detailed information about shard recoveries'),
      active_only: qbool('If true, only include ongoing recoveries'),
    }),
    responseType: 'json',
  },
  {
    name: 'refresh',
    namespace: 'indices',
    description: 'Refreshes one or more indices',
    method: 'POST',
    path: '/{index}/_refresh',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
    }),
    responseType: 'json',
  },
  {
    name: 'resolve-index',
    namespace: 'indices',
    description: 'Returns information about any matching indices, aliases, and data streams',
    method: 'GET',
    path: '/_resolve/index/{name}',
    input: z.looseObject({
      name: pstr('Comma-separated list of names or wildcard expressions'),
      expand_wildcards,
    }),
    responseType: 'json',
  },
  {
    name: 'rollover',
    namespace: 'indices',
    description: 'Creates a new index for a data stream or index alias',
    method: 'POST',
    path: '/{alias}/_rollover/{new_index}',
    input: z.looseObject({
      alias: pstr('Name of the data stream or index alias'),
      new_index: popt('Name of the new index to create'),
      master_timeout, timeout, wait_for_active_shards,
      dry_run: qbool('If true, checks whether the current index satisfies the rollover conditions without performing a rollover'),
      conditions: brecord('Conditions for the rollover'),
      mappings: brecord('Mapping for fields in the new index'),
      settings: brecord('Configuration options for the new index'),
      aliases: brecord('Aliases for the new index'),
    }),
    responseType: 'json',
  },
  {
    name: 'segments',
    namespace: 'indices',
    description: 'Returns low-level information about the Lucene segments in index shards',
    method: 'GET',
    path: '/{index}/_segments',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
      verbose: qbool('If true, the request returns a verbose response'),
    }),
    responseType: 'json',
  },
  {
    name: 'shard-stores',
    namespace: 'indices',
    description: 'Retrieves store information about replica shards in one or more indices',
    method: 'GET',
    path: '/{index}/_shard_stores',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
      status: qstr('List of shard health statuses used to limit the request (green, yellow, red, all)'),
    }),
    responseType: 'json',
  },
  {
    name: 'shrink',
    namespace: 'indices',
    description: 'Shrinks an existing index into a new index with fewer primary shards',
    method: 'PUT',
    path: '/{index}/_shrink/{target}',
    input: z.looseObject({
      index: pstr('Name of the source index'),
      target: pstr('Name of the target index'),
      master_timeout, timeout, wait_for_active_shards,
      settings: brecord('Index settings for the target index'),
      aliases: brecord('Aliases for the target index'),
    }),
    responseType: 'json',
  },
  {
    name: 'simulate-index-template',
    namespace: 'indices',
    description: 'Simulates the index settings, mappings, and aliases that would be applied to the specified index name by the existing index templates',
    method: 'POST',
    path: '/_index_template/_simulate_index/{name}',
    input: z.looseObject({
      name: pstr('Name of the index to simulate'),
      master_timeout,
    }),
    responseType: 'json',
  },
  {
    name: 'simulate-template',
    namespace: 'indices',
    description: 'Simulates resolving the given template name or definition',
    method: 'POST',
    path: '/_index_template/_simulate/{name}',
    // note: _meta excluded from input — provide via --file/stdin with looseObject passthrough
    input: z.looseObject({
      name: popt('Name of the index template to simulate'),
      master_timeout,
      index_patterns: barrstr('Array of wildcard expressions to match index names'),
      composed_of: barrstr('Array of component template names'),
      priority: bnum('Priority to determine template precedence'),
      template: brecord('Template to be applied'),
    }),
    responseType: 'json',
  },
  {
    name: 'split',
    namespace: 'indices',
    description: 'Splits an existing index into a new index with more primary shards',
    method: 'PUT',
    path: '/{index}/_split/{target}',
    input: z.looseObject({
      index: pstr('Name of the source index'),
      target: pstr('Name of the target index'),
      master_timeout, timeout, wait_for_active_shards,
      settings: brecord('Index settings for the target index'),
      aliases: brecord('Aliases for the target index'),
    }),
    responseType: 'json',
  },
  {
    name: 'stats',
    namespace: 'indices',
    description: 'Returns statistics for one or more indices',
    method: 'GET',
    path: '/{index}/_stats/{metric}',
    input: z.looseObject({
      index: index_opt,
      metric: popt('Comma-separated list of stats to retrieve'),
      ...indexFilters,
      completion_fields: qstr('Comma-separated list of fields for fielddata and suggest index metric'),
      fielddata_fields: qstr('Comma-separated list of fields for fielddata index metric'),
      fields: qstr('Comma-separated list of fields for fielddata and completion index metrics'),
      level: qstr('Indicates whether statistics are aggregated at the cluster, index, or shard level'),
      include_segment_file_sizes: qbool('If true, the call reports the aggregated disk usage of each one of the Lucene index files'),
    }),
    responseType: 'json',
  },
  {
    name: 'validate-query',
    namespace: 'indices',
    description: 'Validates a potentially expensive query without executing it',
    method: 'POST',
    path: '/{index}/_validate/query',
    input: z.looseObject({
      index: index_opt,
      ...indexFilters,
      explain: qbool('If true, the response returns detailed information if an error has occurred'),
      rewrite: qbool('If true, returns a more detailed explanation showing the actual Lucene query that will be executed'),
      all_shards: qbool('If true, the validation is executed on all shards vs one random shard per index'),
      query: brecord('Query to validate'),
    }),
    responseType: 'json',
  },
]
