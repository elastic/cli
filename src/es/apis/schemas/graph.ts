/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

 
 
import { z } from 'zod'

import { Duration, Field, Indices, QueryDslQueryContainer, Routing, ShardFailure, double, integer, long } from './_types.ts'
import type { QueryDslQueryContainerShape } from './_types.ts'

export const GraphConnection = z.object({
  doc_count: z.lazy(() => long),
  source: z.lazy(() => long),
  target: z.lazy(() => long),
  weight: z.lazy(() => double)
}).meta({ id: 'GraphConnection' })
export type GraphConnection = z.infer<typeof GraphConnection>

export const GraphSampleDiversity = z.object({
  field: z.lazy(() => Field),
  max_docs_per_value: z.lazy(() => integer)
}).meta({ id: 'GraphSampleDiversity' })
export type GraphSampleDiversity = z.infer<typeof GraphSampleDiversity>

export const GraphExploreControls = z.object({
  sample_diversity: GraphSampleDiversity.describe('To avoid the top-matching documents sample being dominated by a single source of results, it is sometimes necessary to request diversity in the sample. You can do this by selecting a single-value field and setting a maximum number of documents per value for that field.').optional(),
  sample_size: z.lazy(() => integer).describe('Each hop considers a sample of the best-matching documents on each shard. Using samples improves the speed of execution and keeps exploration focused on meaningfully-connected terms. Very small values (less than 50) might not provide sufficient weight-of-evidence to identify significant connections between terms. Very large sample sizes can dilute the quality of the results and increase execution times.').optional(),
  timeout: z.lazy(() => Duration).describe('The length of time in milliseconds after which exploration will be halted and the results gathered so far are returned. This timeout is honored on a best-effort basis. Execution might overrun this timeout if, for example, a long pause is encountered while FieldData is loaded for a field.').optional(),
  use_significance: z.boolean().describe('Filters associated terms so only those that are significantly associated with your query are included.')
}).meta({ id: 'GraphExploreControls' })
export type GraphExploreControls = z.infer<typeof GraphExploreControls>

export const GraphVertexInclude = z.object({
  boost: z.lazy(() => double).optional(),
  term: z.string()
}).meta({ id: 'GraphVertexInclude' })
export type GraphVertexInclude = z.infer<typeof GraphVertexInclude>

export const GraphVertexDefinition = z.object({
  exclude: z.array(z.string()).describe('Prevents the specified terms from being included in the results.').optional(),
  field: z.lazy(() => Field).describe('Identifies a field in the documents of interest.'),
  include: z.array(GraphVertexInclude).describe('Identifies the terms of interest that form the starting points from which you want to spider out.').optional(),
  min_doc_count: z.lazy(() => long).describe('Specifies how many documents must contain a pair of terms before it is considered to be a useful connection. This setting acts as a certainty threshold.').optional(),
  shard_min_doc_count: z.lazy(() => long).describe('Controls how many documents on a particular shard have to contain a pair of terms before the connection is returned for global consideration.').optional(),
  size: z.lazy(() => integer).describe('Specifies the maximum number of vertex terms returned for each field.').optional()
}).meta({ id: 'GraphVertexDefinition' })
export type GraphVertexDefinition = z.infer<typeof GraphVertexDefinition>

export interface GraphHopShape {
  connections?: GraphHopShape | undefined
  query?: QueryDslQueryContainerShape | undefined
  vertices: GraphVertexDefinition[]
}
export const GraphHop = z.object({
  get connections () { return GraphHop.describe('Specifies one or more fields from which you want to extract terms that are associated with the specified vertices.').optional() },
  get query () { return QueryDslQueryContainer.describe('An optional guiding query that constrains the Graph API as it explores connected terms.').optional() },
  vertices: z.array(GraphVertexDefinition).describe('Contains the fields you are interested in.')
}).meta({ id: 'GraphHop' })
export type GraphHop = z.infer<typeof GraphHop>

export const GraphVertex = z.object({
  depth: z.lazy(() => long),
  field: z.lazy(() => Field),
  term: z.string(),
  weight: z.lazy(() => double)
}).meta({ id: 'GraphVertex' })
export type GraphVertex = z.infer<typeof GraphVertex>

/**
 * Explore graph analytics.
 *
 * Extract and summarize information about the documents and terms in an Elasticsearch data stream or index.
 * The easiest way to understand the behavior of this API is to use the Graph UI to explore connections.
 * An initial request to the `_explore` API contains a seed query that identifies the documents of interest and specifies the fields that define the vertices and connections you want to include in the graph.
 * Subsequent requests enable you to spider out from one more vertices of interest.
 * You can exclude vertices that have already been returned.
 */
export const GraphExploreRequest = z.object({
  index: z.lazy(() => Indices).describe('Name of the index.').meta({ found_in: 'path' }),
  routing: z.lazy(() => Routing).describe('Custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('Specifies the period of time to wait for a response from each shard. If no response is received before the timeout expires, the request fails and returns an error. Defaults to no timeout.').optional().meta({ found_in: 'query' }),
  connections: z.lazy(() => GraphHop).describe('Specifies or more fields from which you want to extract terms that are associated with the specified vertices.').optional().meta({ found_in: 'body' }),
  controls: GraphExploreControls.describe('Direct the Graph API how to build the graph.').optional().meta({ found_in: 'body' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('A seed query that identifies the documents of interest. Can be any valid Elasticsearch query.').optional().meta({ found_in: 'body' }),
  vertices: z.array(GraphVertexDefinition).describe('Specifies one or more fields that contain the terms you want to include in the graph as vertices.').optional().meta({ found_in: 'body' })
}).meta({ id: 'GraphExploreRequest' })
export type GraphExploreRequest = z.infer<typeof GraphExploreRequest>

export const GraphExploreResponse = z.object({
  connections: z.array(GraphConnection),
  failures: z.array(z.lazy(() => ShardFailure)),
  timed_out: z.boolean(),
  took: z.lazy(() => long),
  vertices: z.array(GraphVertex)
}).meta({ id: 'GraphExploreResponse' })
export type GraphExploreResponse = z.infer<typeof GraphExploreResponse>
