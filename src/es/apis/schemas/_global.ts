/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

 
 
import { z } from 'zod'

import { AcknowledgedResponseBase, AggregateName, AggregationsAggregate, AggregationsAggregationContainer, BulkIndexByScrollFailure, ClusterStatistics, Conflicts, Duration, DurationValue, ElasticsearchVersionInfo, EpochTime, ErrorCause, ErrorResponseBase, ExpandWildcards, Field, Fields, Fuzziness, GeoHashPrecision, GeoLocation, Host, HttpHeaders, Id, Ids, IndexName, Indices, InlineGet, Ip, KnnSearch, LifecycleOperationMode, MapboxVectorTiles, MappingRuntimeFields, MappingTimeSeriesMetricType, Metadata, Name, NodeId, NodeName, NodeRoles, NodeShard, NodeStatistics, OpType, Password, ProjectRouting, QueryDslFieldAndFormat, QueryDslOperator, QueryDslQueryContainer, QueryVector, Refresh, ReindexStatus, Result, Retries, RetrieverContainer, Routing, Script, ScriptField, ScriptLanguage, ScriptSource, ScrollId, ScrollIds, SearchType, SequenceNumber, ShardStatistics, SlicedScroll, Slices, Sort, SortResults, StoredScript, SuggestMode, SuggestionName, TaskFailure, TaskId, TransportAddress, Username, Uuid, VersionNumber, VersionString, VersionType, WaitForActiveShards, WriteResponseBase, double, float, integer, long } from './_types.ts'
import type { AggregationsAggregationContainerShape, KnnSearchShape, MappingRuntimeFieldsShape, QueryDslQueryContainerShape, RetrieverContainerShape, ScriptFieldShape, ScriptShape, SortShape } from './_types.ts'
import { TasksTaskInfo, TasksTaskListResponseBase } from './tasks.ts'

export const BulkOperationBase = z.object({
  _id: z.lazy(() => Id).describe('The document ID.').optional(),
  _index: z.lazy(() => IndexName).describe('The name of the index or index alias to perform the action on.').optional(),
  routing: z.string().describe('A custom value used to route operations to a specific shard, or multiple comma separated values.').optional(),
  if_primary_term: z.lazy(() => long).optional(),
  if_seq_no: z.lazy(() => SequenceNumber).optional(),
  version: z.lazy(() => VersionNumber).optional(),
  version_type: z.lazy(() => VersionType).optional()
}).meta({ id: 'BulkOperationBase' })
export type BulkOperationBase = z.infer<typeof BulkOperationBase>

export const BulkWriteOperation = z.object({
  ...BulkOperationBase.shape,
  dynamic_templates: z.record(z.string(), z.string()).describe('A map from the full name of fields to the name of dynamic templates. It defaults to an empty map. If a name matches a dynamic template, that template will be applied regardless of other match predicates defined in the template. If a field is already defined in the mapping, then this parameter won\'t be used.').optional(),
  pipeline: z.string().describe('The ID of the pipeline to use to preprocess incoming documents. If the index has a default ingest pipeline specified, setting the value to `_none` turns off the default ingest pipeline for this request. If a final pipeline is configured, it will always run regardless of the value of this parameter.').optional(),
  require_alias: z.boolean().describe('If `true`, the request\'s actions must target an index alias.').optional()
}).meta({ id: 'BulkWriteOperation' })
export type BulkWriteOperation = z.infer<typeof BulkWriteOperation>

export const BulkCreateOperation = z.object({
  ...BulkWriteOperation.shape
}).meta({ id: 'BulkCreateOperation' })
export type BulkCreateOperation = z.infer<typeof BulkCreateOperation>

export const BulkDeleteOperation = z.object({
  ...BulkOperationBase.shape
}).meta({ id: 'BulkDeleteOperation' })
export type BulkDeleteOperation = z.infer<typeof BulkDeleteOperation>

export const BulkFailureStoreStatus = z.enum(['not_applicable_or_unknown', 'used', 'not_enabled', 'failed']).meta({ id: 'BulkFailureStoreStatus' })
export type BulkFailureStoreStatus = z.infer<typeof BulkFailureStoreStatus>

export const BulkIndexOperation = z.object({
  ...BulkWriteOperation.shape
}).meta({ id: 'BulkIndexOperation' })
export type BulkIndexOperation = z.infer<typeof BulkIndexOperation>

export const BulkUpdateOperation = z.object({
  ...BulkOperationBase.shape,
  require_alias: z.boolean().describe('If `true`, the request\'s actions must target an index alias.').optional(),
  retry_on_conflict: z.lazy(() => integer).describe('The number of times an update should be retried in the case of a version conflict.').optional()
}).meta({ id: 'BulkUpdateOperation' })
export type BulkUpdateOperation = z.infer<typeof BulkUpdateOperation>

const BulkOperationContainerExclusiveProps = z.union([z.object({ index: BulkIndexOperation }), z.object({ create: BulkCreateOperation }), z.object({ update: BulkUpdateOperation }), z.object({ delete: BulkDeleteOperation })])

export const BulkOperationContainer = BulkOperationContainerExclusiveProps.meta({ id: 'BulkOperationContainer' })
export type BulkOperationContainer = z.infer<typeof BulkOperationContainer>

export const BulkOperationType = z.enum(['index', 'create', 'update', 'delete']).meta({ id: 'BulkOperationType' })
export type BulkOperationType = z.infer<typeof BulkOperationType>

/**
 * Defines how to fetch a source. Fetching can be disabled entirely, or the source can be filtered.
 * Used as a query parameter along with the `_source_includes` and `_source_excludes` parameters.
 */
export const SearchSourceConfigParam = z.union([z.boolean(), z.lazy(() => Fields)]).meta({ id: 'SearchSourceConfigParam' })
export type SearchSourceConfigParam = z.infer<typeof SearchSourceConfigParam>

export interface SearchFieldCollapseShape {
  field: Field
  inner_hits?: SearchInnerHitsShape | SearchInnerHitsShape[] | undefined
  max_concurrent_group_searches?: integer | undefined
  collapse?: SearchFieldCollapseShape | undefined
}
export const SearchFieldCollapse = z.object({
  field: z.lazy(() => Field).describe('The field to collapse the result set on'),
  get inner_hits (): z.ZodOptional<z.ZodUnion<readonly [typeof SearchInnerHits, z.ZodArray<typeof SearchInnerHits>]>> { return z.union([SearchInnerHits, SearchInnerHits.array()]).describe('The number of inner hits and their sort order').optional() },
  max_concurrent_group_searches: z.lazy(() => integer).describe('The number of concurrent requests allowed to retrieve the inner_hits per group').optional(),
  get collapse () { return SearchFieldCollapse.optional() }
}).meta({ id: 'SearchFieldCollapse' })
export type SearchFieldCollapse = z.infer<typeof SearchFieldCollapse>

export const SearchHighlighterType = z.union([z.enum(['plain', 'fvh', 'unified']), z.string()]).meta({ id: 'SearchHighlighterType' })
export type SearchHighlighterType = z.infer<typeof SearchHighlighterType>

export const SearchBoundaryScanner = z.enum(['chars', 'sentence', 'word']).meta({ id: 'SearchBoundaryScanner' })
export type SearchBoundaryScanner = z.infer<typeof SearchBoundaryScanner>

export const SearchHighlighterFragmenter = z.enum(['simple', 'span']).meta({ id: 'SearchHighlighterFragmenter' })
export type SearchHighlighterFragmenter = z.infer<typeof SearchHighlighterFragmenter>

export const SearchHighlighterOrder = z.enum(['score']).meta({ id: 'SearchHighlighterOrder' })
export type SearchHighlighterOrder = z.infer<typeof SearchHighlighterOrder>

export const SearchHighlighterTagsSchema = z.enum(['styled']).meta({ id: 'SearchHighlighterTagsSchema' })
export type SearchHighlighterTagsSchema = z.infer<typeof SearchHighlighterTagsSchema>

export interface SearchHighlightBaseShape {
  type?: SearchHighlighterType | undefined
  boundary_chars?: string | undefined
  boundary_max_scan?: integer | undefined
  boundary_scanner?: SearchBoundaryScanner | undefined
  boundary_scanner_locale?: string | undefined
  force_source?: boolean | undefined
  fragmenter?: SearchHighlighterFragmenter | undefined
  fragment_size?: integer | undefined
  highlight_filter?: boolean | undefined
  highlight_query?: QueryDslQueryContainerShape | undefined
  max_fragment_length?: integer | undefined
  max_analyzed_offset?: integer | undefined
  no_match_size?: integer | undefined
  number_of_fragments?: integer | undefined
  options?: Record<string, unknown> | undefined
  order?: SearchHighlighterOrder | undefined
  phrase_limit?: integer | undefined
  post_tags?: string[] | undefined
  pre_tags?: string[] | undefined
  require_field_match?: boolean | undefined
  tags_schema?: SearchHighlighterTagsSchema | undefined
}
export const SearchHighlightBase = z.object({
  type: SearchHighlighterType.optional(),
  boundary_chars: z.string().describe('A string that contains each boundary character.').optional(),
  boundary_max_scan: z.lazy(() => integer).describe('How far to scan for boundary characters.').optional(),
  boundary_scanner: SearchBoundaryScanner.describe('Specifies how to break the highlighted fragments: chars, sentence, or word. Only valid for the unified and fvh highlighters. Defaults to `sentence` for the `unified` highlighter. Defaults to `chars` for the `fvh` highlighter.').optional(),
  boundary_scanner_locale: z.string().describe('Controls which locale is used to search for sentence and word boundaries. This parameter takes a form of a language tag, for example: `"en-US"`, `"fr-FR"`, `"ja-JP"`.').optional(),
  force_source: z.boolean().optional(),
  fragmenter: SearchHighlighterFragmenter.describe('Specifies how text should be broken up in highlight snippets: `simple` or `span`. Only valid for the `plain` highlighter.').optional(),
  fragment_size: z.lazy(() => integer).describe('The size of the highlighted fragment in characters.').optional(),
  highlight_filter: z.boolean().optional(),
  get highlight_query () { return QueryDslQueryContainer.describe('Highlight matches for a query other than the search query. This is especially useful if you use a rescore query because those are not taken into account by highlighting by default.').optional() },
  max_fragment_length: z.lazy(() => integer).optional(),
  max_analyzed_offset: z.lazy(() => integer).describe('If set to a non-negative value, highlighting stops at this defined maximum limit. The rest of the text is not processed, thus not highlighted and no error is returned The `max_analyzed_offset` query setting does not override the `index.highlight.max_analyzed_offset` setting, which prevails when it’s set to lower value than the query setting.').optional(),
  no_match_size: z.lazy(() => integer).describe('The amount of text you want to return from the beginning of the field if there are no matching fragments to highlight.').optional(),
  number_of_fragments: z.lazy(() => integer).describe('The maximum number of fragments to return. If the number of fragments is set to `0`, no fragments are returned. Instead, the entire field contents are highlighted and returned. This can be handy when you need to highlight short texts such as a title or address, but fragmentation is not required. If `number_of_fragments` is `0`, `fragment_size` is ignored.').optional(),
  options: z.record(z.string(), z.any()).optional(),
  order: SearchHighlighterOrder.describe('Sorts highlighted fragments by score when set to `score`. By default, fragments will be output in the order they appear in the field (order: `none`). Setting this option to `score` will output the most relevant fragments first. Each highlighter applies its own logic to compute relevancy scores.').optional(),
  phrase_limit: z.lazy(() => integer).describe('Controls the number of matching phrases in a document that are considered. Prevents the `fvh` highlighter from analyzing too many phrases and consuming too much memory. When using `matched_fields`, `phrase_limit` phrases per matched field are considered. Raising the limit increases query time and consumes more memory. Only supported by the `fvh` highlighter.').optional(),
  post_tags: z.array(z.string()).describe('Use in conjunction with `pre_tags` to define the HTML tags to use for the highlighted text. By default, highlighted text is wrapped in `<em>` and `</em>` tags.').optional(),
  pre_tags: z.array(z.string()).describe('Use in conjunction with `post_tags` to define the HTML tags to use for the highlighted text. By default, highlighted text is wrapped in `<em>` and `</em>` tags.').optional(),
  require_field_match: z.boolean().describe('By default, only fields that contains a query match are highlighted. Set to `false` to highlight all fields.').optional(),
  tags_schema: SearchHighlighterTagsSchema.describe('Set to `styled` to use the built-in tag schema.').optional()
}).meta({ id: 'SearchHighlightBase' })
export type SearchHighlightBase = z.infer<typeof SearchHighlightBase>

export const SearchHighlighterEncoder = z.enum(['default', 'html']).meta({ id: 'SearchHighlighterEncoder' })
export type SearchHighlighterEncoder = z.infer<typeof SearchHighlighterEncoder>

export interface SearchHighlightFieldShape {
  type?: SearchHighlighterType | undefined
  boundary_chars?: string | undefined
  boundary_max_scan?: integer | undefined
  boundary_scanner?: SearchBoundaryScanner | undefined
  boundary_scanner_locale?: string | undefined
  force_source?: boolean | undefined
  fragmenter?: SearchHighlighterFragmenter | undefined
  fragment_size?: integer | undefined
  highlight_filter?: boolean | undefined
  highlight_query?: QueryDslQueryContainerShape | undefined
  max_fragment_length?: integer | undefined
  max_analyzed_offset?: integer | undefined
  no_match_size?: integer | undefined
  number_of_fragments?: integer | undefined
  options?: Record<string, unknown> | undefined
  order?: SearchHighlighterOrder | undefined
  phrase_limit?: integer | undefined
  post_tags?: string[] | undefined
  pre_tags?: string[] | undefined
  require_field_match?: boolean | undefined
  tags_schema?: SearchHighlighterTagsSchema | undefined
  fragment_offset?: integer | undefined
  matched_fields?: Fields | undefined
}
export const SearchHighlightField = z.object({
  type: SearchHighlighterType.optional(),
  boundary_chars: z.string().describe('A string that contains each boundary character.').optional(),
  boundary_max_scan: z.lazy(() => integer).describe('How far to scan for boundary characters.').optional(),
  boundary_scanner: SearchBoundaryScanner.describe('Specifies how to break the highlighted fragments: chars, sentence, or word. Only valid for the unified and fvh highlighters. Defaults to `sentence` for the `unified` highlighter. Defaults to `chars` for the `fvh` highlighter.').optional(),
  boundary_scanner_locale: z.string().describe('Controls which locale is used to search for sentence and word boundaries. This parameter takes a form of a language tag, for example: `"en-US"`, `"fr-FR"`, `"ja-JP"`.').optional(),
  force_source: z.boolean().optional(),
  fragmenter: SearchHighlighterFragmenter.describe('Specifies how text should be broken up in highlight snippets: `simple` or `span`. Only valid for the `plain` highlighter.').optional(),
  fragment_size: z.lazy(() => integer).describe('The size of the highlighted fragment in characters.').optional(),
  highlight_filter: z.boolean().optional(),
  get highlight_query () { return QueryDslQueryContainer.describe('Highlight matches for a query other than the search query. This is especially useful if you use a rescore query because those are not taken into account by highlighting by default.').optional() },
  max_fragment_length: z.lazy(() => integer).optional(),
  max_analyzed_offset: z.lazy(() => integer).describe('If set to a non-negative value, highlighting stops at this defined maximum limit. The rest of the text is not processed, thus not highlighted and no error is returned The `max_analyzed_offset` query setting does not override the `index.highlight.max_analyzed_offset` setting, which prevails when it’s set to lower value than the query setting.').optional(),
  no_match_size: z.lazy(() => integer).describe('The amount of text you want to return from the beginning of the field if there are no matching fragments to highlight.').optional(),
  number_of_fragments: z.lazy(() => integer).describe('The maximum number of fragments to return. If the number of fragments is set to `0`, no fragments are returned. Instead, the entire field contents are highlighted and returned. This can be handy when you need to highlight short texts such as a title or address, but fragmentation is not required. If `number_of_fragments` is `0`, `fragment_size` is ignored.').optional(),
  options: z.record(z.string(), z.any()).optional(),
  order: SearchHighlighterOrder.describe('Sorts highlighted fragments by score when set to `score`. By default, fragments will be output in the order they appear in the field (order: `none`). Setting this option to `score` will output the most relevant fragments first. Each highlighter applies its own logic to compute relevancy scores.').optional(),
  phrase_limit: z.lazy(() => integer).describe('Controls the number of matching phrases in a document that are considered. Prevents the `fvh` highlighter from analyzing too many phrases and consuming too much memory. When using `matched_fields`, `phrase_limit` phrases per matched field are considered. Raising the limit increases query time and consumes more memory. Only supported by the `fvh` highlighter.').optional(),
  post_tags: z.array(z.string()).describe('Use in conjunction with `pre_tags` to define the HTML tags to use for the highlighted text. By default, highlighted text is wrapped in `<em>` and `</em>` tags.').optional(),
  pre_tags: z.array(z.string()).describe('Use in conjunction with `post_tags` to define the HTML tags to use for the highlighted text. By default, highlighted text is wrapped in `<em>` and `</em>` tags.').optional(),
  require_field_match: z.boolean().describe('By default, only fields that contains a query match are highlighted. Set to `false` to highlight all fields.').optional(),
  tags_schema: SearchHighlighterTagsSchema.describe('Set to `styled` to use the built-in tag schema.').optional(),
  fragment_offset: z.lazy(() => integer).optional(),
  matched_fields: z.lazy(() => Fields).optional()
}).meta({ id: 'SearchHighlightField' })
export type SearchHighlightField = z.infer<typeof SearchHighlightField>

export interface SearchHighlightShape {
  type?: SearchHighlighterType | undefined
  boundary_chars?: string | undefined
  boundary_max_scan?: integer | undefined
  boundary_scanner?: SearchBoundaryScanner | undefined
  boundary_scanner_locale?: string | undefined
  force_source?: boolean | undefined
  fragmenter?: SearchHighlighterFragmenter | undefined
  fragment_size?: integer | undefined
  highlight_filter?: boolean | undefined
  highlight_query?: QueryDslQueryContainerShape | undefined
  max_fragment_length?: integer | undefined
  max_analyzed_offset?: integer | undefined
  no_match_size?: integer | undefined
  number_of_fragments?: integer | undefined
  options?: Record<string, unknown> | undefined
  order?: SearchHighlighterOrder | undefined
  phrase_limit?: integer | undefined
  post_tags?: string[] | undefined
  pre_tags?: string[] | undefined
  require_field_match?: boolean | undefined
  tags_schema?: SearchHighlighterTagsSchema | undefined
  encoder?: SearchHighlighterEncoder | undefined
  fields: Record<Field, SearchHighlightFieldShape> | Array<Record<Field, SearchHighlightFieldShape>>
}
export const SearchHighlight = z.object({
  type: SearchHighlighterType.optional(),
  boundary_chars: z.string().describe('A string that contains each boundary character.').optional(),
  boundary_max_scan: z.lazy(() => integer).describe('How far to scan for boundary characters.').optional(),
  boundary_scanner: SearchBoundaryScanner.describe('Specifies how to break the highlighted fragments: chars, sentence, or word. Only valid for the unified and fvh highlighters. Defaults to `sentence` for the `unified` highlighter. Defaults to `chars` for the `fvh` highlighter.').optional(),
  boundary_scanner_locale: z.string().describe('Controls which locale is used to search for sentence and word boundaries. This parameter takes a form of a language tag, for example: `"en-US"`, `"fr-FR"`, `"ja-JP"`.').optional(),
  force_source: z.boolean().optional(),
  fragmenter: SearchHighlighterFragmenter.describe('Specifies how text should be broken up in highlight snippets: `simple` or `span`. Only valid for the `plain` highlighter.').optional(),
  fragment_size: z.lazy(() => integer).describe('The size of the highlighted fragment in characters.').optional(),
  highlight_filter: z.boolean().optional(),
  get highlight_query () { return QueryDslQueryContainer.describe('Highlight matches for a query other than the search query. This is especially useful if you use a rescore query because those are not taken into account by highlighting by default.').optional() },
  max_fragment_length: z.lazy(() => integer).optional(),
  max_analyzed_offset: z.lazy(() => integer).describe('If set to a non-negative value, highlighting stops at this defined maximum limit. The rest of the text is not processed, thus not highlighted and no error is returned The `max_analyzed_offset` query setting does not override the `index.highlight.max_analyzed_offset` setting, which prevails when it’s set to lower value than the query setting.').optional(),
  no_match_size: z.lazy(() => integer).describe('The amount of text you want to return from the beginning of the field if there are no matching fragments to highlight.').optional(),
  number_of_fragments: z.lazy(() => integer).describe('The maximum number of fragments to return. If the number of fragments is set to `0`, no fragments are returned. Instead, the entire field contents are highlighted and returned. This can be handy when you need to highlight short texts such as a title or address, but fragmentation is not required. If `number_of_fragments` is `0`, `fragment_size` is ignored.').optional(),
  options: z.record(z.string(), z.any()).optional(),
  order: SearchHighlighterOrder.describe('Sorts highlighted fragments by score when set to `score`. By default, fragments will be output in the order they appear in the field (order: `none`). Setting this option to `score` will output the most relevant fragments first. Each highlighter applies its own logic to compute relevancy scores.').optional(),
  phrase_limit: z.lazy(() => integer).describe('Controls the number of matching phrases in a document that are considered. Prevents the `fvh` highlighter from analyzing too many phrases and consuming too much memory. When using `matched_fields`, `phrase_limit` phrases per matched field are considered. Raising the limit increases query time and consumes more memory. Only supported by the `fvh` highlighter.').optional(),
  post_tags: z.array(z.string()).describe('Use in conjunction with `pre_tags` to define the HTML tags to use for the highlighted text. By default, highlighted text is wrapped in `<em>` and `</em>` tags.').optional(),
  pre_tags: z.array(z.string()).describe('Use in conjunction with `post_tags` to define the HTML tags to use for the highlighted text. By default, highlighted text is wrapped in `<em>` and `</em>` tags.').optional(),
  require_field_match: z.boolean().describe('By default, only fields that contains a query match are highlighted. Set to `false` to highlight all fields.').optional(),
  tags_schema: SearchHighlighterTagsSchema.describe('Set to `styled` to use the built-in tag schema.').optional(),
  encoder: SearchHighlighterEncoder.optional(),
  get fields (): z.ZodUnion<readonly [z.ZodRecord<typeof Field, typeof SearchHighlightField>, z.ZodArray<z.ZodRecord<typeof Field, typeof SearchHighlightField>>]> { return z.union([z.record(Field, SearchHighlightField), z.array(z.record(Field, SearchHighlightField))]) }
}).meta({ id: 'SearchHighlight' })
export type SearchHighlight = z.infer<typeof SearchHighlight>

export const SearchSourceFilter = z.object({
  exclude_vectors: z.boolean().describe('If `true`, vector fields are excluded from the returned source. This option takes precedence over `includes`: any vector field will remain excluded even if it matches an `includes` rule.').optional(),
  excludes: z.lazy(() => Fields).describe('A list of fields to exclude from the returned source.').optional(),
  exclude: z.lazy(() => Fields).describe('A list of fields to exclude from the returned source.').optional(),
  includes: z.lazy(() => Fields).describe('A list of fields to include in the returned source.').optional(),
  include: z.lazy(() => Fields).describe('A list of fields to include in the returned source.').optional()
}).meta({ id: 'SearchSourceFilter' })
export type SearchSourceFilter = z.infer<typeof SearchSourceFilter>

/** Defines how to fetch a source. Fetching can be disabled entirely, or the source can be filtered. */
export const SearchSourceConfig = z.union([z.boolean(), SearchSourceFilter]).meta({ id: 'SearchSourceConfig' })
export type SearchSourceConfig = z.infer<typeof SearchSourceConfig>

export interface SearchInnerHitsShape {
  name?: Name | undefined
  size?: integer | undefined
  from?: integer | undefined
  collapse?: SearchFieldCollapseShape | undefined
  docvalue_fields?: QueryDslFieldAndFormat[] | undefined
  explain?: boolean | undefined
  highlight?: SearchHighlightShape | undefined
  ignore_unmapped?: boolean | undefined
  script_fields?: Record<Field, ScriptFieldShape> | undefined
  seq_no_primary_term?: boolean | undefined
  fields?: Field[] | undefined
  sort?: SortShape | undefined
  _source?: SearchSourceConfig | undefined
  stored_fields?: Fields | undefined
  track_scores?: boolean | undefined
  version?: boolean | undefined
}
export const SearchInnerHits = z.object({
  name: z.lazy(() => Name).describe('The name for the particular inner hit definition in the response. Useful when a search request contains multiple inner hits.').optional(),
  size: z.lazy(() => integer).describe('The maximum number of hits to return per `inner_hits`.').optional(),
  from: z.lazy(() => integer).describe('Inner hit starting document offset.').optional(),
  get collapse () { return SearchFieldCollapse.optional() },
  docvalue_fields: z.array(z.lazy(() => QueryDslFieldAndFormat)).optional(),
  explain: z.boolean().optional(),
  get highlight () { return SearchHighlight.optional() },
  ignore_unmapped: z.boolean().optional(),
  get script_fields (): z.ZodOptional<z.ZodRecord<typeof Field, typeof ScriptField>> { return z.record(Field, ScriptField).optional() },
  seq_no_primary_term: z.boolean().optional(),
  fields: z.array(z.lazy(() => Field)).optional(),
  get sort () { return Sort.describe('How the inner hits should be sorted per `inner_hits`. By default, inner hits are sorted by score.').optional() },
  _source: z.lazy(() => SearchSourceConfig).optional(),
  stored_fields: z.lazy(() => Fields).optional(),
  track_scores: z.boolean().optional(),
  version: z.boolean().optional()
}).meta({ id: 'SearchInnerHits' })
export type SearchInnerHits = z.infer<typeof SearchInnerHits>

/**
 * Number of hits matching the query to count accurately. If true, the exact
 * number of hits is returned at the cost of some performance. If false, the
 * response does not include the total number of hits matching the query.
 * Defaults to 10,000 hits.
 */
export const SearchTrackHits = z.union([z.boolean(), z.lazy(() => integer)]).meta({ id: 'SearchTrackHits' })
export type SearchTrackHits = z.infer<typeof SearchTrackHits>

export const SearchScoreMode = z.enum(['avg', 'max', 'min', 'multiply', 'total']).meta({ id: 'SearchScoreMode' })
export type SearchScoreMode = z.infer<typeof SearchScoreMode>

export interface SearchRescoreQueryShape {
  Query: QueryDslQueryContainerShape
  query_weight?: double | undefined
  rescore_query_weight?: double | undefined
  score_mode?: SearchScoreMode | undefined
}
export const SearchRescoreQuery = z.object({
  get Query () { return QueryDslQueryContainer.describe('The query to use for rescoring. This query is only run on the Top-K results returned by the `query` and `post_filter` phases.') },
  query_weight: z.lazy(() => double).describe('Relative importance of the original query versus the rescore query.').optional(),
  rescore_query_weight: z.lazy(() => double).describe('Relative importance of the rescore query versus the original query.').optional(),
  score_mode: SearchScoreMode.describe('Determines how scores are combined.').optional()
}).meta({ id: 'SearchRescoreQuery' })
export type SearchRescoreQuery = z.infer<typeof SearchRescoreQuery>

export const SearchLearningToRank = z.object({
  model_id: z.string().describe('The unique identifier of the trained model uploaded to Elasticsearch'),
  params: z.record(z.string(), z.any()).describe('Named parameters to be passed to the query templates used for feature').optional()
}).meta({ id: 'SearchLearningToRank' })
export type SearchLearningToRank = z.infer<typeof SearchLearningToRank>

export interface SearchScriptRescoreShape {
  script: ScriptShape
}
export const SearchScriptRescore = z.object({
  get script () { return Script }
}).meta({ id: 'SearchScriptRescore' })
export type SearchScriptRescore = z.infer<typeof SearchScriptRescore>

const SearchRescoreCommonProps = z.object({
  window_size: z.lazy(() => integer).optional()
})

const SearchRescoreExclusiveProps = z.union([z.object({ query: z.lazy(() => SearchRescoreQuery) }), z.object({ learning_to_rank: SearchLearningToRank }), z.object({ script: z.lazy(() => SearchScriptRescore) })])

export interface SearchRescoreShape {
  window_size?: integer | undefined
  query?: SearchRescoreQuery | undefined
  learning_to_rank?: SearchLearningToRank | undefined
  script?: SearchScriptRescore | undefined
}
export const SearchRescore: z.ZodType<SearchRescoreShape> = SearchRescoreCommonProps.and(SearchRescoreExclusiveProps).meta({ id: 'SearchRescore' })
export type SearchRescore = z.infer<typeof SearchRescore>

export const SearchSuggester = z.object({
  text: z.string().describe('Global suggest text, to avoid repetition when the same text is used in several suggesters').optional()
}).catchall(z.any()).meta({ id: 'SearchSuggester' })
export type SearchSuggester = z.infer<typeof SearchSuggester>

export const SearchPointInTimeReference = z.object({
  id: z.lazy(() => Id),
  keep_alive: z.lazy(() => Duration).optional()
}).meta({ id: 'SearchPointInTimeReference' })
export type SearchPointInTimeReference = z.infer<typeof SearchPointInTimeReference>

export interface SearchSearchRequestBodyShape {
  aggregations?: Record<string, AggregationsAggregationContainerShape> | undefined
  collapse?: SearchFieldCollapseShape | undefined
  explain?: boolean | undefined
  ext?: Record<string, unknown> | undefined
  from?: integer | undefined
  highlight?: SearchHighlightShape | undefined
  track_total_hits?: SearchTrackHits | undefined
  indices_boost?: Array<Record<IndexName, double>> | undefined
  docvalue_fields?: QueryDslFieldAndFormat[] | undefined
  knn?: KnnSearchShape | KnnSearchShape[] | undefined
  min_score?: double | undefined
  post_filter?: QueryDslQueryContainerShape | undefined
  profile?: boolean | undefined
  query?: QueryDslQueryContainerShape | undefined
  rescore?: SearchRescoreShape | SearchRescoreShape[] | undefined
  retriever?: RetrieverContainerShape | undefined
  script_fields?: Record<string, ScriptFieldShape> | undefined
  search_after?: SortResults | undefined
  size?: integer | undefined
  slice?: SlicedScroll | undefined
  sort?: SortShape | undefined
  _source?: SearchSourceConfig | undefined
  fields?: QueryDslFieldAndFormat[] | undefined
  suggest?: SearchSuggester | undefined
  terminate_after?: long | undefined
  timeout?: string | undefined
  track_scores?: boolean | undefined
  version?: boolean | undefined
  seq_no_primary_term?: boolean | undefined
  stored_fields?: Fields | undefined
  pit?: SearchPointInTimeReference | undefined
  runtime_mappings?: MappingRuntimeFieldsShape | undefined
  stats?: string[] | undefined
}
export const SearchSearchRequestBody = z.object({
  get aggregations (): z.ZodOptional<z.ZodRecord<z.ZodString, typeof AggregationsAggregationContainer>> { return z.record(z.string(), AggregationsAggregationContainer).describe('Defines the aggregations that are run as part of the search request.').optional() },
  get collapse () { return SearchFieldCollapse.describe('Collapses search results the values of the specified field.').optional() },
  explain: z.boolean().describe('If `true`, the request returns detailed information about score computation as part of a hit.').optional(),
  ext: z.record(z.string(), z.any()).describe('Configuration of search extensions defined by Elasticsearch plugins.').optional(),
  from: z.lazy(() => integer).describe('The starting document offset, which must be non-negative. By default, you cannot page through more than 10,000 hits using the `from` and `size` parameters. To page through more hits, use the `search_after` parameter.').optional(),
  get highlight () { return SearchHighlight.describe('Specifies the highlighter to use for retrieving highlighted snippets from one or more fields in your search results.').optional() },
  track_total_hits: SearchTrackHits.describe('Number of hits matching the query to count accurately. If `true`, the exact number of hits is returned at the cost of some performance. If `false`, the  response does not include the total number of hits matching the query.').optional(),
  indices_boost: z.array(z.record(z.lazy(() => IndexName), z.lazy(() => double))).describe('Boost the `_score` of documents from specified indices. The boost value is the factor by which scores are multiplied. A boost value greater than `1.0` increases the score. A boost value between `0` and `1.0` decreases the score.').optional(),
  docvalue_fields: z.array(z.lazy(() => QueryDslFieldAndFormat)).describe('An array of wildcard (`*`) field patterns. The request returns doc values for field names matching these patterns in the `hits.fields` property of the response.').optional(),
  get knn (): z.ZodOptional<z.ZodUnion<readonly [typeof KnnSearch, z.ZodArray<typeof KnnSearch>]>> { return z.union([KnnSearch, KnnSearch.array()]).describe('The approximate kNN search to run.').optional() },
  min_score: z.lazy(() => double).describe('The minimum `_score` for matching documents. Documents with a lower `_score` are not included in search results or results collected by aggregations.').optional(),
  get post_filter () { return QueryDslQueryContainer.describe('Use the `post_filter` parameter to filter search results. The search hits are filtered after the aggregations are calculated. A post filter has no impact on the aggregation results.').optional() },
  profile: z.boolean().describe('Set to `true` to return detailed timing information about the execution of individual components in a search request. NOTE: This is a debugging tool and adds significant overhead to search execution.').optional(),
  get query () { return QueryDslQueryContainer.describe('The search definition using the Query DSL.').optional() },
  get rescore (): z.ZodOptional<z.ZodUnion<readonly [typeof SearchRescore, z.ZodArray<typeof SearchRescore>]>> { return z.union([SearchRescore, SearchRescore.array()]).describe('Can be used to improve precision by reordering just the top (for example 100 - 500) documents returned by the `query` and `post_filter` phases.').optional() },
  get retriever () { return RetrieverContainer.describe('A retriever is a specification to describe top documents returned from a search. A retriever replaces other elements of the search API that also return top documents such as `query` and `knn`.').optional() },
  get script_fields (): z.ZodOptional<z.ZodRecord<z.ZodString, typeof ScriptField>> { return z.record(z.string(), ScriptField).describe('Retrieve a script evaluation (based on different fields) for each hit.').optional() },
  search_after: z.lazy(() => SortResults).describe('Used to retrieve the next page of hits using a set of sort values from the previous page.').optional(),
  size: z.lazy(() => integer).describe('The number of hits to return, which must not be negative. By default, you cannot page through more than 10,000 hits using the `from` and `size` parameters. To page through more hits, use the `search_after` property.').optional(),
  slice: z.lazy(() => SlicedScroll).describe('Split a scrolled search into multiple slices that can be consumed independently.').optional(),
  get sort () { return Sort.describe('A comma-separated list of <field>:<direction> pairs.').optional() },
  _source: z.lazy(() => SearchSourceConfig).describe('The source fields that are returned for matching documents. These fields are returned in the `hits._source` property of the search response. If the `stored_fields` property is specified, the `_source` property defaults to `false`. Otherwise, it defaults to `true`.').optional(),
  fields: z.array(z.lazy(() => QueryDslFieldAndFormat)).describe('An array of wildcard (`*`) field patterns. The request returns values for field names matching these patterns in the `hits.fields` property of the response.').optional(),
  suggest: SearchSuggester.describe('Defines a suggester that provides similar looking terms based on a provided text.').optional(),
  terminate_after: z.lazy(() => long).describe('The maximum number of documents to collect for each shard. If a query reaches this limit, Elasticsearch terminates the query early. Elasticsearch collects documents before sorting. IMPORTANT: Use with caution. Elasticsearch applies this property to each shard handling the request. When possible, let Elasticsearch perform early termination automatically. Avoid specifying this property for requests that target data streams with backing indices across multiple data tiers. If set to `0` (default), the query does not terminate early.').optional(),
  timeout: z.string().describe('The period of time to wait for a response from each shard. If no response is received before the timeout expires, the request fails and returns an error. Defaults to no timeout.').optional(),
  track_scores: z.boolean().describe('If `true`, calculate and return document scores, even if the scores are not used for sorting.').optional(),
  version: z.boolean().describe('If `true`, the request returns the document version as part of a hit.').optional(),
  seq_no_primary_term: z.boolean().describe('If `true`, the request returns sequence number and primary term of the last modification of each hit.').optional(),
  stored_fields: z.lazy(() => Fields).describe('A comma-separated list of stored fields to return as part of a hit. If no fields are specified, no stored fields are included in the response. If this field is specified, the `_source` property defaults to `false`. You can pass `_source: true` to return both source fields and stored fields in the search response.').optional(),
  pit: SearchPointInTimeReference.describe('Limit the search to a point in time (PIT). If you provide a PIT, you cannot specify an `<index>` in the request path.').optional(),
  get runtime_mappings () { return MappingRuntimeFields.describe('One or more runtime fields in the search request. These fields take precedence over mapped fields with the same name.').optional() },
  stats: z.array(z.string()).describe('The stats groups to associate with the search. Each group maintains a statistics aggregation for its associated searches. You can retrieve these stats using the indices stats API.').optional()
}).meta({ id: 'SearchSearchRequestBody' })
export type SearchSearchRequestBody = z.infer<typeof SearchSearchRequestBody>

export const BulkUpdateAction = z.object({
  detect_noop: z.boolean().describe('If true, the `result` in the response is set to \'noop\' when no changes to the document occur.').optional(),
  doc: z.any().describe('A partial update to an existing document.').optional(),
  doc_as_upsert: z.boolean().describe('Set to `true` to use the contents of `doc` as the value of `upsert`.').optional(),
  script: z.lazy(() => Script).describe('The script to run to update the document.').optional(),
  scripted_upsert: z.boolean().describe('Set to `true` to run the script whether or not the document exists.').optional(),
  _source: z.lazy(() => SearchSourceConfig).describe('If `false`, source retrieval is turned off. You can also specify a comma-separated list of the fields you want to retrieve.').optional(),
  upsert: z.any().describe('If the document does not already exist, the contents of `upsert` are inserted as a new document. If the document exists, the `script` is run.').optional()
}).meta({ id: 'BulkUpdateAction' })
export type BulkUpdateAction = z.infer<typeof BulkUpdateAction>

/**
 * Bulk index or delete documents.
 *
 * Perform multiple `index`, `create`, `delete`, and `update` actions in a single request.
 * This reduces overhead and can greatly increase indexing speed.
 *
 * If the Elasticsearch security features are enabled, you must have the following index privileges for the target data stream, index, or index alias:
 *
 * * To use the `create` action, you must have the `create_doc`, `create`, `index`, or `write` index privilege. Data streams support only the `create` action.
 * * To use the `index` action, you must have the `create`, `index`, or `write` index privilege.
 * * To use the `delete` action, you must have the `delete` or `write` index privilege.
 * * To use the `update` action, you must have the `index` or `write` index privilege.
 * * To automatically create a data stream or index with a bulk API request, you must have the `auto_configure`, `create_index`, or `manage` index privilege.
 * * To make the result of a bulk operation visible to search using the `refresh` parameter, you must have the `maintenance` or `manage` index privilege.
 *
 * Automatic data stream creation requires a matching index template with data stream enabled.
 *
 * The actions are specified in the request body using a newline delimited JSON (NDJSON) structure:
 *
 * ```
 * action_and_meta_data\n
 * optional_source\n
 * action_and_meta_data\n
 * optional_source\n
 * ....
 * action_and_meta_data\n
 * optional_source\n
 * ```
 *
 * The `index` and `create` actions expect a source on the next line and have the same semantics as the `op_type` parameter in the standard index API.
 * A `create` action fails if a document with the same ID already exists in the target
 * An `index` action adds or replaces a document as necessary.
 *
 * NOTE: Data streams support only the `create` action.
 * To update or delete a document in a data stream, you must target the backing index containing the document.
 *
 * An `update` action expects that the partial doc, upsert, and script and its options are specified on the next line.
 *
 * A `delete` action does not expect a source on the next line and has the same semantics as the standard delete API.
 *
 * NOTE: The final line of data must end with a newline character (`\n`).
 * Each newline character may be preceded by a carriage return (`\r`).
 * When sending NDJSON data to the `_bulk` endpoint, use a `Content-Type` header of `application/json` or `application/x-ndjson`.
 * Because this format uses literal newline characters (`\n`) as delimiters, make sure that the JSON actions and sources are not pretty printed.
 *
 * If you provide a target in the request path, it is used for any actions that don't explicitly specify an `_index` argument.
 *
 * A note on the format: the idea here is to make processing as fast as possible.
 * As some of the actions are redirected to other shards on other nodes, only `action_meta_data` is parsed on the receiving node side.
 *
 * Client libraries using this protocol should try and strive to do something similar on the client side, and reduce buffering as much as possible.
 *
 * There is no "correct" number of actions to perform in a single bulk request.
 * Experiment with different settings to find the optimal size for your particular workload.
 * Note that Elasticsearch limits the maximum size of a HTTP request to 100mb by default so clients must ensure that no request exceeds this size.
 * It is not possible to index a single document that exceeds the size limit, so you must pre-process any such documents into smaller pieces before sending them to Elasticsearch.
 * For instance, split documents into pages or chapters before indexing them, or store raw binary data in a system outside Elasticsearch and replace the raw data with a link to the external system in the documents that you send to Elasticsearch.
 *
 * **Client suppport for bulk requests**
 *
 * Some of the officially supported clients provide helpers to assist with bulk requests and reindexing:
 *
 * * Go: Check out `esutil.BulkIndexer`
 * * Perl: Check out `Search::Elasticsearch::Client::5_0::Bulk` and `Search::Elasticsearch::Client::5_0::Scroll`
 * * Python: Check out `elasticsearch.helpers.*`
 * * JavaScript: Check out `client.helpers.*`
 * * Java: Check out `co.elastic.clients.elasticsearch._helpers.bulk.BulkIngester`
 * * .NET: Check out `BulkAllObservable`
 * * PHP: Check out bulk indexing.
 * * Ruby: Check out `Elasticsearch::Helpers::BulkHelper`
 *
 * **Submitting bulk requests with cURL**
 *
 * If you're providing text file input to `curl`, you must use the `--data-binary` flag instead of plain `-d`.
 * The latter doesn't preserve newlines. For example:
 *
 * ```
 * $ cat requests
 * { "index" : { "_index" : "test", "_id" : "1" } }
 * { "field1" : "value1" }
 * $ curl -s -H "Content-Type: application/x-ndjson" -XPOST localhost:9200/_bulk --data-binary "@requests"; echo
 * {"took":7, "errors": false, "items":[{"index":{"_index":"test","_id":"1","_version":1,"result":"created","forced_refresh":false}}]}
 * ```
 *
 * **Optimistic concurrency control**
 *
 * Each `index` and `delete` action within a bulk API call may include the `if_seq_no` and `if_primary_term` parameters in their respective action and meta data lines.
 * The `if_seq_no` and `if_primary_term` parameters control how operations are run, based on the last modification to existing documents. See Optimistic concurrency control for more details.
 *
 * **Versioning**
 *
 * Each bulk item can include the version value using the `version` field.
 * It automatically follows the behavior of the index or delete operation based on the `_version` mapping.
 * It also support the `version_type`.
 *
 * **Routing**
 *
 * Each bulk item can include the routing value using the `routing` field.
 * It automatically follows the behavior of the index or delete operation based on the `_routing` mapping.
 *
 * NOTE: Data streams do not support custom routing unless they were created with the `allow_custom_routing` setting enabled in the template.
 *
 * **Wait for active shards**
 *
 * When making bulk calls, you can set the `wait_for_active_shards` parameter to require a minimum number of shard copies to be active before starting to process the bulk request.
 *
 * **Refresh**
 *
 * Control when the changes made by this request are visible to search.
 *
 * NOTE: Only the shards that receive the bulk request will be affected by refresh.
 * Imagine a `_bulk?refresh=wait_for` request with three documents in it that happen to be routed to different shards in an index with five shards.
 * The request will only wait for those three shards to refresh.
 * The other two shards that make up the index do not participate in the `_bulk` request at all.
 *
 * You might want to disable the refresh interval temporarily to improve indexing throughput for large bulk requests.
 * Refer to the linked documentation for step-by-step instructions using the index settings API.
 */
export const BulkRequest = z.object({
  index: z.lazy(() => IndexName).describe('The name of the data stream, index, or index alias to perform bulk actions on.').optional().meta({ found_in: 'path' }),
  include_source_on_error: z.boolean().describe('True or false if to include the document source in the error message in case of parsing errors.').optional().meta({ found_in: 'query' }),
  list_executed_pipelines: z.boolean().describe('If `true`, the response will include the ingest pipelines that were run for each index or create.').optional().meta({ found_in: 'query' }),
  pipeline: z.string().describe('The pipeline identifier to use to preprocess incoming documents. If the index has a default ingest pipeline specified, setting the value to `_none` turns off the default ingest pipeline for this request. If a final pipeline is configured, it will always run regardless of the value of this parameter.').optional().meta({ found_in: 'query' }),
  refresh: z.lazy(() => Refresh).describe('If `true`, Elasticsearch refreshes the affected shards to make this operation visible to search. If `wait_for`, wait for a refresh to make this operation visible to search. If `false`, do nothing with refreshes. Valid values: `true`, `false`, `wait_for`.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value that is used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('Indicates whether to return the `_source` field (`true` or `false`) or contains a list of fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude from the response. You can also use this parameter to exclude fields from the subset specified in `_source_includes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response. If this parameter is specified, only these source fields are returned. You can exclude fields from this subset using the `_source_excludes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period each action waits for the following operations: automatic index creation, dynamic mapping updates, and waiting for active shards. The default is `1m` (one minute), which guarantees Elasticsearch waits for at least the timeout before failing. The actual wait time could be longer, particularly when multiple waits occur.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of shard copies that must be active before proceeding with the operation. Set to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The default is `1`, which waits for each primary shard to be active.').optional().meta({ found_in: 'query' }),
  require_alias: z.boolean().describe('If `true`, the request\'s actions must target an index alias.').optional().meta({ found_in: 'query' }),
  require_data_stream: z.boolean().describe('If `true`, the request\'s actions must target a data stream (existing or to be created).').optional().meta({ found_in: 'query' }),
  operations: z.array(z.union([BulkOperationContainer, BulkUpdateAction, z.any()])).optional().meta({ found_in: 'body' })
}).meta({ id: 'BulkRequest' })
export type BulkRequest = z.infer<typeof BulkRequest>

export const BulkResponseItem = z.object({
  _id: z.union([z.string(), z.null()]).describe('The document ID associated with the operation.').optional(),
  _index: z.string().describe('The name of the index associated with the operation. If the operation targeted a data stream, this is the backing index into which the document was written.'),
  status: z.lazy(() => integer).describe('The HTTP status code returned for the operation.'),
  failure_store: z.lazy(() => BulkFailureStoreStatus).optional(),
  error: z.lazy(() => ErrorCause).describe('Additional information about the failed operation. The property is returned only for failed operations.').optional(),
  _primary_term: z.lazy(() => long).describe('The primary term assigned to the document for the operation. This property is returned only for successful operations.').optional(),
  result: z.string().describe('The result of the operation. Possible values are `created`, `updated`, `deleted`, `noop`, and `not_found`.').optional(),
  _seq_no: z.lazy(() => SequenceNumber).describe('The sequence number assigned to the document for the operation. Sequence numbers are used to ensure an older version of a document doesn\'t overwrite a newer version.').optional(),
  _shards: z.lazy(() => ShardStatistics).describe('Shard information for the operation.').optional(),
  _version: z.lazy(() => VersionNumber).describe('The document version associated with the operation. The document version is incremented each time the document is updated. This property is returned only for successful actions.').optional(),
  forced_refresh: z.boolean().optional(),
  get: z.lazy(() => InlineGet).optional()
}).meta({ id: 'BulkResponseItem' })
export type BulkResponseItem = z.infer<typeof BulkResponseItem>

export const BulkResponse = z.object({
  errors: z.boolean().describe('If `true`, one or more of the operations in the bulk request did not complete successfully.'),
  items: z.array(z.record(BulkOperationType, BulkResponseItem)).describe('The result of each operation in the bulk request, in the order they were submitted.'),
  took: z.lazy(() => long).describe('The length of time, in milliseconds, it took to process the bulk request.'),
  ingest_took: z.lazy(() => long).optional()
}).meta({ id: 'BulkResponse' })
export type BulkResponse = z.infer<typeof BulkResponse>

export const CapabilitiesFailedNodeException = z.object({
  node_id: z.lazy(() => Id)
}).meta({ id: 'CapabilitiesFailedNodeException' })
export type CapabilitiesFailedNodeException = z.infer<typeof CapabilitiesFailedNodeException>

export const CapabilitiesRestMethod = z.enum(['GET', 'HEAD', 'POST', 'PUT', 'DELETE']).meta({ id: 'CapabilitiesRestMethod' })
export type CapabilitiesRestMethod = z.infer<typeof CapabilitiesRestMethod>

/** Checks if the specified combination of method, API, parameters, and arbitrary capabilities are supported. */
export const CapabilitiesRequest = z.object({
  method: CapabilitiesRestMethod.describe('REST method to check').optional().meta({ found_in: 'query' }),
  path: z.string().describe('API path to check').optional().meta({ found_in: 'query' }),
  parameters: z.union([z.string(), z.array(z.string())]).describe('Comma-separated list of API parameters to check').optional().meta({ found_in: 'query' }),
  capabilities: z.union([z.string(), z.array(z.string())]).describe('Comma-separated list of arbitrary API capabilities to check').optional().meta({ found_in: 'query' }),
  local_only: z.boolean().describe('True if only the node being called should be considered').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('Period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' })
}).meta({ id: 'CapabilitiesRequest' })
export type CapabilitiesRequest = z.infer<typeof CapabilitiesRequest>

export const CapabilitiesResponse = z.object({
  _nodes: z.lazy(() => NodeStatistics),
  cluster_name: z.lazy(() => Name),
  supported: z.union([z.boolean(), z.null()]),
  failures: z.array(CapabilitiesFailedNodeException).optional()
}).meta({ id: 'CapabilitiesResponse' })
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponse>

/**
 * Clear a scrolling search.
 *
 * Clear the search context and results for a scrolling search.
 */
export const ClearScrollRequest = z.object({
  scroll_id: z.lazy(() => ScrollIds).describe('The scroll IDs to clear. To clear all scroll IDs, use `_all`.').optional().meta({ found_in: 'body' })
}).meta({ id: 'ClearScrollRequest' })
export type ClearScrollRequest = z.infer<typeof ClearScrollRequest>

export const ClearScrollResponse = z.object({
  succeeded: z.boolean().describe('If `true`, the request succeeded. This does not indicate whether any scrolling search requests were cleared.'),
  num_freed: z.lazy(() => integer).describe('The number of scrolling search requests cleared.')
}).meta({ id: 'ClearScrollResponse' })
export type ClearScrollResponse = z.infer<typeof ClearScrollResponse>

/**
 * Close a point in time.
 *
 * A point in time must be opened explicitly before being used in search requests.
 * The `keep_alive` parameter tells Elasticsearch how long it should persist.
 * A point in time is automatically closed when the `keep_alive` period has elapsed.
 * However, keeping points in time has a cost; close them as soon as they are no longer required for search requests.
 */
export const ClosePointInTimeRequest = z.object({
  id: z.lazy(() => Id).describe('The ID of the point-in-time.').meta({ found_in: 'body' })
}).meta({ id: 'ClosePointInTimeRequest' })
export type ClosePointInTimeRequest = z.infer<typeof ClosePointInTimeRequest>

export const ClosePointInTimeResponse = z.object({
  succeeded: z.boolean().describe('If `true`, all search contexts associated with the point-in-time ID were successfully closed.'),
  num_freed: z.lazy(() => integer).describe('The number of search contexts that were successfully closed.')
}).meta({ id: 'ClosePointInTimeResponse' })
export type ClosePointInTimeResponse = z.infer<typeof ClosePointInTimeResponse>

/**
 * Count search results.
 *
 * Get the number of documents matching a query.
 *
 * The query can be provided either by using a simple query string as a parameter, or by defining Query DSL within the request body.
 * The query is optional. When no query is provided, the API uses `match_all` to count all the documents.
 *
 * The count API supports multi-target syntax. You can run a single count API search across multiple data streams and indices.
 *
 * The operation is broadcast across all shards.
 * For each shard ID group, a replica is chosen and the search is run against it.
 * This means that replicas increase the scalability of the count.
 */
export const CountRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`). To search all data streams and indices, omit this parameter or use `*` or `_all`.').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  analyzer: z.string().describe('The analyzer to use for the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  analyze_wildcard: z.boolean().describe('If `true`, wildcard and prefix queries are analyzed. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  default_operator: z.lazy(() => QueryDslOperator).describe('The default operator for query string query: `and` or `or`. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  df: z.string().describe('The field to use as a default when no field prefix is given in the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. It supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  ignore_throttled: z.boolean().describe('If `true`, concrete, expanded, or aliased indices are ignored when frozen.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  lenient: z.boolean().describe('If `true`, format-based query failures (such as providing text to a numeric field) in the query string will be ignored. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  min_score: z.lazy(() => double).describe('The minimum `_score` value that documents must have to be included in the result.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. By default, it is random.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  terminate_after: z.lazy(() => long).describe('The maximum number of documents to collect for each shard. If a query reaches this limit, Elasticsearch terminates the query early. Elasticsearch collects documents before sorting. IMPORTANT: Use with caution. Elasticsearch applies this parameter to each shard handling the request. When possible, let Elasticsearch perform early termination automatically. Avoid specifying this parameter for requests that target data streams with backing indices across multiple data tiers.').optional().meta({ found_in: 'query' }),
  q: z.string().describe('The query in Lucene query string syntax. This parameter cannot be used with a request body.').optional().meta({ found_in: 'query' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('Defines the search query using Query DSL. A request body query cannot be used with the `q` query string parameter.').optional().meta({ found_in: 'body' })
}).meta({ id: 'CountRequest' })
export type CountRequest = z.infer<typeof CountRequest>

export const CountResponse = z.object({
  count: z.lazy(() => long),
  _shards: z.lazy(() => ShardStatistics)
}).meta({ id: 'CountResponse' })
export type CountResponse = z.infer<typeof CountResponse>

/**
 * Create a new document in the index.
 *
 * You can index a new JSON document with the `/<target>/_doc/` or `/<target>/_create/<_id>` APIs
 * Using `_create` guarantees that the document is indexed only if it does not already exist.
 * It returns a 409 response when a document with a same ID already exists in the index.
 * To update an existing document, you must use the `/<target>/_doc/` API.
 *
 * If the Elasticsearch security features are enabled, you must have the following index privileges for the target data stream, index, or index alias:
 *
 * * To add a document using the `PUT /<target>/_create/<_id>` or `POST /<target>/_create/<_id>` request formats, you must have the `create_doc`, `create`, `index`, or `write` index privilege.
 * * To automatically create a data stream or index with this API request, you must have the `auto_configure`, `create_index`, or `manage` index privilege.
 *
 * Automatic data stream creation requires a matching index template with data stream enabled.
 *
 * **Automatically create data streams and indices**
 *
 * If the request's target doesn't exist and matches an index template with a `data_stream` definition, the index operation automatically creates the data stream.
 *
 * If the target doesn't exist and doesn't match a data stream template, the operation automatically creates the index and applies any matching index templates.
 *
 * NOTE: Elasticsearch includes several built-in index templates. To avoid naming collisions with these templates, refer to index pattern documentation.
 *
 * If no mapping exists, the index operation creates a dynamic mapping.
 * By default, new fields and objects are automatically added to the mapping if needed.
 *
 * Automatic index creation is controlled by the `action.auto_create_index` setting.
 * If it is `true`, any index can be created automatically.
 * You can modify this setting to explicitly allow or block automatic creation of indices that match specified patterns or set it to `false` to turn off automatic index creation entirely.
 * Specify a comma-separated list of patterns you want to allow or prefix each pattern with `+` or `-` to indicate whether it should be allowed or blocked.
 * When a list is specified, the default behaviour is to disallow.
 *
 * NOTE: The `action.auto_create_index` setting affects the automatic creation of indices only.
 * It does not affect the creation of data streams.
 *
 * **Routing**
 *
 * By default, shard placement—or routing—is controlled by using a hash of the document's ID value.
 * For more explicit control, the value fed into the hash function used by the router can be directly specified on a per-operation basis using the `routing` parameter.
 *
 * When setting up explicit mapping, you can also use the `_routing` field to direct the index operation to extract the routing value from the document itself.
 * This does come at the (very minimal) cost of an additional document parsing pass.
 * If the `_routing` mapping is defined and set to be required, the index operation will fail if no routing value is provided or extracted.
 *
 * NOTE: Data streams do not support custom routing unless they were created with the `allow_custom_routing` setting enabled in the template.
 *
 * **Distributed**
 *
 * The index operation is directed to the primary shard based on its route and performed on the actual node containing this shard.
 * After the primary shard completes the operation, if needed, the update is distributed to applicable replicas.
 *
 * **Active shards**
 *
 * To improve the resiliency of writes to the system, indexing operations can be configured to wait for a certain number of active shard copies before proceeding with the operation.
 * If the requisite number of active shard copies are not available, then the write operation must wait and retry, until either the requisite shard copies have started or a timeout occurs.
 * By default, write operations only wait for the primary shards to be active before proceeding (that is to say `wait_for_active_shards` is `1`).
 * This default can be overridden in the index settings dynamically by setting `index.write.wait_for_active_shards`.
 * To alter this behavior per operation, use the `wait_for_active_shards request` parameter.
 *
 * Valid values are all or any positive integer up to the total number of configured copies per shard in the index (which is `number_of_replicas`+1).
 * Specifying a negative value or a number greater than the number of shard copies will throw an error.
 *
 * For example, suppose you have a cluster of three nodes, A, B, and C and you create an index index with the number of replicas set to 3 (resulting in 4 shard copies, one more copy than there are nodes).
 * If you attempt an indexing operation, by default the operation will only ensure the primary copy of each shard is available before proceeding.
 * This means that even if B and C went down and A hosted the primary shard copies, the indexing operation would still proceed with only one copy of the data.
 * If `wait_for_active_shards` is set on the request to `3` (and all three nodes are up), the indexing operation will require 3 active shard copies before proceeding.
 * This requirement should be met because there are 3 active nodes in the cluster, each one holding a copy of the shard.
 * However, if you set `wait_for_active_shards` to `all` (or to `4`, which is the same in this situation), the indexing operation will not proceed as you do not have all 4 copies of each shard active in the index.
 * The operation will timeout unless a new node is brought up in the cluster to host the fourth copy of the shard.
 *
 * It is important to note that this setting greatly reduces the chances of the write operation not writing to the requisite number of shard copies, but it does not completely eliminate the possibility, because this check occurs before the write operation starts.
 * After the write operation is underway, it is still possible for replication to fail on any number of shard copies but still succeed on the primary.
 * The `_shards` section of the API response reveals the number of shard copies on which replication succeeded and failed.
 */
export const CreateRequest = z.object({
  id: z.lazy(() => Id).describe('A unique identifier for the document. To automatically generate a document ID, use the `POST /<target>/_doc/` request format.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('The name of the data stream or index to target. If the target doesn\'t exist and matches the name or wildcard (`*`) pattern of an index template with a `data_stream` definition, this request creates the data stream. If the target doesn\'t exist and doesn’t match a data stream template, this request creates the index.').meta({ found_in: 'path' }),
  include_source_on_error: z.boolean().describe('True or false if to include the document source in the error message in case of parsing errors.').optional().meta({ found_in: 'query' }),
  pipeline: z.string().describe('The ID of the pipeline to use to preprocess incoming documents. If the index has a default ingest pipeline specified, setting the value to `_none` turns off the default ingest pipeline for this request. If a final pipeline is configured, it will always run regardless of the value of this parameter.').optional().meta({ found_in: 'query' }),
  refresh: z.lazy(() => Refresh).describe('If `true`, Elasticsearch refreshes the affected shards to make this operation visible to search. If `wait_for`, it waits for a refresh to make this operation visible to search. If `false`, it does nothing with refreshes.').optional().meta({ found_in: 'query' }),
  require_alias: z.boolean().describe('If `true`, the destination must be an index alias.').optional().meta({ found_in: 'query' }),
  require_data_stream: z.boolean().describe('If `true`, the request\'s actions must target a data stream (existing or to be created).').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value that is used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period the request waits for the following operations: automatic index creation, dynamic mapping updates, waiting for active shards. Elasticsearch waits for at least the specified timeout period before failing. The actual wait time could be longer, particularly when multiple waits occur. This parameter is useful for situations where the primary shard assigned to perform the operation might not be available when the operation runs. Some reasons for this might be that the primary shard is currently recovering from a gateway or undergoing relocation. By default, the operation will wait on the primary shard to become available for at least 1 minute before failing and responding with an error. The actual wait time could be longer, particularly when multiple waits occur.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('The explicit version number for concurrency control. It must be a non-negative long number.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of shard copies that must be active before proceeding with the operation. You can set it to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The default value of `1` means it waits for each primary shard to be active.').optional().meta({ found_in: 'query' }),
  document: z.any().optional().meta({ found_in: 'body' })
}).meta({ id: 'CreateRequest' })
export type CreateRequest = z.infer<typeof CreateRequest>

export const CreateResponse = z.lazy(() => WriteResponseBase).meta({ id: 'CreateResponse' })
export type CreateResponse = z.infer<typeof CreateResponse>

/**
 * Delete a document.
 *
 * Remove a JSON document from the specified index.
 *
 * NOTE: You cannot send deletion requests directly to a data stream.
 * To delete a document in a data stream, you must target the backing index containing the document.
 *
 * **Optimistic concurrency control**
 *
 * Delete operations can be made conditional and only be performed if the last modification to the document was assigned the sequence number and primary term specified by the `if_seq_no` and `if_primary_term` parameters.
 * If a mismatch is detected, the operation will result in a `VersionConflictException` and a status code of `409`.
 *
 * **Versioning**
 *
 * Each document indexed is versioned.
 * When deleting a document, the version can be specified to make sure the relevant document you are trying to delete is actually being deleted and it has not changed in the meantime.
 * Every write operation run on a document, deletes included, causes its version to be incremented.
 * The version number of a deleted document remains available for a short time after deletion to allow for control of concurrent operations.
 * The length of time for which a deleted document's version remains available is determined by the `index.gc_deletes` index setting.
 *
 * **Routing**
 *
 * If routing is used during indexing, the routing value also needs to be specified to delete a document.
 *
 * If the `_routing` mapping is set to `required` and no routing value is specified, the delete API throws a `RoutingMissingException` and rejects the request.
 *
 * For example:
 *
 * ```
 * DELETE /my-index-000001/_doc/1?routing=shard-1
 * ```
 *
 * This request deletes the document with ID 1, but it is routed based on the user.
 * The document is not deleted if the correct routing is not specified.
 *
 * **Distributed**
 *
 * The delete operation gets hashed into a specific shard ID.
 * It then gets redirected into the primary shard within that ID group and replicated (if needed) to shard replicas within that ID group.
 */
export const DeleteRequest = z.object({
  id: z.lazy(() => Id).describe('A unique identifier for the document.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('The name of the target index.').meta({ found_in: 'path' }),
  if_primary_term: z.lazy(() => long).describe('Only perform the operation if the document has this primary term.').optional().meta({ found_in: 'query' }),
  if_seq_no: z.lazy(() => SequenceNumber).describe('Only perform the operation if the document has this sequence number.').optional().meta({ found_in: 'query' }),
  refresh: z.lazy(() => Refresh).describe('If `true`, Elasticsearch refreshes the affected shards to make this operation visible to search. If `wait_for`, it waits for a refresh to make this operation visible to search. If `false`, it does nothing with refreshes.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period to wait for active shards. This parameter is useful for situations where the primary shard assigned to perform the delete operation might not be available when the delete operation runs. Some reasons for this might be that the primary shard is currently recovering from a store or undergoing relocation. By default, the delete operation will wait on the primary shard to become available for up to 1 minute before failing and responding with an error.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('An explicit version number for concurrency control. It must match the current version of the document for the request to succeed.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The minimum number of shard copies that must be active before proceeding with the operation. You can set it to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The default value of `1` means it waits for each primary shard to be active.').optional().meta({ found_in: 'query' })
}).meta({ id: 'DeleteRequest' })
export type DeleteRequest = z.infer<typeof DeleteRequest>

export const DeleteResponse = z.lazy(() => WriteResponseBase).meta({ id: 'DeleteResponse' })
export type DeleteResponse = z.infer<typeof DeleteResponse>

/**
 * Delete documents.
 *
 * Deletes documents that match the specified query.
 *
 * If the Elasticsearch security features are enabled, you must have the following index privileges for the target data stream, index, or alias:
 *
 * * `read`
 * * `delete` or `write`
 *
 * You can specify the query criteria in the request URI or the request body using the same syntax as the search API.
 * When you submit a delete by query request, Elasticsearch gets a snapshot of the data stream or index when it begins processing the request and deletes matching documents using internal versioning.
 * If a document changes between the time that the snapshot is taken and the delete operation is processed, it results in a version conflict and the delete operation fails.
 *
 * NOTE: Documents with a version equal to 0 cannot be deleted using delete by query because internal versioning does not support 0 as a valid version number.
 *
 * While processing a delete by query request, Elasticsearch performs multiple search requests sequentially to find all of the matching documents to delete.
 * A bulk delete request is performed for each batch of matching documents.
 * If a search or bulk request is rejected, the requests are retried up to 10 times, with exponential back off.
 * If the maximum retry limit is reached, processing halts and all failed requests are returned in the response.
 * Any delete requests that completed successfully still stick, they are not rolled back.
 *
 * You can opt to count version conflicts instead of halting and returning by setting `conflicts` to `proceed`.
 * Note that if you opt to count version conflicts the operation could attempt to delete more documents from the source than `max_docs` until it has successfully deleted `max_docs documents`, or it has gone through every document in the source query.
 *
 * **Throttling delete requests**
 *
 * To control the rate at which delete by query issues batches of delete operations, you can set `requests_per_second` to any positive decimal number.
 * This pads each batch with a wait time to throttle the rate.
 * Set `requests_per_second` to `-1` to disable throttling.
 *
 * Throttling uses a wait time between batches so that the internal scroll requests can be given a timeout that takes the request padding into account.
 * The padding time is the difference between the batch size divided by the `requests_per_second` and the time spent writing.
 * By default the batch size is `1000`, so if `requests_per_second` is set to `500`:
 *
 * ```
 * target_time = 1000 / 500 per second = 2 seconds
 * wait_time = target_time - write_time = 2 seconds - .5 seconds = 1.5 seconds
 * ```
 *
 * Since the batch is issued as a single `_bulk` request, large batch sizes cause Elasticsearch to create many requests and wait before starting the next set.
 * This is "bursty" instead of "smooth".
 *
 * **Slicing**
 *
 * Delete by query supports sliced scroll to parallelize the delete process.
 * This can improve efficiency and provide a convenient way to break the request down into smaller parts.
 *
 * Setting `slices` to `auto` lets Elasticsearch choose the number of slices to use.
 * This setting will use one slice per shard, up to a certain limit.
 * If there are multiple source data streams or indices, it will choose the number of slices based on the index or backing index with the smallest number of shards.
 * Adding slices to the delete by query operation creates sub-requests which means it has some quirks:
 *
 * * You can see these requests in the tasks APIs. These sub-requests are "child" tasks of the task for the request with slices.
 * * Fetching the status of the task for the request with slices only contains the status of completed slices.
 * * These sub-requests are individually addressable for things like cancellation and rethrottling.
 * * Rethrottling the request with `slices` will rethrottle the unfinished sub-request proportionally.
 * * Canceling the request with `slices` will cancel each sub-request.
 * * Due to the nature of `slices` each sub-request won't get a perfectly even portion of the documents. All documents will be addressed, but some slices may be larger than others. Expect larger slices to have a more even distribution.
 * * Parameters like `requests_per_second` and `max_docs` on a request with `slices` are distributed proportionally to each sub-request. Combine that with the earlier point about distribution being uneven and you should conclude that using `max_docs` with `slices` might not result in exactly `max_docs` documents being deleted.
 * * Each sub-request gets a slightly different snapshot of the source data stream or index though these are all taken at approximately the same time.
 *
 * If you're slicing manually or otherwise tuning automatic slicing, keep in mind that:
 *
 * * Query performance is most efficient when the number of slices is equal to the number of shards in the index or backing index. If that number is large (for example, 500), choose a lower number as too many `slices` hurts performance. Setting `slices` higher than the number of shards generally does not improve efficiency and adds overhead.
 * * Delete performance scales linearly across available resources with the number of slices.
 *
 * Whether query or delete performance dominates the runtime depends on the documents being reindexed and cluster resources.
 *
 * **Cancel a delete by query operation**
 *
 * Any delete by query can be canceled using the task cancel API. For example:
 *
 * ```
 * POST _tasks/r1A2WoRbTwKZ516z6NEs5A:36619/_cancel
 * ```
 *
 * The task ID can be found by using the get tasks API.
 *
 * Cancellation should happen quickly but might take a few seconds.
 * The get task status API will continue to list the delete by query task until this task checks that it has been cancelled and terminates itself.
 */
export const DeleteByQueryRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`). To search all data streams or indices, omit this parameter or use `*` or `_all`.').meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  analyzer: z.string().describe('Analyzer to use for the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  analyze_wildcard: z.boolean().describe('If `true`, wildcard and prefix queries are analyzed. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  conflicts: z.lazy(() => Conflicts).describe('What to do if delete by query hits version conflicts: `abort` or `proceed`.').optional().meta({ found_in: 'query' }),
  default_operator: z.lazy(() => QueryDslOperator).describe('The default operator for query string query: `and` or `or`. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  df: z.string().describe('The field to use as default where no field prefix is given in the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. It supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  from: z.lazy(() => long).describe('Skips the specified number of documents.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  lenient: z.boolean().describe('If `true`, format-based query failures (such as providing text to a numeric field) in the query string will be ignored. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, Elasticsearch refreshes all shards involved in the delete by query after the request completes. This is different than the delete API\'s `refresh` parameter, which causes just the shard that received the delete request to be refreshed. Unlike the delete API, it does not support `wait_for`.').optional().meta({ found_in: 'query' }),
  request_cache: z.boolean().describe('If `true`, the request cache is used for this request. Defaults to the index-level setting.').optional().meta({ found_in: 'query' }),
  requests_per_second: z.lazy(() => float).describe('The throttle for this request in sub-requests per second.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  q: z.string().describe('A query in the Lucene query string syntax.').optional().meta({ found_in: 'query' }),
  scroll: z.lazy(() => Duration).describe('The period to retain the search context for scrolling.').optional().meta({ found_in: 'query' }),
  scroll_size: z.lazy(() => long).describe('The size of the scroll request that powers the operation.').optional().meta({ found_in: 'query' }),
  search_timeout: z.lazy(() => Duration).describe('The explicit timeout for each search request. It defaults to no timeout.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('The type of the search operation. Available options include `query_then_fetch` and `dfs_query_then_fetch`.').optional().meta({ found_in: 'query' }),
  slices: z.lazy(() => Slices).describe('The number of slices this task should be divided into.').optional().meta({ found_in: 'query' }),
  stats: z.array(z.string()).describe('The specific `tag` of the request for logging and statistical purposes.').optional().meta({ found_in: 'query' }),
  terminate_after: z.lazy(() => long).describe('The maximum number of documents to collect for each shard. If a query reaches this limit, Elasticsearch terminates the query early. Elasticsearch collects documents before sorting. Use with caution. Elasticsearch applies this parameter to each shard handling the request. When possible, let Elasticsearch perform early termination automatically. Avoid specifying this parameter for requests that target data streams with backing indices across multiple data tiers.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period each deletion request waits for active shards.').optional().meta({ found_in: 'query' }),
  version: z.boolean().describe('If `true`, returns the document version as part of a hit.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of shard copies that must be active before proceeding with the operation. Set to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The `timeout` value controls how long each write request waits for unavailable shards to become available.').optional().meta({ found_in: 'query' }),
  wait_for_completion: z.boolean().describe('If `true`, the request blocks until the operation is complete. If `false`, Elasticsearch performs some preflight checks, launches the request, and returns a task you can use to cancel or get the status of the task. Elasticsearch creates a record of this task as a document at `.tasks/task/{taskId}`. When you are done with a task, you should delete the task document so Elasticsearch can reclaim the space.').optional().meta({ found_in: 'query' }),
  max_docs: z.lazy(() => long).describe('The maximum number of documents to delete.').optional().meta({ found_in: 'body' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('The documents to delete specified with Query DSL.').optional().meta({ found_in: 'body' }),
  slice: z.lazy(() => SlicedScroll).describe('Slice the request manually using the provided slice ID and total number of slices.').optional().meta({ found_in: 'body' }),
  sort: z.lazy(() => Sort).describe('A sort object that specifies the order of deleted documents.').optional().meta({ found_in: 'body' })
}).meta({ id: 'DeleteByQueryRequest' })
export type DeleteByQueryRequest = z.infer<typeof DeleteByQueryRequest>

export const DeleteByQueryResponse = z.object({
  batches: z.lazy(() => long).describe('The number of scroll responses pulled back by the delete by query.').optional(),
  deleted: z.lazy(() => long).describe('The number of documents that were successfully deleted.').optional(),
  failures: z.array(z.lazy(() => BulkIndexByScrollFailure)).describe('An array of failures if there were any unrecoverable errors during the process. If this array is not empty, the request ended abnormally because of those failures. Delete by query is implemented using batches and any failures cause the entire process to end but all failures in the current batch are collected into the array. You can use the `conflicts` option to prevent reindex from ending on version conflicts.').optional(),
  noops: z.lazy(() => long).describe('This field is always equal to zero for delete by query. It exists only so that delete by query, update by query, and reindex APIs return responses with the same structure.').optional(),
  requests_per_second: z.lazy(() => float).describe('The number of requests per second effectively run during the delete by query.').optional(),
  retries: z.lazy(() => Retries).describe('The number of retries attempted by delete by query. `bulk` is the number of bulk actions retried. `search` is the number of search actions retried.').optional(),
  slice_id: z.lazy(() => integer).optional(),
  slices: z.array(z.lazy(() => ReindexStatus)).describe('Status of each slice if the delete by query was sliced').optional(),
  task: z.lazy(() => TaskId).optional(),
  throttled: z.lazy(() => Duration).optional(),
  throttled_millis: z.lazy(() => DurationValue).describe('The number of milliseconds the request slept to conform to `requests_per_second`.').optional(),
  throttled_until: z.lazy(() => Duration).optional(),
  throttled_until_millis: z.lazy(() => DurationValue).describe('This field should always be equal to zero in a `_delete_by_query` response. It has meaning only when using the task API, where it indicates the next time (in milliseconds since epoch) a throttled request will be run again in order to conform to `requests_per_second`.').optional(),
  timed_out: z.boolean().describe('If `true`, some requests run during the delete by query operation timed out.').optional(),
  took: z.lazy(() => DurationValue).describe('The number of milliseconds from start to end of the whole operation.').optional(),
  total: z.lazy(() => long).describe('The number of documents that were successfully processed.').optional(),
  version_conflicts: z.lazy(() => long).describe('The number of version conflicts that the delete by query hit.').optional()
}).meta({ id: 'DeleteByQueryResponse' })
export type DeleteByQueryResponse = z.infer<typeof DeleteByQueryResponse>

/**
 * Throttle a delete by query operation.
 *
 * Change the number of requests per second for a particular delete by query operation.
 * Rethrottling that speeds up the query takes effect immediately but rethrotting that slows down the query takes effect after completing the current batch to prevent scroll timeouts.
 */
export const DeleteByQueryRethrottleRequest = z.object({
  task_id: z.lazy(() => TaskId).describe('The ID for the task.').meta({ found_in: 'path' }),
  requests_per_second: z.lazy(() => float).describe('The throttle for this request in sub-requests per second. To disable throttling, set it to `-1`.').meta({ found_in: 'query' })
}).meta({ id: 'DeleteByQueryRethrottleRequest' })
export type DeleteByQueryRethrottleRequest = z.infer<typeof DeleteByQueryRethrottleRequest>

export const DeleteByQueryRethrottleResponse = z.lazy(() => TasksTaskListResponseBase).meta({ id: 'DeleteByQueryRethrottleResponse' })
export type DeleteByQueryRethrottleResponse = z.infer<typeof DeleteByQueryRethrottleResponse>

/**
 * Delete a script or search template.
 *
 * Deletes a stored script or search template.
 */
export const DeleteScriptRequest = z.object({
  id: z.lazy(() => Id).describe('The identifier for the stored script or search template.').meta({ found_in: 'path' }),
  master_timeout: z.lazy(() => Duration).describe('The period to wait for a connection to the master node. If no response is received before the timeout expires, the request fails and returns an error. It can also be set to `-1` to indicate that the request should never timeout.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error. It can also be set to `-1` to indicate that the request should never timeout.').optional().meta({ found_in: 'query' })
}).meta({ id: 'DeleteScriptRequest' })
export type DeleteScriptRequest = z.infer<typeof DeleteScriptRequest>

export const DeleteScriptResponse = z.lazy(() => AcknowledgedResponseBase).meta({ id: 'DeleteScriptResponse' })
export type DeleteScriptResponse = z.infer<typeof DeleteScriptResponse>

/**
 * Check a document.
 *
 * Verify that a document exists.
 * For example, check to see if a document with the `_id` 0 exists:
 *
 * ```
 * HEAD my-index-000001/_doc/0
 * ```
 *
 * If the document exists, the API returns a status code of `200 - OK`.
 * If the document doesn’t exist, the API returns `404 - Not Found`.
 *
 * **Versioning support**
 *
 * You can use the `version` parameter to check the document only if its current version is equal to the specified one.
 *
 * Internally, Elasticsearch has marked the old document as deleted and added an entirely new document.
 * The old version of the document doesn't disappear immediately, although you won't be able to access it.
 * Elasticsearch cleans up deleted documents in the background as you continue to index more data.
 */
export const ExistsRequest = z.object({
  id: z.lazy(() => Id).describe('A unique document identifier.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('A comma-separated list of data streams, indices, and aliases. It supports wildcards (`*`).').meta({ found_in: 'path' }),
  preference: z.string().describe('The node or shard the operation should be performed on. By default, the operation is randomized between the shard replicas. If it is set to `_local`, the operation will prefer to be run on a local allocated shard when possible. If it is set to a custom value, the value is used to guarantee that the same shards will be used for the same custom value. This can help with "jumping values" when hitting different shards in different refresh states. A sample value can be something like the web session ID or the user name.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If `true`, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, the request refreshes the relevant shards before retrieving the document. Setting it to `true` should be done after careful thought and verification that this does not cause a heavy load on the system (and slow down indexing).').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('Indicates whether to return the `_source` field (`true` or `false`) or lists the fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude from the response. You can also use this parameter to exclude fields from the subset specified in `_source_includes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response. If this parameter is specified, only these source fields are returned. You can exclude fields from this subset using the `_source_excludes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  stored_fields: z.lazy(() => Fields).describe('A comma-separated list of stored fields to return as part of a hit. If no fields are specified, no stored fields are included in the response. If this field is specified, the `_source` parameter defaults to `false`.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('Explicit version number for concurrency control. The specified version must match the current version of the document for the request to succeed.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' })
}).meta({ id: 'ExistsRequest' })
export type ExistsRequest = z.infer<typeof ExistsRequest>

export const ExistsResponse = z.boolean().meta({ id: 'ExistsResponse' })
export type ExistsResponse = z.infer<typeof ExistsResponse>

/**
 * Check for a document source.
 *
 * Check whether a document source exists in an index.
 * For example:
 *
 * ```
 * HEAD my-index-000001/_source/1
 * ```
 *
 * A document's source is not available if it is disabled in the mapping.
 */
export const ExistsSourceRequest = z.object({
  id: z.lazy(() => Id).describe('A unique identifier for the document.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('A comma-separated list of data streams, indices, and aliases. It supports wildcards (`*`).').meta({ found_in: 'path' }),
  preference: z.string().describe('The node or shard the operation should be performed on. By default, the operation is randomized between the shard replicas.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If `true`, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, the request refreshes the relevant shards before retrieving the document. Setting it to `true` should be done after careful thought and verification that this does not cause a heavy load on the system (and slow down indexing).').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('Indicates whether to return the `_source` field (`true` or `false`) or lists the fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude in the response.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('The version number for concurrency control. It must match the current version of the document for the request to succeed.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' })
}).meta({ id: 'ExistsSourceRequest' })
export type ExistsSourceRequest = z.infer<typeof ExistsSourceRequest>

export const ExistsSourceResponse = z.boolean().meta({ id: 'ExistsSourceResponse' })
export type ExistsSourceResponse = z.infer<typeof ExistsSourceResponse>

export interface ExplainExplanationDetailShape {
  description: string
  details?: ExplainExplanationDetailShape[] | undefined
  value: float
}
export const ExplainExplanationDetail = z.object({
  description: z.string(),
  get details () { return ExplainExplanationDetail.array().optional() },
  value: z.lazy(() => float)
}).meta({ id: 'ExplainExplanationDetail' })
export type ExplainExplanationDetail = z.infer<typeof ExplainExplanationDetail>

export const ExplainExplanation = z.object({
  description: z.string(),
  details: z.array(z.lazy(() => ExplainExplanationDetail)),
  value: z.lazy(() => float)
}).meta({ id: 'ExplainExplanation' })
export type ExplainExplanation = z.infer<typeof ExplainExplanation>

/**
 * Explain a document match result.
 *
 * Get information about why a specific document matches, or doesn't match, a query.
 * It computes a score explanation for a query and a specific document.
 */
export const ExplainRequest = z.object({
  id: z.lazy(() => Id).describe('The document identifier.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('Index names that are used to limit the request. Only a single index name can be provided to this parameter.').meta({ found_in: 'path' }),
  analyzer: z.string().describe('The analyzer to use for the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  analyze_wildcard: z.boolean().describe('If `true`, wildcard and prefix queries are analyzed. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  default_operator: z.lazy(() => QueryDslOperator).describe('The default operator for query string query: `and` or `or`. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  df: z.string().describe('The field to use as default where no field prefix is given in the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  lenient: z.boolean().describe('If `true`, format-based query failures (such as providing text to a numeric field) in the query string will be ignored. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('`True` or `false` to return the `_source` field or not or a list of fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude from the response. You can also use this parameter to exclude fields from the subset specified in `_source_includes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response. If this parameter is specified, only these source fields are returned. You can exclude fields from this subset using the `_source_excludes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  stored_fields: z.lazy(() => Fields).describe('A comma-separated list of stored fields to return in the response.').optional().meta({ found_in: 'query' }),
  q: z.string().describe('The query in the Lucene query string syntax.').optional().meta({ found_in: 'query' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('Defines the search definition using the Query DSL.').optional().meta({ found_in: 'body' })
}).meta({ id: 'ExplainRequest' })
export type ExplainRequest = z.infer<typeof ExplainRequest>

export const ExplainResponse = z.object({
  _index: z.lazy(() => IndexName),
  _id: z.lazy(() => Id),
  matched: z.boolean(),
  explanation: z.lazy(() => ExplainExplanationDetail).optional(),
  get: z.lazy(() => InlineGet).optional()
}).meta({ id: 'ExplainResponse' })
export type ExplainResponse = z.infer<typeof ExplainResponse>

export const FieldCapsFieldCapability = z.object({
  aggregatable: z.boolean().describe('Whether this field can be aggregated on all indices.'),
  indices: z.lazy(() => Indices).describe('The list of indices where this field has the same type family, or null if all indices have the same type family for the field.').optional(),
  meta: z.lazy(() => Metadata).describe('Merged metadata across all indices as a map of string keys to arrays of values. A value length of 1 indicates that all indices had the same value for this key, while a length of 2 or more indicates that not all indices had the same value for this key.').optional(),
  non_aggregatable_indices: z.lazy(() => Indices).describe('The list of indices where this field is not aggregatable, or null if all indices have the same definition for the field.').optional(),
  non_searchable_indices: z.lazy(() => Indices).describe('The list of indices where this field is not searchable, or null if all indices have the same definition for the field.').optional(),
  searchable: z.boolean().describe('Whether this field is indexed for search on all indices.'),
  type: z.string(),
  metadata_field: z.boolean().describe('Whether this field is registered as a metadata field.').optional(),
  time_series_dimension: z.boolean().describe('Whether this field is used as a time series dimension.').optional(),
  time_series_metric: z.lazy(() => MappingTimeSeriesMetricType).describe('Contains metric type if this fields is used as a time series metrics, absent if the field is not used as metric.').optional(),
  non_dimension_indices: z.array(z.lazy(() => IndexName)).describe('If this list is present in response then some indices have the field marked as a dimension and other indices, the ones in this list, do not.').optional(),
  metric_conflicts_indices: z.array(z.lazy(() => IndexName)).describe('The list of indices where this field is present if these indices don’t have the same `time_series_metric` value for this field.').optional()
}).meta({ id: 'FieldCapsFieldCapability' })
export type FieldCapsFieldCapability = z.infer<typeof FieldCapsFieldCapability>

/**
 * Get the field capabilities.
 *
 * Get information about the capabilities of fields among multiple indices.
 *
 * For data streams, the API returns field capabilities among the stream’s backing indices.
 * It returns runtime fields like any other field.
 * For example, a runtime field with a type of keyword is returned the same as any other field that belongs to the `keyword` family.
 */
export const FieldCapsRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases used to limit the request. Supports wildcards (*). To target all data streams and indices, omit this parameter or use * or _all.').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. Supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  include_unmapped: z.boolean().describe('If true, unmapped fields are included in the response.').optional().meta({ found_in: 'query' }),
  filters: z.union([z.string(), z.array(z.string())]).describe('A comma-separated list of filters to apply to the response.').optional().meta({ found_in: 'query' }),
  types: z.array(z.string()).describe('A comma-separated list of field types to include. Any fields that do not match one of these types will be excluded from the results. It defaults to empty, meaning that all field types are returned.').optional().meta({ found_in: 'query' }),
  include_empty_fields: z.boolean().describe('If false, empty fields are not included in the response.').optional().meta({ found_in: 'query' }),
  fields: z.lazy(() => Fields).describe('A list of fields to retrieve capabilities for. Wildcard (`*`) expressions are supported.').optional().meta({ found_in: 'body' }),
  index_filter: z.lazy(() => QueryDslQueryContainer).describe('Filter indices if the provided query rewrites to `match_none` on every shard. IMPORTANT: The filtering is done on a best-effort basis, it uses index statistics and mappings to rewrite queries to `match_none` instead of fully running the request. For instance a range query over a date field can rewrite to `match_none` if all documents within a shard (including deleted documents) are outside of the provided range. However, not all queries can rewrite to `match_none` so this API may return an index even if the provided filter matches no document.').optional().meta({ found_in: 'body' }),
  runtime_mappings: z.lazy(() => MappingRuntimeFields).describe('Define ad-hoc runtime fields in the request similar to the way it is done in search requests. These fields exist only as part of the query and take precedence over fields defined with the same name in the index mappings.').optional().meta({ found_in: 'body' })
}).meta({ id: 'FieldCapsRequest' })
export type FieldCapsRequest = z.infer<typeof FieldCapsRequest>

export const FieldCapsResponse = z.object({
  indices: z.lazy(() => Indices).describe('The list of indices where this field has the same type family, or null if all indices have the same type family for the field.'),
  fields: z.record(z.lazy(() => Field), z.record(z.string(), FieldCapsFieldCapability))
}).meta({ id: 'FieldCapsResponse' })
export type FieldCapsResponse = z.infer<typeof FieldCapsResponse>

export const GetGetResult = z.object({
  _index: z.lazy(() => IndexName).describe('The name of the index the document belongs to.'),
  fields: z.record(z.string(), z.any()).describe('If the `stored_fields` parameter is set to `true` and `found` is `true`, it contains the document fields stored in the index.').optional(),
  _ignored: z.array(z.string()).optional(),
  found: z.boolean().describe('Indicates whether the document exists.'),
  _id: z.lazy(() => Id).describe('The unique identifier for the document.'),
  _primary_term: z.lazy(() => long).describe('The primary term assigned to the document for the indexing operation.').optional(),
  _routing: z.string().describe('The explicit routing, if set.').optional(),
  _seq_no: z.lazy(() => SequenceNumber).describe('The sequence number assigned to the document for the indexing operation. Sequence numbers are used to ensure an older version of a document doesn\'t overwrite a newer version.').optional(),
  _source: z.any().describe('If `found` is `true`, it contains the document data formatted in JSON. If the `_source` parameter is set to `false` or the `stored_fields` parameter is set to `true`, it is excluded.').optional(),
  _version: z.lazy(() => VersionNumber).describe('The document version, which is ncremented each time the document is updated.').optional()
}).meta({ id: 'GetGetResult' })
export type GetGetResult = z.infer<typeof GetGetResult>

/**
 * Get a document by its ID.
 *
 * Get a document and its source or stored fields from an index.
 *
 * By default, this API is realtime and is not affected by the refresh rate of the index (when data will become visible for search).
 * In the case where stored fields are requested with the `stored_fields` parameter and the document has been updated but is not yet refreshed, the API will have to parse and analyze the source to extract the stored fields.
 * To turn off realtime behavior, set the `realtime` parameter to false.
 *
 * **Source filtering**
 *
 * By default, the API returns the contents of the `_source` field unless you have used the `stored_fields` parameter or the `_source` field is turned off.
 * You can turn off `_source` retrieval by using the `_source` parameter:
 *
 * ```
 * GET my-index-000001/_doc/0?_source=false
 * ```
 *
 * If you only need one or two fields from the `_source`, use the `_source_includes` or `_source_excludes` parameters to include or filter out particular fields.
 * This can be helpful with large documents where partial retrieval can save on network overhead
 * Both parameters take a comma separated list of fields or wildcard expressions.
 * For example:
 *
 * ```
 * GET my-index-000001/_doc/0?_source_includes=*.id&_source_excludes=entities
 * ```
 *
 * If you only want to specify includes, you can use a shorter notation:
 *
 * ```
 * GET my-index-000001/_doc/0?_source=*.id
 * ```
 *
 * **Routing**
 *
 * If routing is used during indexing, the routing value also needs to be specified to retrieve a document.
 * For example:
 *
 * ```
 * GET my-index-000001/_doc/2?routing=user1
 * ```
 *
 * This request gets the document with ID 2, but it is routed based on the user.
 * The document is not fetched if the correct routing is not specified.
 *
 * **Distributed**
 *
 * The GET operation is hashed into a specific shard ID.
 * It is then redirected to one of the replicas within that shard ID and returns the result.
 * The replicas are the primary shard and its replicas within that shard ID group.
 * This means that the more replicas you have, the better your GET scaling will be.
 *
 * **Versioning support**
 *
 * You can use the `version` parameter to retrieve the document only if its current version is equal to the specified one.
 *
 * Internally, Elasticsearch has marked the old document as deleted and added an entirely new document.
 * The old version of the document doesn't disappear immediately, although you won't be able to access it.
 * Elasticsearch cleans up deleted documents in the background as you continue to index more data.
 */
export const GetRequest = z.object({
  id: z.lazy(() => Id).describe('A unique document identifier.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('The name of the index that contains the document.').meta({ found_in: 'path' }),
  preference: z.string().describe('The node or shard the operation should be performed on. By default, the operation is randomized between the shard replicas. If it is set to `_local`, the operation will prefer to be run on a local allocated shard when possible. If it is set to a custom value, the value is used to guarantee that the same shards will be used for the same custom value. This can help with "jumping values" when hitting different shards in different refresh states. A sample value can be something like the web session ID or the user name.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If `true`, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, the request refreshes the relevant shards before retrieving the document. Setting it to `true` should be done after careful thought and verification that this does not cause a heavy load on the system (and slow down indexing).').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('Indicates whether to return the `_source` field (`true` or `false`) or lists the fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude from the response. You can also use this parameter to exclude fields from the subset specified in `_source_includes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  _source_exclude_vectors: z.boolean().describe('Whether vectors should be excluded from _source').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response. If this parameter is specified, only these source fields are returned. You can exclude fields from this subset using the `_source_excludes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  stored_fields: z.lazy(() => Fields).describe('A comma-separated list of stored fields to return as part of a hit. If no fields are specified, no stored fields are included in the response. If this field is specified, the `_source` parameter defaults to `false`. Only leaf fields can be retrieved with the `stored_fields` option. Object fields can\'t be returned; if specified, the request fails.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('The version number for concurrency control. It must match the current version of the document for the request to succeed.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' })
}).meta({ id: 'GetRequest' })
export type GetRequest = z.infer<typeof GetRequest>

export const GetResponse = GetGetResult.meta({ id: 'GetResponse' })
export type GetResponse = z.infer<typeof GetResponse>

/**
 * Get a script or search template.
 *
 * Retrieves a stored script or search template.
 */
export const GetScriptRequest = z.object({
  id: z.lazy(() => Id).describe('The identifier for the stored script or search template.').meta({ found_in: 'path' }),
  master_timeout: z.lazy(() => Duration).describe('The period to wait for the master node. If the master node is not available before the timeout expires, the request fails and returns an error. It can also be set to `-1` to indicate that the request should never timeout.').optional().meta({ found_in: 'query' })
}).meta({ id: 'GetScriptRequest' })
export type GetScriptRequest = z.infer<typeof GetScriptRequest>

export const GetScriptResponse = z.object({
  _id: z.lazy(() => Id),
  found: z.boolean(),
  script: z.lazy(() => StoredScript).optional()
}).meta({ id: 'GetScriptResponse' })
export type GetScriptResponse = z.infer<typeof GetScriptResponse>

export const GetScriptContextContextMethodParam = z.object({
  name: z.lazy(() => Name),
  type: z.string()
}).meta({ id: 'GetScriptContextContextMethodParam' })
export type GetScriptContextContextMethodParam = z.infer<typeof GetScriptContextContextMethodParam>

export const GetScriptContextContextMethod = z.object({
  name: z.lazy(() => Name),
  return_type: z.string(),
  params: z.array(GetScriptContextContextMethodParam)
}).meta({ id: 'GetScriptContextContextMethod' })
export type GetScriptContextContextMethod = z.infer<typeof GetScriptContextContextMethod>

export const GetScriptContextContext = z.object({
  methods: z.array(GetScriptContextContextMethod),
  name: z.lazy(() => Name)
}).meta({ id: 'GetScriptContextContext' })
export type GetScriptContextContext = z.infer<typeof GetScriptContextContext>

/**
 * Get script contexts.
 *
 * Get a list of supported script contexts and their methods.
 */
export const GetScriptContextRequest = z.object({
}).meta({ id: 'GetScriptContextRequest' })
export type GetScriptContextRequest = z.infer<typeof GetScriptContextRequest>

export const GetScriptContextResponse = z.object({
  contexts: z.array(GetScriptContextContext)
}).meta({ id: 'GetScriptContextResponse' })
export type GetScriptContextResponse = z.infer<typeof GetScriptContextResponse>

export const GetScriptLanguagesLanguageContext = z.object({
  contexts: z.array(z.string()),
  language: z.lazy(() => ScriptLanguage)
}).meta({ id: 'GetScriptLanguagesLanguageContext' })
export type GetScriptLanguagesLanguageContext = z.infer<typeof GetScriptLanguagesLanguageContext>

/**
 * Get script languages.
 *
 * Get a list of available script types, languages, and contexts.
 */
export const GetScriptLanguagesRequest = z.object({
}).meta({ id: 'GetScriptLanguagesRequest' })
export type GetScriptLanguagesRequest = z.infer<typeof GetScriptLanguagesRequest>

export const GetScriptLanguagesResponse = z.object({
  language_contexts: z.array(GetScriptLanguagesLanguageContext),
  types_allowed: z.array(z.string())
}).meta({ id: 'GetScriptLanguagesResponse' })
export type GetScriptLanguagesResponse = z.infer<typeof GetScriptLanguagesResponse>

/**
 * Get a document's source.
 *
 * Get the source of a document.
 * For example:
 *
 * ```
 * GET my-index-000001/_source/1
 * ```
 *
 * You can use the source filtering parameters to control which parts of the `_source` are returned:
 *
 * ```
 * GET my-index-000001/_source/1/?_source_includes=*.id&_source_excludes=entities
 * ```
 */
export const GetSourceRequest = z.object({
  id: z.lazy(() => Id).describe('A unique document identifier.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('The name of the index that contains the document.').meta({ found_in: 'path' }),
  preference: z.string().describe('The node or shard the operation should be performed on. By default, the operation is randomized between the shard replicas.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If `true`, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, the request refreshes the relevant shards before retrieving the document. Setting it to `true` should be done after careful thought and verification that this does not cause a heavy load on the system (and slow down indexing).').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('Indicates whether to return the `_source` field (`true` or `false`) or lists the fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude in the response.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('The version number for concurrency control. It must match the current version of the document for the request to succeed.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' })
}).meta({ id: 'GetSourceRequest' })
export type GetSourceRequest = z.infer<typeof GetSourceRequest>

export const GetSourceResponse = z.any().meta({ id: 'GetSourceResponse' })
export type GetSourceResponse = z.infer<typeof GetSourceResponse>

export const HealthReportIndicatorHealthStatus = z.enum(['green', 'yellow', 'red', 'unknown', 'unavailable']).meta({ id: 'HealthReportIndicatorHealthStatus' })
export type HealthReportIndicatorHealthStatus = z.infer<typeof HealthReportIndicatorHealthStatus>

export const HealthReportImpactArea = z.enum(['search', 'ingest', 'backup', 'deployment_management']).meta({ id: 'HealthReportImpactArea' })
export type HealthReportImpactArea = z.infer<typeof HealthReportImpactArea>

export const HealthReportImpact = z.object({
  description: z.string(),
  id: z.string(),
  impact_areas: z.array(HealthReportImpactArea),
  severity: z.lazy(() => integer)
}).meta({ id: 'HealthReportImpact' })
export type HealthReportImpact = z.infer<typeof HealthReportImpact>

export const HealthReportIndicatorNode = z.object({
  name: z.union([z.string(), z.null()]),
  node_id: z.union([z.string(), z.null()])
}).meta({ id: 'HealthReportIndicatorNode' })
export type HealthReportIndicatorNode = z.infer<typeof HealthReportIndicatorNode>

export const HealthReportDiagnosisAffectedResources = z.object({
  indices: z.lazy(() => Indices).optional(),
  nodes: z.array(HealthReportIndicatorNode).optional(),
  slm_policies: z.array(z.string()).optional(),
  feature_states: z.array(z.string()).optional(),
  snapshot_repositories: z.array(z.string()).optional()
}).meta({ id: 'HealthReportDiagnosisAffectedResources' })
export type HealthReportDiagnosisAffectedResources = z.infer<typeof HealthReportDiagnosisAffectedResources>

export const HealthReportDiagnosis = z.object({
  id: z.string(),
  action: z.string(),
  affected_resources: HealthReportDiagnosisAffectedResources,
  cause: z.string(),
  help_url: z.string()
}).meta({ id: 'HealthReportDiagnosis' })
export type HealthReportDiagnosis = z.infer<typeof HealthReportDiagnosis>

export const HealthReportBaseIndicator = z.object({
  status: HealthReportIndicatorHealthStatus,
  symptom: z.string(),
  impacts: z.array(HealthReportImpact).optional(),
  diagnosis: z.array(HealthReportDiagnosis).optional()
}).meta({ id: 'HealthReportBaseIndicator' })
export type HealthReportBaseIndicator = z.infer<typeof HealthReportBaseIndicator>

export const HealthReportStagnatingBackingIndices = z.object({
  index_name: z.lazy(() => IndexName),
  first_occurrence_timestamp: z.lazy(() => long),
  retry_count: z.lazy(() => integer)
}).meta({ id: 'HealthReportStagnatingBackingIndices' })
export type HealthReportStagnatingBackingIndices = z.infer<typeof HealthReportStagnatingBackingIndices>

export const HealthReportDataStreamLifecycleDetails = z.object({
  stagnating_backing_indices_count: z.lazy(() => integer),
  total_backing_indices_in_error: z.lazy(() => integer),
  stagnating_backing_indices: z.array(HealthReportStagnatingBackingIndices).optional()
}).meta({ id: 'HealthReportDataStreamLifecycleDetails' })
export type HealthReportDataStreamLifecycleDetails = z.infer<typeof HealthReportDataStreamLifecycleDetails>

/** DATA_STREAM_LIFECYCLE */
export const HealthReportDataStreamLifecycleIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportDataStreamLifecycleDetails.optional()
}).meta({ id: 'HealthReportDataStreamLifecycleIndicator' })
export type HealthReportDataStreamLifecycleIndicator = z.infer<typeof HealthReportDataStreamLifecycleIndicator>

export const HealthReportDiskIndicatorDetails = z.object({
  indices_with_readonly_block: z.lazy(() => long),
  nodes_with_enough_disk_space: z.lazy(() => long),
  nodes_over_high_watermark: z.lazy(() => long),
  nodes_over_flood_stage_watermark: z.lazy(() => long),
  nodes_with_unknown_disk_status: z.lazy(() => long)
}).meta({ id: 'HealthReportDiskIndicatorDetails' })
export type HealthReportDiskIndicatorDetails = z.infer<typeof HealthReportDiskIndicatorDetails>

/** DISK */
export const HealthReportDiskIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportDiskIndicatorDetails.optional()
}).meta({ id: 'HealthReportDiskIndicator' })
export type HealthReportDiskIndicator = z.infer<typeof HealthReportDiskIndicator>

export const HealthReportFileSettingsIndicatorDetails = z.object({
  failure_streak: z.lazy(() => long),
  most_recent_failure: z.string()
}).meta({ id: 'HealthReportFileSettingsIndicatorDetails' })
export type HealthReportFileSettingsIndicatorDetails = z.infer<typeof HealthReportFileSettingsIndicatorDetails>

/** FILE_SETTINGS */
export const HealthReportFileSettingsIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportFileSettingsIndicatorDetails.optional()
}).meta({ id: 'HealthReportFileSettingsIndicator' })
export type HealthReportFileSettingsIndicator = z.infer<typeof HealthReportFileSettingsIndicator>

export const HealthReportIlmIndicatorDetails = z.object({
  ilm_status: z.lazy(() => LifecycleOperationMode),
  policies: z.lazy(() => long),
  stagnating_indices: z.lazy(() => integer)
}).meta({ id: 'HealthReportIlmIndicatorDetails' })
export type HealthReportIlmIndicatorDetails = z.infer<typeof HealthReportIlmIndicatorDetails>

/** ILM */
export const HealthReportIlmIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportIlmIndicatorDetails.optional()
}).meta({ id: 'HealthReportIlmIndicator' })
export type HealthReportIlmIndicator = z.infer<typeof HealthReportIlmIndicator>

export const HealthReportMasterIsStableIndicatorExceptionFetchingHistory = z.object({
  message: z.string(),
  stack_trace: z.string()
}).meta({ id: 'HealthReportMasterIsStableIndicatorExceptionFetchingHistory' })
export type HealthReportMasterIsStableIndicatorExceptionFetchingHistory = z.infer<typeof HealthReportMasterIsStableIndicatorExceptionFetchingHistory>

export const HealthReportMasterIsStableIndicatorClusterFormationNode = z.object({
  name: z.string().optional(),
  node_id: z.string(),
  cluster_formation_message: z.string()
}).meta({ id: 'HealthReportMasterIsStableIndicatorClusterFormationNode' })
export type HealthReportMasterIsStableIndicatorClusterFormationNode = z.infer<typeof HealthReportMasterIsStableIndicatorClusterFormationNode>

export const HealthReportMasterIsStableIndicatorDetails = z.object({
  current_master: HealthReportIndicatorNode,
  recent_masters: z.array(HealthReportIndicatorNode),
  exception_fetching_history: HealthReportMasterIsStableIndicatorExceptionFetchingHistory.optional(),
  cluster_formation: z.array(HealthReportMasterIsStableIndicatorClusterFormationNode).optional()
}).meta({ id: 'HealthReportMasterIsStableIndicatorDetails' })
export type HealthReportMasterIsStableIndicatorDetails = z.infer<typeof HealthReportMasterIsStableIndicatorDetails>

/** MASTER_IS_STABLE */
export const HealthReportMasterIsStableIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportMasterIsStableIndicatorDetails.optional()
}).meta({ id: 'HealthReportMasterIsStableIndicator' })
export type HealthReportMasterIsStableIndicator = z.infer<typeof HealthReportMasterIsStableIndicator>

export const HealthReportShardsAvailabilityIndicatorDetails = z.object({
  creating_primaries: z.lazy(() => long),
  creating_replicas: z.lazy(() => long),
  initializing_primaries: z.lazy(() => long),
  initializing_replicas: z.lazy(() => long),
  restarting_primaries: z.lazy(() => long),
  restarting_replicas: z.lazy(() => long),
  started_primaries: z.lazy(() => long),
  started_replicas: z.lazy(() => long),
  unassigned_primaries: z.lazy(() => long),
  unassigned_replicas: z.lazy(() => long)
}).meta({ id: 'HealthReportShardsAvailabilityIndicatorDetails' })
export type HealthReportShardsAvailabilityIndicatorDetails = z.infer<typeof HealthReportShardsAvailabilityIndicatorDetails>

/** SHARDS_AVAILABILITY */
export const HealthReportShardsAvailabilityIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportShardsAvailabilityIndicatorDetails.optional()
}).meta({ id: 'HealthReportShardsAvailabilityIndicator' })
export type HealthReportShardsAvailabilityIndicator = z.infer<typeof HealthReportShardsAvailabilityIndicator>

export const HealthReportRepositoryIntegrityIndicatorDetails = z.object({
  total_repositories: z.lazy(() => long).optional(),
  corrupted_repositories: z.lazy(() => long).optional(),
  corrupted: z.array(z.string()).optional()
}).meta({ id: 'HealthReportRepositoryIntegrityIndicatorDetails' })
export type HealthReportRepositoryIntegrityIndicatorDetails = z.infer<typeof HealthReportRepositoryIntegrityIndicatorDetails>

/** REPOSITORY_INTEGRITY */
export const HealthReportRepositoryIntegrityIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportRepositoryIntegrityIndicatorDetails.optional()
}).meta({ id: 'HealthReportRepositoryIntegrityIndicator' })
export type HealthReportRepositoryIntegrityIndicator = z.infer<typeof HealthReportRepositoryIntegrityIndicator>

export const HealthReportSlmIndicatorUnhealthyPolicies = z.object({
  count: z.lazy(() => long),
  invocations_since_last_success: z.record(z.string(), z.lazy(() => long)).optional()
}).meta({ id: 'HealthReportSlmIndicatorUnhealthyPolicies' })
export type HealthReportSlmIndicatorUnhealthyPolicies = z.infer<typeof HealthReportSlmIndicatorUnhealthyPolicies>

export const HealthReportSlmIndicatorDetails = z.object({
  slm_status: z.lazy(() => LifecycleOperationMode),
  policies: z.lazy(() => long),
  unhealthy_policies: HealthReportSlmIndicatorUnhealthyPolicies.optional()
}).meta({ id: 'HealthReportSlmIndicatorDetails' })
export type HealthReportSlmIndicatorDetails = z.infer<typeof HealthReportSlmIndicatorDetails>

/** SLM */
export const HealthReportSlmIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportSlmIndicatorDetails.optional()
}).meta({ id: 'HealthReportSlmIndicator' })
export type HealthReportSlmIndicator = z.infer<typeof HealthReportSlmIndicator>

export const HealthReportShardsCapacityIndicatorTierDetail = z.object({
  max_shards_in_cluster: z.lazy(() => integer),
  current_used_shards: z.lazy(() => integer).optional()
}).meta({ id: 'HealthReportShardsCapacityIndicatorTierDetail' })
export type HealthReportShardsCapacityIndicatorTierDetail = z.infer<typeof HealthReportShardsCapacityIndicatorTierDetail>

export const HealthReportShardsCapacityIndicatorDetails = z.object({
  data: HealthReportShardsCapacityIndicatorTierDetail,
  frozen: HealthReportShardsCapacityIndicatorTierDetail
}).meta({ id: 'HealthReportShardsCapacityIndicatorDetails' })
export type HealthReportShardsCapacityIndicatorDetails = z.infer<typeof HealthReportShardsCapacityIndicatorDetails>

/** SHARDS_CAPACITY */
export const HealthReportShardsCapacityIndicator = z.object({
  ...HealthReportBaseIndicator.shape,
  details: HealthReportShardsCapacityIndicatorDetails.optional()
}).meta({ id: 'HealthReportShardsCapacityIndicator' })
export type HealthReportShardsCapacityIndicator = z.infer<typeof HealthReportShardsCapacityIndicator>

export const HealthReportIndicators = z.object({
  master_is_stable: HealthReportMasterIsStableIndicator.optional(),
  shards_availability: HealthReportShardsAvailabilityIndicator.optional(),
  disk: HealthReportDiskIndicator.optional(),
  repository_integrity: HealthReportRepositoryIntegrityIndicator.optional(),
  data_stream_lifecycle: HealthReportDataStreamLifecycleIndicator.optional(),
  ilm: HealthReportIlmIndicator.optional(),
  slm: HealthReportSlmIndicator.optional(),
  shards_capacity: HealthReportShardsCapacityIndicator.optional(),
  file_settings: HealthReportFileSettingsIndicator.optional()
}).meta({ id: 'HealthReportIndicators' })
export type HealthReportIndicators = z.infer<typeof HealthReportIndicators>

/**
 * Get the cluster health.
 *
 * Get a report with the health status of an Elasticsearch cluster.
 * The report contains a list of indicators that compose Elasticsearch functionality.
 *
 * Each indicator has a health status of: green, unknown, yellow or red.
 * The indicator will provide an explanation and metadata describing the reason for its current health status.
 *
 * The cluster’s status is controlled by the worst indicator status.
 *
 * In the event that an indicator’s status is non-green, a list of impacts may be present in the indicator result which detail the functionalities that are negatively affected by the health issue.
 * Each impact carries with it a severity level, an area of the system that is affected, and a simple description of the impact on the system.
 *
 * Some health indicators can determine the root cause of a health problem and prescribe a set of steps that can be performed in order to improve the health of the system.
 * The root cause and remediation steps are encapsulated in a diagnosis.
 * A diagnosis contains a cause detailing a root cause analysis, an action containing a brief description of the steps to take to fix the problem, the list of affected resources (if applicable), and a detailed step-by-step troubleshooting guide to fix the diagnosed problem.
 *
 * NOTE: The health indicators perform root cause analysis of non-green health statuses. This can be computationally expensive when called frequently.
 * When setting up automated polling of the API for health status, set verbose to false to disable the more expensive analysis logic.
 */
export const HealthReportRequest = z.object({
  feature: z.union([z.string(), z.array(z.string())]).describe('A feature of the cluster, as returned by the top-level health report API.').optional().meta({ found_in: 'path' }),
  timeout: z.lazy(() => Duration).describe('Explicit operation timeout.').optional().meta({ found_in: 'query' }),
  verbose: z.boolean().describe('Opt-in for more information about the health of the system.').optional().meta({ found_in: 'query' }),
  size: z.lazy(() => integer).describe('Limit the number of affected resources the health report API returns.').optional().meta({ found_in: 'query' })
}).meta({ id: 'HealthReportRequest' })
export type HealthReportRequest = z.infer<typeof HealthReportRequest>

export const HealthReportResponse = z.object({
  cluster_name: z.string(),
  indicators: HealthReportIndicators,
  status: HealthReportIndicatorHealthStatus.optional()
}).meta({ id: 'HealthReportResponse' })
export type HealthReportResponse = z.infer<typeof HealthReportResponse>

/**
 * Create or update a document in an index.
 *
 * Add a JSON document to the specified data stream or index and make it searchable.
 * If the target is an index and the document already exists, the request updates the document and increments its version.
 *
 * NOTE: You cannot use this API to send update requests for existing documents in a data stream.
 *
 * If the Elasticsearch security features are enabled, you must have the following index privileges for the target data stream, index, or index alias:
 *
 * * To add or overwrite a document using the `PUT /<target>/_doc/<_id>` request format, you must have the `create`, `index`, or `write` index privilege.
 * * To add a document using the `POST /<target>/_doc/` request format, you must have the `create_doc`, `create`, `index`, or `write` index privilege.
 * * To automatically create a data stream or index with this API request, you must have the `auto_configure`, `create_index`, or `manage` index privilege.
 *
 * Automatic data stream creation requires a matching index template with data stream enabled.
 *
 * NOTE: Replica shards might not all be started when an indexing operation returns successfully.
 * By default, only the primary is required. Set `wait_for_active_shards` to change this default behavior.
 *
 * **Automatically create data streams and indices**
 *
 * If the request's target doesn't exist and matches an index template with a `data_stream` definition, the index operation automatically creates the data stream.
 *
 * If the target doesn't exist and doesn't match a data stream template, the operation automatically creates the index and applies any matching index templates.
 *
 * NOTE: Elasticsearch includes several built-in index templates. To avoid naming collisions with these templates, refer to index pattern documentation.
 *
 * If no mapping exists, the index operation creates a dynamic mapping.
 * By default, new fields and objects are automatically added to the mapping if needed.
 *
 * Automatic index creation is controlled by the `action.auto_create_index` setting.
 * If it is `true`, any index can be created automatically.
 * You can modify this setting to explicitly allow or block automatic creation of indices that match specified patterns or set it to `false` to turn off automatic index creation entirely.
 * Specify a comma-separated list of patterns you want to allow or prefix each pattern with `+` or `-` to indicate whether it should be allowed or blocked.
 * When a list is specified, the default behaviour is to disallow.
 *
 * NOTE: The `action.auto_create_index` setting affects the automatic creation of indices only.
 * It does not affect the creation of data streams.
 *
 * **Optimistic concurrency control**
 *
 * Index operations can be made conditional and only be performed if the last modification to the document was assigned the sequence number and primary term specified by the `if_seq_no` and `if_primary_term` parameters.
 * If a mismatch is detected, the operation will result in a `VersionConflictException` and a status code of `409`.
 *
 * **Routing**
 *
 * By default, shard placement—or routing—is controlled by using a hash of the document's ID value.
 * For more explicit control, the value fed into the hash function used by the router can be directly specified on a per-operation basis using the `routing` parameter.
 *
 * When setting up explicit mapping, you can also use the `_routing` field to direct the index operation to extract the routing value from the document itself.
 * This does come at the (very minimal) cost of an additional document parsing pass.
 * If the `_routing` mapping is defined and set to be required, the index operation will fail if no routing value is provided or extracted.
 *
 * NOTE: Data streams do not support custom routing unless they were created with the `allow_custom_routing` setting enabled in the template.
 *
 * **Distributed**
 *
 * The index operation is directed to the primary shard based on its route and performed on the actual node containing this shard.
 * After the primary shard completes the operation, if needed, the update is distributed to applicable replicas.
 *
 * **Active shards**
 *
 * To improve the resiliency of writes to the system, indexing operations can be configured to wait for a certain number of active shard copies before proceeding with the operation.
 * If the requisite number of active shard copies are not available, then the write operation must wait and retry, until either the requisite shard copies have started or a timeout occurs.
 * By default, write operations only wait for the primary shards to be active before proceeding (that is to say `wait_for_active_shards` is `1`).
 * This default can be overridden in the index settings dynamically by setting `index.write.wait_for_active_shards`.
 * To alter this behavior per operation, use the `wait_for_active_shards request` parameter.
 *
 * Valid values are all or any positive integer up to the total number of configured copies per shard in the index (which is `number_of_replicas`+1).
 * Specifying a negative value or a number greater than the number of shard copies will throw an error.
 *
 * For example, suppose you have a cluster of three nodes, A, B, and C and you create an index index with the number of replicas set to 3 (resulting in 4 shard copies, one more copy than there are nodes).
 * If you attempt an indexing operation, by default the operation will only ensure the primary copy of each shard is available before proceeding.
 * This means that even if B and C went down and A hosted the primary shard copies, the indexing operation would still proceed with only one copy of the data.
 * If `wait_for_active_shards` is set on the request to `3` (and all three nodes are up), the indexing operation will require 3 active shard copies before proceeding.
 * This requirement should be met because there are 3 active nodes in the cluster, each one holding a copy of the shard.
 * However, if you set `wait_for_active_shards` to `all` (or to `4`, which is the same in this situation), the indexing operation will not proceed as you do not have all 4 copies of each shard active in the index.
 * The operation will timeout unless a new node is brought up in the cluster to host the fourth copy of the shard.
 *
 * It is important to note that this setting greatly reduces the chances of the write operation not writing to the requisite number of shard copies, but it does not completely eliminate the possibility, because this check occurs before the write operation starts.
 * After the write operation is underway, it is still possible for replication to fail on any number of shard copies but still succeed on the primary.
 * The `_shards` section of the API response reveals the number of shard copies on which replication succeeded and failed.
 *
 * **No operation (noop) updates**
 *
 * When updating a document by using this API, a new version of the document is always created even if the document hasn't changed.
 * If this isn't acceptable use the `_update` API with `detect_noop` set to `true`.
 * The `detect_noop` option isn't available on this API because it doesn’t fetch the old source and isn't able to compare it against the new source.
 *
 * There isn't a definitive rule for when noop updates aren't acceptable.
 * It's a combination of lots of factors like how frequently your data source sends updates that are actually noops and how many queries per second Elasticsearch runs on the shard receiving the updates.
 *
 * **Versioning**
 *
 * Each indexed document is given a version number.
 * By default, internal versioning is used that starts at 1 and increments with each update, deletes included.
 * Optionally, the version number can be set to an external value (for example, if maintained in a database).
 * To enable this functionality, `version_type` should be set to `external`.
 * The value provided must be a numeric, long value greater than or equal to 0, and less than around `9.2e+18`.
 *
 * NOTE: Versioning is completely real time, and is not affected by the near real time aspects of search operations.
 * If no version is provided, the operation runs without any version checks.
 *
 * When using the external version type, the system checks to see if the version number passed to the index request is greater than the version of the currently stored document.
 * If true, the document will be indexed and the new version number used.
 * If the value provided is less than or equal to the stored document's version number, a version conflict will occur and the index operation will fail. For example:
 *
 * ```
 * PUT my-index-000001/_doc/1?version=2&version_type=external
 * {
 *   "user": {
 *     "id": "elkbee"
 *   }
 * }
 * ```
 *
 * In this example, the operation will succeed since the supplied version of 2 is higher than the current document version of 1.
 * If the document was already updated and its version was set to 2 or higher, the indexing command will fail and result in a conflict (409 HTTP status code).
 *
 * A nice side effect is that there is no need to maintain strict ordering of async indexing operations run as a result of changes to a source database, as long as version numbers from the source database are used.
 * Even the simple case of updating the Elasticsearch index using data from a database is simplified if external versioning is used, as only the latest version will be used if the index operations arrive out of order.
 */
export const IndexRequest = z.object({
  id: z.lazy(() => Id).describe('A unique identifier for the document. To automatically generate a document ID, use the `POST /<target>/_doc/` request format and omit this parameter.').optional().meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('The name of the data stream or index to target. If the target doesn\'t exist and matches the name or wildcard (`*`) pattern of an index template with a `data_stream` definition, this request creates the data stream. If the target doesn\'t exist and doesn\'t match a data stream template, this request creates the index. You can check for existing targets with the resolve index API.').meta({ found_in: 'path' }),
  if_primary_term: z.lazy(() => long).describe('Only perform the operation if the document has this primary term.').optional().meta({ found_in: 'query' }),
  if_seq_no: z.lazy(() => SequenceNumber).describe('Only perform the operation if the document has this sequence number.').optional().meta({ found_in: 'query' }),
  include_source_on_error: z.boolean().describe('True or false if to include the document source in the error message in case of parsing errors.').optional().meta({ found_in: 'query' }),
  op_type: z.lazy(() => OpType).describe('Set to `create` to only index the document if it does not already exist (put if absent). If a document with the specified `_id` already exists, the indexing operation will fail. The behavior is the same as using the `<index>/_create` endpoint. If a document ID is specified, this paramater defaults to `index`. Otherwise, it defaults to `create`. If the request targets a data stream, an `op_type` of `create` is required.').optional().meta({ found_in: 'query' }),
  pipeline: z.string().describe('The ID of the pipeline to use to preprocess incoming documents. If the index has a default ingest pipeline specified, then setting the value to `_none` disables the default ingest pipeline for this request. If a final pipeline is configured it will always run, regardless of the value of this parameter.').optional().meta({ found_in: 'query' }),
  refresh: z.lazy(() => Refresh).describe('If `true`, Elasticsearch refreshes the affected shards to make this operation visible to search. If `wait_for`, it waits for a refresh to make this operation visible to search. If `false`, it does nothing with refreshes.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value that is used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period the request waits for the following operations: automatic index creation, dynamic mapping updates, waiting for active shards. This parameter is useful for situations where the primary shard assigned to perform the operation might not be available when the operation runs. Some reasons for this might be that the primary shard is currently recovering from a gateway or undergoing relocation. By default, the operation will wait on the primary shard to become available for at least 1 minute before failing and responding with an error. The actual wait time could be longer, particularly when multiple waits occur.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('An explicit version number for concurrency control. It must be a non-negative long number.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of shard copies that must be active before proceeding with the operation. You can set it to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The default value of `1` means it waits for each primary shard to be active.').optional().meta({ found_in: 'query' }),
  require_alias: z.boolean().describe('If `true`, the destination must be an index alias.').optional().meta({ found_in: 'query' }),
  require_data_stream: z.boolean().describe('If `true`, the request\'s actions must target a data stream (existing or to be created).').optional().meta({ found_in: 'query' }),
  document: z.any().optional().meta({ found_in: 'body' })
}).meta({ id: 'IndexRequest' })
export type IndexRequest = z.infer<typeof IndexRequest>

export const IndexResponse = z.lazy(() => WriteResponseBase).meta({ id: 'IndexResponse' })
export type IndexResponse = z.infer<typeof IndexResponse>

/**
 * Get cluster info.
 *
 * Get basic build, version, and cluster information.
 * ::: In Serverless, this API is retained for backward compatibility only. Some response fields, such as the version number, should be ignored.
 */
export const InfoRequest = z.object({
}).meta({ id: 'InfoRequest' })
export type InfoRequest = z.infer<typeof InfoRequest>

export const InfoResponse = z.object({
  cluster_name: z.lazy(() => Name).describe('The responding cluster\'s name.'),
  cluster_uuid: z.lazy(() => Uuid),
  name: z.lazy(() => Name).describe('The responding node\'s name.'),
  tagline: z.string(),
  version: z.lazy(() => ElasticsearchVersionInfo).describe('The running version of Elasticsearch.')
}).meta({ id: 'InfoResponse' })
export type InfoResponse = z.infer<typeof InfoResponse>

export const KnnSearchKnnSearchQuery = z.object({
  field: z.lazy(() => Field).describe('The name of the vector field to search against'),
  query_vector: z.lazy(() => QueryVector).describe('The query vector'),
  k: z.lazy(() => integer).describe('The final number of nearest neighbors to return as top hits'),
  num_candidates: z.lazy(() => integer).describe('The number of nearest neighbor candidates to consider per shard')
}).meta({ id: 'KnnSearchKnnSearchQuery' })
export type KnnSearchKnnSearchQuery = z.infer<typeof KnnSearchKnnSearchQuery>

/**
 * Run a knn search.
 *
 * NOTE: The kNN search API has been replaced by the `knn` option in the search API.
 * @deprecated The kNN search API has been replaced by the `knn` option in the search API.
 */
export const KnnSearchRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of index names to search; use `_all` or to perform the operation on all indices.').meta({ found_in: 'path' }),
  routing: z.lazy(() => Routing).describe('A comma-separated list of specific routing values.').optional().meta({ found_in: 'query' }),
  _source: z.lazy(() => SearchSourceConfig).describe('Indicates which source fields are returned for matching documents. These fields are returned in the `hits._source` property of the search response.').optional().meta({ found_in: 'body' }),
  docvalue_fields: z.array(z.lazy(() => QueryDslFieldAndFormat)).describe('The request returns doc values for field names matching these patterns in the `hits.fields` property of the response. It accepts wildcard (`*`) patterns.').optional().meta({ found_in: 'body' }),
  stored_fields: z.lazy(() => Fields).describe('A list of stored fields to return as part of a hit. If no fields are specified, no stored fields are included in the response. If this field is specified, the `_source` parameter defaults to `false`. You can pass `_source: true` to return both source fields and stored fields in the search response.').optional().meta({ found_in: 'body' }),
  fields: z.lazy(() => Fields).describe('The request returns values for field names matching these patterns in the `hits.fields` property of the response. It accepts wildcard (`*`) patterns.').optional().meta({ found_in: 'body' }),
  filter: z.union([z.lazy(() => QueryDslQueryContainer), z.array(z.lazy(() => QueryDslQueryContainer))]).describe('A query to filter the documents that can match. The kNN search will return the top `k` documents that also match this filter. The value can be a single query or a list of queries. If `filter` isn\'t provided, all documents are allowed to match.').optional().meta({ found_in: 'body' }),
  knn: KnnSearchKnnSearchQuery.describe('The kNN query to run.').meta({ found_in: 'body' })
}).meta({ id: 'KnnSearchRequest' })
export type KnnSearchRequest = z.infer<typeof KnnSearchRequest>

export const SearchTotalHitsRelation = z.enum(['eq', 'gte']).meta({ id: 'SearchTotalHitsRelation' })
export type SearchTotalHitsRelation = z.infer<typeof SearchTotalHitsRelation>

export const SearchTotalHits = z.object({
  relation: SearchTotalHitsRelation,
  value: z.lazy(() => long)
}).meta({ id: 'SearchTotalHits' })
export type SearchTotalHits = z.infer<typeof SearchTotalHits>

export interface SearchInnerHitsResultShape {
  hits: SearchHitsMetadataShape
}
export const SearchInnerHitsResult = z.object({
  get hits () { return SearchHitsMetadata }
}).meta({ id: 'SearchInnerHitsResult' })
export type SearchInnerHitsResult = z.infer<typeof SearchInnerHitsResult>

export interface SearchNestedIdentityShape {
  field: Field
  offset: integer
  _nested?: SearchNestedIdentityShape | undefined
}
export const SearchNestedIdentity = z.object({
  field: z.lazy(() => Field),
  offset: z.lazy(() => integer),
  get _nested () { return SearchNestedIdentity.optional() }
}).meta({ id: 'SearchNestedIdentity' })
export type SearchNestedIdentity = z.infer<typeof SearchNestedIdentity>

export interface SearchHitShape {
  _index: IndexName
  _id?: Id | undefined
  _score?: double | null | undefined
  _explanation?: ExplainExplanation | undefined
  fields?: Record<string, unknown> | undefined
  highlight?: Record<string, string[]> | undefined
  inner_hits?: Record<string, SearchInnerHitsResultShape> | undefined
  matched_queries?: string[] | Record<string, double> | undefined
  _nested?: SearchNestedIdentityShape | undefined
  _ignored?: string[] | undefined
  ignored_field_values?: Record<string, unknown[]> | undefined
  _shard?: string | undefined
  _node?: string | undefined
  _routing?: string | undefined
  _source?: unknown | undefined
  _rank?: integer | undefined
  _seq_no?: SequenceNumber | undefined
  _primary_term?: long | undefined
  _version?: VersionNumber | undefined
  sort?: SortResults | undefined
}
export const SearchHit = z.object({
  _index: z.lazy(() => IndexName),
  _id: z.lazy(() => Id).optional(),
  _score: z.union([z.lazy(() => double), z.null()]).optional(),
  _explanation: ExplainExplanation.optional(),
  fields: z.record(z.string(), z.any()).optional(),
  highlight: z.record(z.string(), z.array(z.string())).optional(),
  get inner_hits (): z.ZodOptional<z.ZodRecord<z.ZodString, typeof SearchInnerHitsResult>> { return z.record(z.string(), SearchInnerHitsResult).optional() },
  matched_queries: z.union([z.array(z.string()), z.record(z.string(), z.lazy(() => double))]).optional(),
  get _nested () { return SearchNestedIdentity.optional() },
  _ignored: z.array(z.string()).optional(),
  ignored_field_values: z.record(z.string(), z.array(z.any())).optional(),
  _shard: z.string().optional(),
  _node: z.string().optional(),
  _routing: z.string().optional(),
  _source: z.any().optional(),
  _rank: z.lazy(() => integer).optional(),
  _seq_no: z.lazy(() => SequenceNumber).optional(),
  _primary_term: z.lazy(() => long).optional(),
  _version: z.lazy(() => VersionNumber).optional(),
  sort: z.lazy(() => SortResults).optional()
}).meta({ id: 'SearchHit' })
export type SearchHit = z.infer<typeof SearchHit>

export interface SearchHitsMetadataShape {
  total?: SearchTotalHits | long | undefined
  hits: SearchHitShape[]
  max_score?: double | null | undefined
}
export const SearchHitsMetadata = z.object({
  total: z.union([SearchTotalHits, z.lazy(() => long)]).describe('Total hit count information, present only if `track_total_hits` wasn\'t `false` in the search request.').optional(),
  get hits () { return SearchHit.array() },
  max_score: z.union([z.lazy(() => double), z.null()]).optional()
}).meta({ id: 'SearchHitsMetadata' })
export type SearchHitsMetadata = z.infer<typeof SearchHitsMetadata>

export const KnnSearchResponse = z.object({
  took: z.lazy(() => long).describe('The milliseconds it took Elasticsearch to run the request.'),
  timed_out: z.boolean().describe('If true, the request timed out before completion; returned results may be partial or empty.'),
  _shards: z.lazy(() => ShardStatistics).describe('A count of shards used for the request.'),
  hits: z.lazy(() => SearchHitsMetadata).describe('The returned documents and metadata.'),
  fields: z.record(z.string(), z.any()).describe('The field values for the documents. These fields must be specified in the request using the `fields` parameter.').optional(),
  max_score: z.lazy(() => double).describe('The highest returned document score. This value is null for requests that do not sort by score.').optional()
}).meta({ id: 'KnnSearchResponse' })
export type KnnSearchResponse = z.infer<typeof KnnSearchResponse>

export const MgetMultiGetError = z.object({
  error: z.lazy(() => ErrorCause),
  _id: z.lazy(() => Id),
  _index: z.lazy(() => IndexName)
}).meta({ id: 'MgetMultiGetError' })
export type MgetMultiGetError = z.infer<typeof MgetMultiGetError>

export const MgetOperation = z.object({
  _id: z.lazy(() => Id).describe('The unique document ID.'),
  _index: z.lazy(() => IndexName).describe('The index that contains the document.').optional(),
  routing: z.lazy(() => Routing).describe('The key for the primary shard the document resides on. Required if routing is used during indexing.').optional(),
  _source: z.lazy(() => SearchSourceConfig).describe('If `false`, excludes all _source fields.').optional(),
  stored_fields: z.lazy(() => Fields).describe('The stored fields you want to retrieve.').optional(),
  version: z.lazy(() => VersionNumber).optional(),
  version_type: z.lazy(() => VersionType).optional()
}).meta({ id: 'MgetOperation' })
export type MgetOperation = z.infer<typeof MgetOperation>

/**
 * Get multiple documents.
 *
 * Get multiple JSON documents by ID from one or more indices.
 * If you specify an index in the request URI, you only need to specify the document IDs in the request body.
 * To ensure fast responses, this multi get (mget) API responds with partial results if one or more shards fail.
 *
 * **Filter source fields**
 *
 * By default, the `_source` field is returned for every document (if stored).
 * Use the `_source` and `_source_include` or `source_exclude` attributes to filter what fields are returned for a particular document.
 * You can include the `_source`, `_source_includes`, and `_source_excludes` query parameters in the request URI to specify the defaults to use when there are no per-document instructions.
 *
 * **Get stored fields**
 *
 * Use the `stored_fields` attribute to specify the set of stored fields you want to retrieve.
 * Any requested fields that are not stored are ignored.
 * You can include the `stored_fields` query parameter in the request URI to specify the defaults to use when there are no per-document instructions.
 */
export const MgetRequest = z.object({
  index: z.lazy(() => IndexName).describe('Name of the index to retrieve documents from when `ids` are specified, or when a document in the `docs` array does not specify an index.').optional().meta({ found_in: 'path' }),
  preference: z.string().describe('Specifies the node or shard the operation should be performed on. Random by default.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If `true`, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, the request refreshes relevant shards before retrieving documents.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('Custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  _source: SearchSourceConfigParam.describe('True or false to return the `_source` field or not, or a list of fields to return.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude from the response. You can also use this parameter to exclude fields from the subset specified in `_source_includes` query parameter.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response. If this parameter is specified, only these source fields are returned. You can exclude fields from this subset using the `_source_excludes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  stored_fields: z.lazy(() => Fields).describe('If `true`, retrieves the document fields stored in the index rather than the document `_source`.').optional().meta({ found_in: 'query' }),
  docs: z.array(MgetOperation).describe('The documents you want to retrieve. Required if no index is specified in the request URI.').optional().meta({ found_in: 'body' }),
  ids: z.lazy(() => Ids).describe('The IDs of the documents you want to retrieve. Allowed when the index is specified in the request URI.').optional().meta({ found_in: 'body' })
}).meta({ id: 'MgetRequest' })
export type MgetRequest = z.infer<typeof MgetRequest>

export const MgetResponseItem = z.union([GetGetResult, MgetMultiGetError]).meta({ id: 'MgetResponseItem' })
export type MgetResponseItem = z.infer<typeof MgetResponseItem>

export const MgetResponse = z.object({
  docs: z.array(MgetResponseItem).describe('The response includes a docs array that contains the documents in the order specified in the request. The structure of the returned documents is similar to that returned by the get API. If there is a failure getting a particular document, the error is included in place of the document.')
}).meta({ id: 'MgetResponse' })
export type MgetResponse = z.infer<typeof MgetResponse>

export const SearchAggregationBreakdown = z.object({
  build_aggregation: z.lazy(() => long),
  build_aggregation_count: z.lazy(() => long),
  build_leaf_collector: z.lazy(() => long),
  build_leaf_collector_count: z.lazy(() => long),
  collect: z.lazy(() => long),
  collect_count: z.lazy(() => long),
  initialize: z.lazy(() => long),
  initialize_count: z.lazy(() => long),
  post_collection: z.lazy(() => long).optional(),
  post_collection_count: z.lazy(() => long).optional(),
  reduce: z.lazy(() => long),
  reduce_count: z.lazy(() => long)
}).meta({ id: 'SearchAggregationBreakdown' })
export type SearchAggregationBreakdown = z.infer<typeof SearchAggregationBreakdown>

export const SearchAggregationProfileDelegateDebugFilter = z.object({
  results_from_metadata: z.lazy(() => integer).optional(),
  query: z.string().optional(),
  specialized_for: z.string().optional(),
  segments_counted_in_constant_time: z.lazy(() => integer).optional()
}).meta({ id: 'SearchAggregationProfileDelegateDebugFilter' })
export type SearchAggregationProfileDelegateDebugFilter = z.infer<typeof SearchAggregationProfileDelegateDebugFilter>

export interface SearchAggregationProfileDebugShape {
  segments_with_multi_valued_ords?: integer | undefined
  collection_strategy?: string | undefined
  segments_with_single_valued_ords?: integer | undefined
  total_buckets?: integer | undefined
  built_buckets?: integer | undefined
  result_strategy?: string | undefined
  has_filter?: boolean | undefined
  delegate?: string | undefined
  delegate_debug?: SearchAggregationProfileDebugShape | undefined
  chars_fetched?: integer | undefined
  extract_count?: integer | undefined
  extract_ns?: integer | undefined
  values_fetched?: integer | undefined
  collect_analyzed_ns?: integer | undefined
  collect_analyzed_count?: integer | undefined
  surviving_buckets?: integer | undefined
  ordinals_collectors_used?: integer | undefined
  ordinals_collectors_overhead_too_high?: integer | undefined
  string_hashing_collectors_used?: integer | undefined
  numeric_collectors_used?: integer | undefined
  empty_collectors_used?: integer | undefined
  deferred_aggregators?: string[] | undefined
  segments_with_doc_count_field?: integer | undefined
  segments_with_deleted_docs?: integer | undefined
  filters?: SearchAggregationProfileDelegateDebugFilter[] | undefined
  segments_counted?: integer | undefined
  segments_collected?: integer | undefined
  map_reducer?: string | undefined
  brute_force_used?: integer | undefined
  dynamic_pruning_attempted?: integer | undefined
  dynamic_pruning_used?: integer | undefined
  skipped_due_to_no_data?: integer | undefined
}
export const SearchAggregationProfileDebug = z.object({
  segments_with_multi_valued_ords: z.lazy(() => integer).optional(),
  collection_strategy: z.string().optional(),
  segments_with_single_valued_ords: z.lazy(() => integer).optional(),
  total_buckets: z.lazy(() => integer).optional(),
  built_buckets: z.lazy(() => integer).optional(),
  result_strategy: z.string().optional(),
  has_filter: z.boolean().optional(),
  delegate: z.string().optional(),
  get delegate_debug () { return SearchAggregationProfileDebug.optional() },
  chars_fetched: z.lazy(() => integer).optional(),
  extract_count: z.lazy(() => integer).optional(),
  extract_ns: z.lazy(() => integer).optional(),
  values_fetched: z.lazy(() => integer).optional(),
  collect_analyzed_ns: z.lazy(() => integer).optional(),
  collect_analyzed_count: z.lazy(() => integer).optional(),
  surviving_buckets: z.lazy(() => integer).optional(),
  ordinals_collectors_used: z.lazy(() => integer).optional(),
  ordinals_collectors_overhead_too_high: z.lazy(() => integer).optional(),
  string_hashing_collectors_used: z.lazy(() => integer).optional(),
  numeric_collectors_used: z.lazy(() => integer).optional(),
  empty_collectors_used: z.lazy(() => integer).optional(),
  deferred_aggregators: z.array(z.string()).optional(),
  segments_with_doc_count_field: z.lazy(() => integer).optional(),
  segments_with_deleted_docs: z.lazy(() => integer).optional(),
  filters: z.array(SearchAggregationProfileDelegateDebugFilter).optional(),
  segments_counted: z.lazy(() => integer).optional(),
  segments_collected: z.lazy(() => integer).optional(),
  map_reducer: z.string().optional(),
  brute_force_used: z.lazy(() => integer).optional(),
  dynamic_pruning_attempted: z.lazy(() => integer).optional(),
  dynamic_pruning_used: z.lazy(() => integer).optional(),
  skipped_due_to_no_data: z.lazy(() => integer).optional()
}).meta({ id: 'SearchAggregationProfileDebug' })
export type SearchAggregationProfileDebug = z.infer<typeof SearchAggregationProfileDebug>

export interface SearchAggregationProfileShape {
  breakdown: SearchAggregationBreakdown
  description: string
  time_in_nanos: DurationValue
  type: string
  debug?: SearchAggregationProfileDebugShape | undefined
  children?: SearchAggregationProfileShape[] | undefined
}
export const SearchAggregationProfile = z.object({
  breakdown: SearchAggregationBreakdown,
  description: z.string(),
  time_in_nanos: z.lazy(() => DurationValue),
  type: z.string(),
  get debug () { return SearchAggregationProfileDebug.optional() },
  get children () { return SearchAggregationProfile.array().optional() }
}).meta({ id: 'SearchAggregationProfile' })
export type SearchAggregationProfile = z.infer<typeof SearchAggregationProfile>

export const SearchDfsStatisticsBreakdown = z.object({
  collection_statistics: z.lazy(() => long),
  collection_statistics_count: z.lazy(() => long),
  create_weight: z.lazy(() => long),
  create_weight_count: z.lazy(() => long),
  rewrite: z.lazy(() => long),
  rewrite_count: z.lazy(() => long),
  term_statistics: z.lazy(() => long),
  term_statistics_count: z.lazy(() => long)
}).meta({ id: 'SearchDfsStatisticsBreakdown' })
export type SearchDfsStatisticsBreakdown = z.infer<typeof SearchDfsStatisticsBreakdown>

export interface SearchDfsStatisticsProfileShape {
  type: string
  description: string
  time?: Duration | undefined
  time_in_nanos: DurationValue
  breakdown: SearchDfsStatisticsBreakdown
  debug?: Record<string, unknown> | undefined
  children?: SearchDfsStatisticsProfileShape[] | undefined
}
export const SearchDfsStatisticsProfile = z.object({
  type: z.string(),
  description: z.string(),
  time: z.lazy(() => Duration).optional(),
  time_in_nanos: z.lazy(() => DurationValue),
  breakdown: SearchDfsStatisticsBreakdown,
  debug: z.record(z.string(), z.any()).optional(),
  get children () { return SearchDfsStatisticsProfile.array().optional() }
}).meta({ id: 'SearchDfsStatisticsProfile' })
export type SearchDfsStatisticsProfile = z.infer<typeof SearchDfsStatisticsProfile>

export const SearchKnnQueryProfileBreakdown = z.object({
  advance: z.lazy(() => long),
  advance_count: z.lazy(() => long),
  build_scorer: z.lazy(() => long),
  build_scorer_count: z.lazy(() => long),
  compute_max_score: z.lazy(() => long),
  compute_max_score_count: z.lazy(() => long),
  count_weight: z.lazy(() => long),
  count_weight_count: z.lazy(() => long),
  create_weight: z.lazy(() => long),
  create_weight_count: z.lazy(() => long),
  match: z.lazy(() => long),
  match_count: z.lazy(() => long),
  next_doc: z.lazy(() => long),
  next_doc_count: z.lazy(() => long),
  score: z.lazy(() => long),
  score_count: z.lazy(() => long),
  set_min_competitive_score: z.lazy(() => long),
  set_min_competitive_score_count: z.lazy(() => long),
  shallow_advance: z.lazy(() => long),
  shallow_advance_count: z.lazy(() => long)
}).meta({ id: 'SearchKnnQueryProfileBreakdown' })
export type SearchKnnQueryProfileBreakdown = z.infer<typeof SearchKnnQueryProfileBreakdown>

export interface SearchKnnQueryProfileResultShape {
  type: string
  description: string
  time?: Duration | undefined
  time_in_nanos: DurationValue
  breakdown: SearchKnnQueryProfileBreakdown
  debug?: Record<string, unknown> | undefined
  children?: SearchKnnQueryProfileResultShape[] | undefined
}
export const SearchKnnQueryProfileResult = z.object({
  type: z.string(),
  description: z.string(),
  time: z.lazy(() => Duration).optional(),
  time_in_nanos: z.lazy(() => DurationValue),
  breakdown: SearchKnnQueryProfileBreakdown,
  debug: z.record(z.string(), z.any()).optional(),
  get children () { return SearchKnnQueryProfileResult.array().optional() }
}).meta({ id: 'SearchKnnQueryProfileResult' })
export type SearchKnnQueryProfileResult = z.infer<typeof SearchKnnQueryProfileResult>

export interface SearchKnnCollectorResultShape {
  name: string
  reason: string
  time?: Duration | undefined
  time_in_nanos: DurationValue
  children?: SearchKnnCollectorResultShape[] | undefined
}
export const SearchKnnCollectorResult = z.object({
  name: z.string(),
  reason: z.string(),
  time: z.lazy(() => Duration).optional(),
  time_in_nanos: z.lazy(() => DurationValue),
  get children () { return SearchKnnCollectorResult.array().optional() }
}).meta({ id: 'SearchKnnCollectorResult' })
export type SearchKnnCollectorResult = z.infer<typeof SearchKnnCollectorResult>

export const SearchDfsKnnProfile = z.object({
  vector_operations_count: z.lazy(() => long).optional(),
  query: z.array(z.lazy(() => SearchKnnQueryProfileResult)),
  rewrite_time: z.lazy(() => long),
  collector: z.array(z.lazy(() => SearchKnnCollectorResult))
}).meta({ id: 'SearchDfsKnnProfile' })
export type SearchDfsKnnProfile = z.infer<typeof SearchDfsKnnProfile>

export const SearchDfsProfile = z.object({
  statistics: z.lazy(() => SearchDfsStatisticsProfile).optional(),
  knn: z.array(SearchDfsKnnProfile).optional()
}).meta({ id: 'SearchDfsProfile' })
export type SearchDfsProfile = z.infer<typeof SearchDfsProfile>

export const SearchFetchProfileBreakdown = z.object({
  load_source: z.lazy(() => integer).optional(),
  load_source_count: z.lazy(() => integer).optional(),
  load_stored_fields: z.lazy(() => integer).optional(),
  load_stored_fields_count: z.lazy(() => integer).optional(),
  next_reader: z.lazy(() => integer).optional(),
  next_reader_count: z.lazy(() => integer).optional(),
  process_count: z.lazy(() => integer).optional(),
  process: z.lazy(() => integer).optional()
}).meta({ id: 'SearchFetchProfileBreakdown' })
export type SearchFetchProfileBreakdown = z.infer<typeof SearchFetchProfileBreakdown>

export const SearchFetchProfileDebug = z.object({
  stored_fields: z.array(z.string()).optional(),
  fast_path: z.lazy(() => integer).optional()
}).meta({ id: 'SearchFetchProfileDebug' })
export type SearchFetchProfileDebug = z.infer<typeof SearchFetchProfileDebug>

export interface SearchFetchProfileShape {
  type: string
  description: string
  time_in_nanos: DurationValue
  breakdown: SearchFetchProfileBreakdown
  debug?: SearchFetchProfileDebug | undefined
  children?: SearchFetchProfileShape[] | undefined
}
export const SearchFetchProfile = z.object({
  type: z.string(),
  description: z.string(),
  time_in_nanos: z.lazy(() => DurationValue),
  breakdown: SearchFetchProfileBreakdown,
  debug: SearchFetchProfileDebug.optional(),
  get children () { return SearchFetchProfile.array().optional() }
}).meta({ id: 'SearchFetchProfile' })
export type SearchFetchProfile = z.infer<typeof SearchFetchProfile>

export interface SearchCollectorShape {
  name: string
  reason: string
  time_in_nanos: DurationValue
  children?: SearchCollectorShape[] | undefined
}
export const SearchCollector = z.object({
  name: z.string(),
  reason: z.string(),
  time_in_nanos: z.lazy(() => DurationValue),
  get children () { return SearchCollector.array().optional() }
}).meta({ id: 'SearchCollector' })
export type SearchCollector = z.infer<typeof SearchCollector>

export const SearchQueryBreakdown = z.object({
  advance: z.lazy(() => long),
  advance_count: z.lazy(() => long),
  build_scorer: z.lazy(() => long),
  build_scorer_count: z.lazy(() => long),
  create_weight: z.lazy(() => long),
  create_weight_count: z.lazy(() => long),
  match: z.lazy(() => long),
  match_count: z.lazy(() => long),
  shallow_advance: z.lazy(() => long),
  shallow_advance_count: z.lazy(() => long),
  next_doc: z.lazy(() => long),
  next_doc_count: z.lazy(() => long),
  score: z.lazy(() => long),
  score_count: z.lazy(() => long),
  compute_max_score: z.lazy(() => long),
  compute_max_score_count: z.lazy(() => long),
  count_weight: z.lazy(() => long),
  count_weight_count: z.lazy(() => long),
  set_min_competitive_score: z.lazy(() => long),
  set_min_competitive_score_count: z.lazy(() => long)
}).meta({ id: 'SearchQueryBreakdown' })
export type SearchQueryBreakdown = z.infer<typeof SearchQueryBreakdown>

export interface SearchQueryProfileShape {
  breakdown: SearchQueryBreakdown
  description: string
  time_in_nanos: DurationValue
  type: string
  children?: SearchQueryProfileShape[] | undefined
}
export const SearchQueryProfile = z.object({
  breakdown: SearchQueryBreakdown,
  description: z.string(),
  time_in_nanos: z.lazy(() => DurationValue),
  type: z.string(),
  get children () { return SearchQueryProfile.array().optional() }
}).meta({ id: 'SearchQueryProfile' })
export type SearchQueryProfile = z.infer<typeof SearchQueryProfile>

export const SearchSearchProfile = z.object({
  collector: z.array(z.lazy(() => SearchCollector)),
  query: z.array(z.lazy(() => SearchQueryProfile)),
  rewrite_time: z.lazy(() => long)
}).meta({ id: 'SearchSearchProfile' })
export type SearchSearchProfile = z.infer<typeof SearchSearchProfile>

export const SearchShardProfile = z.object({
  aggregations: z.array(z.lazy(() => SearchAggregationProfile)),
  cluster: z.string(),
  dfs: SearchDfsProfile.optional(),
  fetch: z.lazy(() => SearchFetchProfile).optional(),
  id: z.string(),
  index: z.lazy(() => IndexName),
  node_id: z.lazy(() => NodeId),
  searches: z.array(SearchSearchProfile),
  shard_id: z.lazy(() => integer)
}).meta({ id: 'SearchShardProfile' })
export type SearchShardProfile = z.infer<typeof SearchShardProfile>

export const SearchProfile = z.object({
  shards: z.array(SearchShardProfile)
}).meta({ id: 'SearchProfile' })
export type SearchProfile = z.infer<typeof SearchProfile>

export const SearchSuggestBase = z.object({
  length: z.lazy(() => integer),
  offset: z.lazy(() => integer),
  text: z.string()
}).meta({ id: 'SearchSuggestBase' })
export type SearchSuggestBase = z.infer<typeof SearchSuggestBase>

/** Text or location that we want similar documents for or a lookup to a document's field for the text. */
export const SearchContext = z.union([z.string(), z.lazy(() => GeoLocation)]).meta({ id: 'SearchContext' })
export type SearchContext = z.infer<typeof SearchContext>

export const SearchCompletionSuggestOption = z.object({
  collate_match: z.boolean().optional(),
  contexts: z.record(z.string(), z.array(SearchContext)).optional(),
  fields: z.record(z.string(), z.any()).optional(),
  _id: z.string().optional(),
  _index: z.lazy(() => IndexName).optional(),
  _routing: z.string().optional(),
  _score: z.lazy(() => double).optional(),
  _source: z.any().optional(),
  text: z.string(),
  score: z.lazy(() => double).optional()
}).meta({ id: 'SearchCompletionSuggestOption' })
export type SearchCompletionSuggestOption = z.infer<typeof SearchCompletionSuggestOption>

export const SearchCompletionSuggest = z.object({
  ...SearchSuggestBase.shape,
  options: z.union([SearchCompletionSuggestOption, z.array(SearchCompletionSuggestOption)])
}).meta({ id: 'SearchCompletionSuggest' })
export type SearchCompletionSuggest = z.infer<typeof SearchCompletionSuggest>

export const SearchPhraseSuggestOption = z.object({
  text: z.string(),
  score: z.lazy(() => double),
  highlighted: z.string().optional(),
  collate_match: z.boolean().optional()
}).meta({ id: 'SearchPhraseSuggestOption' })
export type SearchPhraseSuggestOption = z.infer<typeof SearchPhraseSuggestOption>

export const SearchPhraseSuggest = z.object({
  ...SearchSuggestBase.shape,
  options: z.union([SearchPhraseSuggestOption, z.array(SearchPhraseSuggestOption)])
}).meta({ id: 'SearchPhraseSuggest' })
export type SearchPhraseSuggest = z.infer<typeof SearchPhraseSuggest>

export const SearchTermSuggestOption = z.object({
  text: z.string(),
  score: z.lazy(() => double),
  freq: z.lazy(() => long),
  highlighted: z.string().optional(),
  collate_match: z.boolean().optional()
}).meta({ id: 'SearchTermSuggestOption' })
export type SearchTermSuggestOption = z.infer<typeof SearchTermSuggestOption>

export const SearchTermSuggest = z.object({
  ...SearchSuggestBase.shape,
  options: z.union([SearchTermSuggestOption, z.array(SearchTermSuggestOption)])
}).meta({ id: 'SearchTermSuggest' })
export type SearchTermSuggest = z.infer<typeof SearchTermSuggest>

export const SearchSuggest = z.union([SearchCompletionSuggest, SearchPhraseSuggest, SearchTermSuggest]).meta({ id: 'SearchSuggest' })
export type SearchSuggest = z.infer<typeof SearchSuggest>

export const SearchResponseBody = z.object({
  took: z.lazy(() => long).describe('The number of milliseconds it took Elasticsearch to run the request. This value is calculated by measuring the time elapsed between receipt of a request on the coordinating node and the time at which the coordinating node is ready to send the response. It includes: * Communication time between the coordinating node and data nodes * Time the request spends in the search thread pool, queued for execution * Actual run time It does not include: * Time needed to send the request to Elasticsearch * Time needed to serialize the JSON response * Time needed to send the response to a client'),
  timed_out: z.boolean().describe('If `true`, the request timed out before completion; returned results may be partial or empty.'),
  _shards: z.lazy(() => ShardStatistics).describe('A count of shards used for the request.'),
  hits: z.lazy(() => SearchHitsMetadata).describe('The returned documents and metadata.'),
  aggregations: z.any().optional(),
  _clusters: z.lazy(() => ClusterStatistics).optional(),
  fields: z.record(z.string(), z.any()).optional(),
  max_score: z.lazy(() => double).optional(),
  num_reduce_phases: z.lazy(() => long).optional(),
  profile: SearchProfile.optional(),
  pit_id: z.lazy(() => Id).optional(),
  _scroll_id: z.lazy(() => ScrollId).describe('The identifier for the search and its search context. You can use this scroll ID with the scroll API to retrieve the next batch of search results for the request. This property is returned only if the `scroll` query parameter is specified in the request.').optional(),
  suggest: z.record(z.lazy(() => SuggestionName), z.array(SearchSuggest)).optional(),
  terminated_early: z.boolean().optional()
}).meta({ id: 'SearchResponseBody' })
export type SearchResponseBody = z.infer<typeof SearchResponseBody>

export const MsearchMultiSearchItem = z.object({
  ...SearchResponseBody.shape,
  status: z.lazy(() => integer).optional()
}).meta({ id: 'MsearchMultiSearchItem' })
export type MsearchMultiSearchItem = z.infer<typeof MsearchMultiSearchItem>

export const MsearchResponseItem = z.union([MsearchMultiSearchItem, z.lazy(() => ErrorResponseBase)]).meta({ id: 'MsearchResponseItem' })
export type MsearchResponseItem = z.infer<typeof MsearchResponseItem>

export const MsearchMultiSearchResult = z.object({
  took: z.lazy(() => long),
  responses: z.array(MsearchResponseItem)
}).meta({ id: 'MsearchMultiSearchResult' })
export type MsearchMultiSearchResult = z.infer<typeof MsearchMultiSearchResult>

/** Contains parameters used to limit or change the subsequent search body request. */
export const MsearchMultisearchHeader = z.object({
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional(),
  expand_wildcards: z.lazy(() => ExpandWildcards).optional(),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional(),
  index: z.lazy(() => Indices).optional(),
  preference: z.string().optional(),
  project_routing: z.lazy(() => ProjectRouting).optional(),
  request_cache: z.boolean().optional(),
  routing: z.lazy(() => Routing).optional(),
  search_type: z.lazy(() => SearchType).optional(),
  ccs_minimize_roundtrips: z.boolean().optional(),
  allow_partial_search_results: z.boolean().optional(),
  ignore_throttled: z.boolean().optional()
}).meta({ id: 'MsearchMultisearchHeader' })
export type MsearchMultisearchHeader = z.infer<typeof MsearchMultisearchHeader>

export const MsearchRequestItem = z.union([MsearchMultisearchHeader, z.lazy(() => SearchSearchRequestBody)]).meta({ id: 'MsearchRequestItem' })
export type MsearchRequestItem = z.infer<typeof MsearchRequestItem>

/**
 * Run multiple searches.
 *
 * The format of the request is similar to the bulk API format and makes use of the newline delimited JSON (NDJSON) format.
 * The structure is as follows:
 *
 * ```
 * header\n
 * body\n
 * header\n
 * body\n
 * ```
 *
 * This structure is specifically optimized to reduce parsing if a specific search ends up redirected to another node.
 *
 * IMPORTANT: The final line of data must end with a newline character `\n`.
 * Each newline character may be preceded by a carriage return `\r`.
 * When sending requests to this endpoint the `Content-Type` header should be set to `application/x-ndjson`.
 */
export const MsearchRequest = z.object({
  index: z.lazy(() => Indices).describe('Comma-separated list of data streams, indices, and index aliases to search.').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  ccs_minimize_roundtrips: z.boolean().describe('If true, network roundtrips between the coordinating node and remote clusters are minimized for cross-cluster search requests.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('Type of index that wildcard expressions can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams.').optional().meta({ found_in: 'query' }),
  ignore_throttled: z.boolean().describe('If true, concrete, expanded or aliased indices are ignored when frozen.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  include_named_queries_score: z.boolean().describe('Indicates whether hit.matched_queries should be rendered as a map that includes the name of the matched query associated with its score (true) or as an array containing the name of the matched queries (false) This functionality reruns each named query on every hit in a search response. Typically, this adds a small overhead to a request. However, using computationally expensive named queries on a large number of hits may add significant overhead.').optional().meta({ found_in: 'query' }),
  max_concurrent_searches: z.lazy(() => integer).describe('Maximum number of concurrent searches the multi search API can execute. Defaults to `max(1, (# of data nodes * min(search thread pool size, 10)))`.').optional().meta({ found_in: 'query' }),
  max_concurrent_shard_requests: z.lazy(() => integer).describe('Maximum number of concurrent shard requests that each sub-search request executes per node.').optional().meta({ found_in: 'query' }),
  pre_filter_shard_size: z.lazy(() => long).describe('Defines a threshold that enforces a pre-filter roundtrip to prefilter search shards based on query rewriting if the number of shards the search request expands to exceeds the threshold. This filter roundtrip can limit the number of shards significantly if for instance a shard can not match any documents based on its rewrite method i.e., if date filters are mandatory to match but the shard bounds and the query are disjoint.').optional().meta({ found_in: 'query' }),
  rest_total_hits_as_int: z.boolean().describe('If true, hits.total are returned as an integer in the response. Defaults to false, which returns an object.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('Custom routing value used to route search operations to a specific shard.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('Indicates whether global term and document frequencies should be used when scoring returned documents.').optional().meta({ found_in: 'query' }),
  typed_keys: z.boolean().describe('Specifies whether aggregation and suggester names should be prefixed by their respective types in the response.').optional().meta({ found_in: 'query' }),
  searches: z.array(MsearchRequestItem).optional().meta({ found_in: 'body' })
}).meta({ id: 'MsearchRequest' })
export type MsearchRequest = z.infer<typeof MsearchRequest>

export const MsearchResponse = MsearchMultiSearchResult.meta({ id: 'MsearchResponse' })
export type MsearchResponse = z.infer<typeof MsearchResponse>

export const MsearchTemplateTemplateConfig = z.object({
  explain: z.boolean().describe('If `true`, returns detailed information about score calculation as part of each hit.').optional(),
  id: z.lazy(() => Id).describe('The ID of the search template to use. If no `source` is specified, this parameter is required.').optional(),
  params: z.record(z.string(), z.any()).describe('Key-value pairs used to replace Mustache variables in the template. The key is the variable name. The value is the variable value.').optional(),
  profile: z.boolean().describe('If `true`, the query execution is profiled.').optional(),
  source: z.lazy(() => ScriptSource).describe('An inline search template. Supports the same parameters as the search API\'s request body. It also supports Mustache variables. If no `id` is specified, this parameter is required.').optional()
}).meta({ id: 'MsearchTemplateTemplateConfig' })
export type MsearchTemplateTemplateConfig = z.infer<typeof MsearchTemplateTemplateConfig>

export const MsearchTemplateRequestItem = z.union([MsearchMultisearchHeader, MsearchTemplateTemplateConfig]).meta({ id: 'MsearchTemplateRequestItem' })
export type MsearchTemplateRequestItem = z.infer<typeof MsearchTemplateRequestItem>

/**
 * Run multiple templated searches.
 *
 * Run multiple templated searches with a single request.
 * If you are providing a text file or text input to `curl`, use the `--data-binary` flag instead of `-d` to preserve newlines.
 * For example:
 *
 * ```
 * $ cat requests
 * { "index": "my-index" }
 * { "id": "my-search-template", "params": { "query_string": "hello world", "from": 0, "size": 10 }}
 * { "index": "my-other-index" }
 * { "id": "my-other-search-template", "params": { "query_type": "match_all" }}
 *
 * $ curl -H "Content-Type: application/x-ndjson" -XGET localhost:9200/_msearch/template --data-binary "@requests"; echo
 * ```
 */
export const MsearchTemplateRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`). To search all data streams and indices, omit this parameter or use `*`.').optional().meta({ found_in: 'path' }),
  ccs_minimize_roundtrips: z.boolean().describe('If `true`, network round-trips are minimized for cross-cluster search requests.').optional().meta({ found_in: 'query' }),
  max_concurrent_searches: z.lazy(() => long).describe('The maximum number of concurrent searches the API can run.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('The type of the search operation.').optional().meta({ found_in: 'query' }),
  rest_total_hits_as_int: z.boolean().describe('If `true`, the response returns `hits.total` as an integer. If `false`, it returns `hits.total` as an object.').optional().meta({ found_in: 'query' }),
  typed_keys: z.boolean().describe('If `true`, the response prefixes aggregation and suggester names with their respective types.').optional().meta({ found_in: 'query' }),
  search_templates: z.array(MsearchTemplateRequestItem).optional().meta({ found_in: 'body' })
}).meta({ id: 'MsearchTemplateRequest' })
export type MsearchTemplateRequest = z.infer<typeof MsearchTemplateRequest>

export const MsearchTemplateResponse = MsearchMultiSearchResult.meta({ id: 'MsearchTemplateResponse' })
export type MsearchTemplateResponse = z.infer<typeof MsearchTemplateResponse>

export const TermvectorsFilter = z.object({
  max_doc_freq: z.lazy(() => integer).describe('Ignore words which occur in more than this many docs. Defaults to unbounded.').optional(),
  max_num_terms: z.lazy(() => integer).describe('The maximum number of terms that must be returned per field.').optional(),
  max_term_freq: z.lazy(() => integer).describe('Ignore words with more than this frequency in the source doc. It defaults to unbounded.').optional(),
  max_word_length: z.lazy(() => integer).describe('The maximum word length above which words will be ignored. Defaults to unbounded.').optional(),
  min_doc_freq: z.lazy(() => integer).describe('Ignore terms which do not occur in at least this many docs.').optional(),
  min_term_freq: z.lazy(() => integer).describe('Ignore words with less than this frequency in the source doc.').optional(),
  min_word_length: z.lazy(() => integer).describe('The minimum word length below which words will be ignored.').optional()
}).meta({ id: 'TermvectorsFilter' })
export type TermvectorsFilter = z.infer<typeof TermvectorsFilter>

export const MtermvectorsOperation = z.object({
  _id: z.lazy(() => Id).describe('The ID of the document.').optional(),
  _index: z.lazy(() => IndexName).describe('The index of the document.').optional(),
  doc: z.any().describe('An artificial document (a document not present in the index) for which you want to retrieve term vectors.').optional(),
  fields: z.lazy(() => Fields).describe('Comma-separated list or wildcard expressions of fields to include in the statistics. Used as the default list unless a specific field list is provided in the `completion_fields` or `fielddata_fields` parameters.').optional(),
  field_statistics: z.boolean().describe('If `true`, the response includes the document count, sum of document frequencies, and sum of total term frequencies.').optional(),
  filter: TermvectorsFilter.describe('Filter terms based on their tf-idf scores.').optional(),
  offsets: z.boolean().describe('If `true`, the response includes term offsets.').optional(),
  payloads: z.boolean().describe('If `true`, the response includes term payloads.').optional(),
  positions: z.boolean().describe('If `true`, the response includes term positions.').optional(),
  routing: z.lazy(() => Routing).describe('Custom value used to route operations to a specific shard.').optional(),
  term_statistics: z.boolean().describe('If true, the response includes term frequency and document frequency.').optional(),
  version: z.lazy(() => VersionNumber).describe('If `true`, returns the document version as part of a hit.').optional(),
  version_type: z.lazy(() => VersionType).describe('Specific version type.').optional()
}).meta({ id: 'MtermvectorsOperation' })
export type MtermvectorsOperation = z.infer<typeof MtermvectorsOperation>

/**
 * Get multiple term vectors.
 *
 * Get multiple term vectors with a single request.
 * You can specify existing documents by index and ID or provide artificial documents in the body of the request.
 * You can specify the index in the request body or request URI.
 * The response contains a `docs` array with all the fetched termvectors.
 * Each element has the structure provided by the termvectors API.
 *
 * **Artificial documents**
 *
 * You can also use `mtermvectors` to generate term vectors for artificial documents provided in the body of the request.
 * The mapping used is determined by the specified `_index`.
 */
export const MtermvectorsRequest = z.object({
  index: z.lazy(() => IndexName).describe('The name of the index that contains the documents.').optional().meta({ found_in: 'path' }),
  fields: z.lazy(() => Fields).describe('A comma-separated list or wildcard expressions of fields to include in the statistics. It is used as the default list unless a specific field list is provided in the `completion_fields` or `fielddata_fields` parameters.').optional().meta({ found_in: 'query' }),
  field_statistics: z.boolean().describe('If `true`, the response includes the document count, sum of document frequencies, and sum of total term frequencies.').optional().meta({ found_in: 'query' }),
  offsets: z.boolean().describe('If `true`, the response includes term offsets.').optional().meta({ found_in: 'query' }),
  payloads: z.boolean().describe('If `true`, the response includes term payloads.').optional().meta({ found_in: 'query' }),
  positions: z.boolean().describe('If `true`, the response includes term positions.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If true, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  term_statistics: z.boolean().describe('If true, the response includes term frequency and document frequency.').optional().meta({ found_in: 'query' }),
  version: z.lazy(() => VersionNumber).describe('If `true`, returns the document version as part of a hit.').optional().meta({ found_in: 'query' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'query' }),
  docs: z.array(MtermvectorsOperation).describe('An array of existing or artificial documents.').optional().meta({ found_in: 'body' }),
  ids: z.array(z.lazy(() => Id)).describe('A simplified syntax to specify documents by their ID if they\'re in the same index.').optional().meta({ found_in: 'body' })
}).meta({ id: 'MtermvectorsRequest' })
export type MtermvectorsRequest = z.infer<typeof MtermvectorsRequest>

export const TermvectorsFieldStatistics = z.object({
  doc_count: z.lazy(() => integer),
  sum_doc_freq: z.lazy(() => long),
  sum_ttf: z.lazy(() => long)
}).meta({ id: 'TermvectorsFieldStatistics' })
export type TermvectorsFieldStatistics = z.infer<typeof TermvectorsFieldStatistics>

export const TermvectorsToken = z.object({
  end_offset: z.lazy(() => integer).optional(),
  payload: z.string().optional(),
  position: z.lazy(() => integer),
  start_offset: z.lazy(() => integer).optional()
}).meta({ id: 'TermvectorsToken' })
export type TermvectorsToken = z.infer<typeof TermvectorsToken>

export const TermvectorsTerm = z.object({
  doc_freq: z.lazy(() => integer).optional(),
  score: z.lazy(() => double).optional(),
  term_freq: z.lazy(() => integer),
  tokens: z.array(TermvectorsToken).optional(),
  ttf: z.lazy(() => integer).optional()
}).meta({ id: 'TermvectorsTerm' })
export type TermvectorsTerm = z.infer<typeof TermvectorsTerm>

export const TermvectorsTermVector = z.object({
  field_statistics: TermvectorsFieldStatistics.optional(),
  terms: z.record(z.string(), TermvectorsTerm)
}).meta({ id: 'TermvectorsTermVector' })
export type TermvectorsTermVector = z.infer<typeof TermvectorsTermVector>

export const MtermvectorsTermVectorsResult = z.object({
  _id: z.lazy(() => Id).optional(),
  _index: z.lazy(() => IndexName),
  _version: z.lazy(() => VersionNumber).optional(),
  took: z.lazy(() => long).optional(),
  found: z.boolean().optional(),
  term_vectors: z.record(z.lazy(() => Field), TermvectorsTermVector).optional(),
  error: z.lazy(() => ErrorCause).optional()
}).meta({ id: 'MtermvectorsTermVectorsResult' })
export type MtermvectorsTermVectorsResult = z.infer<typeof MtermvectorsTermVectorsResult>

export const MtermvectorsResponse = z.object({
  docs: z.array(MtermvectorsTermVectorsResult)
}).meta({ id: 'MtermvectorsResponse' })
export type MtermvectorsResponse = z.infer<typeof MtermvectorsResponse>

/**
 * Open a point in time.
 *
 * A search request by default runs against the most recent visible data of the target indices,
 * which is called point in time. Elasticsearch pit (point in time) is a lightweight view into the
 * state of the data as it existed when initiated. In some cases, it’s preferred to perform multiple
 * search requests using the same point in time. For example, if refreshes happen between
 * `search_after` requests, then the results of those requests might not be consistent as changes happening
 * between searches are only visible to the more recent point in time.
 *
 * A point in time must be opened explicitly before being used in search requests.
 *
 * A subsequent search request with the `pit` parameter must not specify `index`, `routing`, or `preference` values as these parameters are copied from the point in time.
 *
 * Just like regular searches, you can use `from` and `size` to page through point in time search results, up to the first 10,000 hits.
 * If you want to retrieve more hits, use PIT with `search_after`.
 *
 * IMPORTANT: The open point in time request and each subsequent search request can return different identifiers; always use the most recently received ID for the next search request.
 *
 * When a PIT that contains shard failures is used in a search request, the missing are always reported in the search response as a `NoShardAvailableActionException` exception.
 * To get rid of these exceptions, a new PIT needs to be created so that shards missing from the previous PIT can be handled, assuming they become available in the meantime.
 *
 * **Keeping point in time alive**
 *
 * The `keep_alive` parameter, which is passed to a open point in time request and search request, extends the time to live of the corresponding point in time.
 * The value does not need to be long enough to process all data—it just needs to be long enough for the next request.
 *
 * Normally, the background merge process optimizes the index by merging together smaller segments to create new, bigger segments.
 * Once the smaller segments are no longer needed they are deleted.
 * However, open point-in-times prevent the old segments from being deleted since they are still in use.
 *
 * TIP: Keeping older segments alive means that more disk space and file handles are needed.
 * Ensure that you have configured your nodes to have ample free file handles.
 *
 * Additionally, if a segment contains deleted or updated documents then the point in time must keep track of whether each document in the segment was live at the time of the initial search request.
 * Ensure that your nodes have sufficient heap space if you have many open point-in-times on an index that is subject to ongoing deletes or updates.
 * Note that a point-in-time doesn't prevent its associated indices from being deleted.
 * You can check how many point-in-times (that is, search contexts) are open with the nodes stats API.
 */
export const OpenPointInTimeRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of index names to open point in time; use `_all` or empty string to perform the operation on all indices').meta({ found_in: 'path' }),
  keep_alive: z.lazy(() => Duration).describe('Extend the length of time that the point in time persists.').meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. By default, it is random.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value that is used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. It supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  allow_partial_search_results: z.boolean().describe('Indicates whether the point in time tolerates unavailable shards or shard failures when initially creating the PIT. If `false`, creating a point in time request when a shard is missing or unavailable will throw an exception. If `true`, the point in time will contain all the shards that are available at the time of the request.').optional().meta({ found_in: 'query' }),
  max_concurrent_shard_requests: z.lazy(() => integer).describe('Maximum number of concurrent shard requests that each sub-search request executes per node.').optional().meta({ found_in: 'query' }),
  index_filter: z.lazy(() => QueryDslQueryContainer).describe('Filter indices if the provided query rewrites to `match_none` on every shard.').optional().meta({ found_in: 'body' })
}).meta({ id: 'OpenPointInTimeRequest' })
export type OpenPointInTimeRequest = z.infer<typeof OpenPointInTimeRequest>

export const OpenPointInTimeResponse = z.object({
  _shards: z.lazy(() => ShardStatistics).describe('Shards used to create the PIT'),
  id: z.lazy(() => Id)
}).meta({ id: 'OpenPointInTimeResponse' })
export type OpenPointInTimeResponse = z.infer<typeof OpenPointInTimeResponse>

/**
 * Ping the cluster.
 *
 * Get information about whether the cluster is running.
 */
export const PingRequest = z.object({
}).meta({ id: 'PingRequest' })
export type PingRequest = z.infer<typeof PingRequest>

export const PingResponse = z.boolean().meta({ id: 'PingResponse' })
export type PingResponse = z.infer<typeof PingResponse>

/**
 * Create or update a script or search template.
 *
 * Creates or updates a stored script or search template.
 */
export const PutScriptRequest = z.object({
  id: z.lazy(() => Id).describe('The identifier for the stored script or search template. It must be unique within the cluster.').meta({ found_in: 'path' }),
  context: z.lazy(() => Name).describe('The context in which the script or search template should run. To prevent errors, the API immediately compiles the script or template in this context.').optional().meta({ found_in: 'path' }),
  master_timeout: z.lazy(() => Duration).describe('The period to wait for a connection to the master node. If no response is received before the timeout expires, the request fails and returns an error. It can also be set to `-1` to indicate that the request should never timeout.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error. It can also be set to `-1` to indicate that the request should never timeout.').optional().meta({ found_in: 'query' }),
  script: z.lazy(() => StoredScript).describe('The script or search template, its parameters, and its language.').meta({ found_in: 'body' })
}).meta({ id: 'PutScriptRequest' })
export type PutScriptRequest = z.infer<typeof PutScriptRequest>

export const PutScriptResponse = z.lazy(() => AcknowledgedResponseBase).meta({ id: 'PutScriptResponse' })
export type PutScriptResponse = z.infer<typeof PutScriptResponse>

export const RankEvalDocumentRating = z.object({
  _id: z.lazy(() => Id).describe('The document ID.'),
  _index: z.lazy(() => IndexName).describe('The document’s index. For data streams, this should be the document’s backing index.'),
  rating: z.lazy(() => integer).describe('The document’s relevance with regard to this search request.')
}).meta({ id: 'RankEvalDocumentRating' })
export type RankEvalDocumentRating = z.infer<typeof RankEvalDocumentRating>

export const RankEvalRankEvalHit = z.object({
  _id: z.lazy(() => Id),
  _index: z.lazy(() => IndexName),
  _score: z.lazy(() => double)
}).meta({ id: 'RankEvalRankEvalHit' })
export type RankEvalRankEvalHit = z.infer<typeof RankEvalRankEvalHit>

export const RankEvalRankEvalHitItem = z.object({
  hit: RankEvalRankEvalHit,
  rating: z.union([z.lazy(() => double), z.null()]).optional()
}).meta({ id: 'RankEvalRankEvalHitItem' })
export type RankEvalRankEvalHitItem = z.infer<typeof RankEvalRankEvalHitItem>

export const RankEvalRankEvalMetricBase = z.object({
  k: z.lazy(() => integer).describe('Sets the maximum number of documents retrieved per query. This value will act in place of the usual size parameter in the query.').optional()
}).meta({ id: 'RankEvalRankEvalMetricBase' })
export type RankEvalRankEvalMetricBase = z.infer<typeof RankEvalRankEvalMetricBase>

export const RankEvalRankEvalMetricRatingTreshold = z.object({
  ...RankEvalRankEvalMetricBase.shape,
  relevant_rating_threshold: z.lazy(() => integer).describe('Sets the rating threshold above which documents are considered to be "relevant".').optional()
}).meta({ id: 'RankEvalRankEvalMetricRatingTreshold' })
export type RankEvalRankEvalMetricRatingTreshold = z.infer<typeof RankEvalRankEvalMetricRatingTreshold>

/** Precision at K (P@k) */
export const RankEvalRankEvalMetricPrecision = z.object({
  ...RankEvalRankEvalMetricRatingTreshold.shape,
  ignore_unlabeled: z.boolean().describe('Controls how unlabeled documents in the search results are counted. If set to true, unlabeled documents are ignored and neither count as relevant or irrelevant. Set to false (the default), they are treated as irrelevant.').optional()
}).meta({ id: 'RankEvalRankEvalMetricPrecision' })
export type RankEvalRankEvalMetricPrecision = z.infer<typeof RankEvalRankEvalMetricPrecision>

/** Recall at K (R@k) */
export const RankEvalRankEvalMetricRecall = z.object({
  ...RankEvalRankEvalMetricRatingTreshold.shape
}).meta({ id: 'RankEvalRankEvalMetricRecall' })
export type RankEvalRankEvalMetricRecall = z.infer<typeof RankEvalRankEvalMetricRecall>

/** Mean Reciprocal Rank */
export const RankEvalRankEvalMetricMeanReciprocalRank = z.object({
  ...RankEvalRankEvalMetricRatingTreshold.shape
}).meta({ id: 'RankEvalRankEvalMetricMeanReciprocalRank' })
export type RankEvalRankEvalMetricMeanReciprocalRank = z.infer<typeof RankEvalRankEvalMetricMeanReciprocalRank>

/** Discounted cumulative gain (DCG) */
export const RankEvalRankEvalMetricDiscountedCumulativeGain = z.object({
  ...RankEvalRankEvalMetricBase.shape,
  normalize: z.boolean().describe('If set to true, this metric will calculate the Normalized DCG.').optional()
}).meta({ id: 'RankEvalRankEvalMetricDiscountedCumulativeGain' })
export type RankEvalRankEvalMetricDiscountedCumulativeGain = z.infer<typeof RankEvalRankEvalMetricDiscountedCumulativeGain>

/** Expected Reciprocal Rank (ERR) */
export const RankEvalRankEvalMetricExpectedReciprocalRank = z.object({
  ...RankEvalRankEvalMetricBase.shape,
  maximum_relevance: z.lazy(() => integer).describe('The highest relevance grade used in the user-supplied relevance judgments.')
}).meta({ id: 'RankEvalRankEvalMetricExpectedReciprocalRank' })
export type RankEvalRankEvalMetricExpectedReciprocalRank = z.infer<typeof RankEvalRankEvalMetricExpectedReciprocalRank>

export const RankEvalRankEvalMetric = z.object({
  precision: RankEvalRankEvalMetricPrecision.optional(),
  recall: RankEvalRankEvalMetricRecall.optional(),
  mean_reciprocal_rank: RankEvalRankEvalMetricMeanReciprocalRank.optional(),
  dcg: RankEvalRankEvalMetricDiscountedCumulativeGain.optional(),
  expected_reciprocal_rank: RankEvalRankEvalMetricExpectedReciprocalRank.optional()
}).meta({ id: 'RankEvalRankEvalMetric' })
export type RankEvalRankEvalMetric = z.infer<typeof RankEvalRankEvalMetric>

export const RankEvalUnratedDocument = z.object({
  _id: z.lazy(() => Id),
  _index: z.lazy(() => IndexName)
}).meta({ id: 'RankEvalUnratedDocument' })
export type RankEvalUnratedDocument = z.infer<typeof RankEvalUnratedDocument>

export const RankEvalRankEvalMetricDetail = z.object({
  metric_score: z.lazy(() => double).describe('The metric_score in the details section shows the contribution of this query to the global quality metric score'),
  unrated_docs: z.array(RankEvalUnratedDocument).describe('The unrated_docs section contains an _index and _id entry for each document in the search result for this query that didn’t have a ratings value. This can be used to ask the user to supply ratings for these documents'),
  hits: z.array(RankEvalRankEvalHitItem).describe('The hits section shows a grouping of the search results with their supplied ratings'),
  metric_details: z.record(z.string(), z.record(z.string(), z.any())).describe('The metric_details give additional information about the calculated quality metric (e.g. how many of the retrieved documents were relevant). The content varies for each metric but allows for better interpretation of the results')
}).meta({ id: 'RankEvalRankEvalMetricDetail' })
export type RankEvalRankEvalMetricDetail = z.infer<typeof RankEvalRankEvalMetricDetail>

export const RankEvalRankEvalQuery = z.object({
  query: z.lazy(() => QueryDslQueryContainer),
  size: z.lazy(() => integer).optional()
}).meta({ id: 'RankEvalRankEvalQuery' })
export type RankEvalRankEvalQuery = z.infer<typeof RankEvalRankEvalQuery>

export const RankEvalRankEvalRequestItem = z.object({
  id: z.lazy(() => Id).describe('The search request’s ID, used to group result details later.'),
  request: RankEvalRankEvalQuery.describe('The query being evaluated.').optional(),
  ratings: z.array(RankEvalDocumentRating).describe('List of document ratings'),
  template_id: z.lazy(() => Id).describe('The search template Id').optional(),
  params: z.record(z.string(), z.any()).describe('The search template parameters.').optional()
}).meta({ id: 'RankEvalRankEvalRequestItem' })
export type RankEvalRankEvalRequestItem = z.infer<typeof RankEvalRankEvalRequestItem>

/**
 * Evaluate ranked search results.
 *
 * Evaluate the quality of ranked search results over a set of typical search queries.
 */
export const RankEvalRequest = z.object({
  index: z.lazy(() => Indices).describe('A  comma-separated list of data streams, indices, and index aliases used to limit the request. Wildcard (`*`) expressions are supported. To target all data streams and indices in a cluster, omit this parameter or use `_all` or `*`.').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('Whether to expand wildcard expression to concrete indices that are open, closed or both.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('Search operation type').optional().meta({ found_in: 'query' }),
  requests: z.array(RankEvalRankEvalRequestItem).describe('A set of typical search requests, together with their provided ratings.').meta({ found_in: 'body' }),
  metric: RankEvalRankEvalMetric.describe('Definition of the evaluation metric to calculate.').optional().meta({ found_in: 'body' })
}).meta({ id: 'RankEvalRequest' })
export type RankEvalRequest = z.infer<typeof RankEvalRequest>

export const RankEvalResponse = z.object({
  metric_score: z.lazy(() => double).describe('The overall evaluation quality calculated by the defined metric'),
  details: z.record(z.lazy(() => Id), RankEvalRankEvalMetricDetail).describe('The details section contains one entry for every query in the original requests section, keyed by the search request id'),
  failures: z.record(z.string(), z.any())
}).meta({ id: 'RankEvalResponse' })
export type RankEvalResponse = z.infer<typeof RankEvalResponse>

export const ReindexDestination = z.object({
  index: z.lazy(() => IndexName).describe('The name of the data stream, index, or index alias you are copying to.'),
  op_type: z.lazy(() => OpType).describe('If it is `create`, the operation will only index documents that do not already exist (also known as "put if absent"). IMPORTANT: To reindex to a data stream destination, this argument must be `create`.').optional(),
  pipeline: z.string().describe('The name of the pipeline to use.').optional(),
  routing: z.string().describe('By default, a document\'s routing is preserved unless it\'s changed by the script. If it is `keep`, the routing on the bulk request sent for each match is set to the routing on the match. If it is `discard`, the routing on the bulk request sent for each match is set to `null`. If it is `=value`, the routing on the bulk request sent for each match is set to all value specified after the equals sign (`=`).').optional(),
  version_type: z.lazy(() => VersionType).describe('The versioning to use for the indexing operation.').optional()
}).meta({ id: 'ReindexDestination' })
export type ReindexDestination = z.infer<typeof ReindexDestination>

export const ReindexRemoteSource = z.object({
  connect_timeout: z.lazy(() => Duration).describe('The remote connection timeout.').optional(),
  headers: z.record(z.string(), z.string()).describe('An object containing the headers of the request.').optional(),
  host: z.lazy(() => Host).describe('The URL for the remote instance of Elasticsearch that you want to index from. This information is required when you\'re indexing from remote.'),
  username: z.lazy(() => Username).describe('The username to use for authentication with the remote host (required when using basic auth).').optional(),
  password: z.lazy(() => Password).describe('The password to use for authentication with the remote host (required when using basic auth).').optional(),
  api_key: z.string().describe('The API key to use for authentication with the remote host (as an alternative to basic auth when the remote cluster is in Elastic Cloud). (It is not permitted to set this and also to set an `Authorization` header via `headers`.)').optional(),
  socket_timeout: z.lazy(() => Duration).describe('The remote socket read timeout.').optional()
}).meta({ id: 'ReindexRemoteSource' })
export type ReindexRemoteSource = z.infer<typeof ReindexRemoteSource>

export const ReindexSource = z.object({
  index: z.lazy(() => Indices).describe('The name of the data stream, index, or alias you are copying from. It accepts a comma-separated list to reindex from multiple sources.'),
  query: z.lazy(() => QueryDslQueryContainer).describe('The documents to reindex, which is defined with Query DSL.').optional(),
  remote: ReindexRemoteSource.describe('A remote instance of Elasticsearch that you want to index from.').optional(),
  size: z.lazy(() => integer).describe('The number of documents to index per batch. Use it when you are indexing from remote to ensure that the batches fit within the on-heap buffer, which defaults to a maximum size of 100 MB.').optional(),
  slice: z.lazy(() => SlicedScroll).describe('Slice the reindex request manually using the provided slice ID and total number of slices.').optional(),
  sort: z.lazy(() => Sort).describe('A comma-separated list of `<field>:<direction>` pairs to sort by before indexing. Use it in conjunction with `max_docs` to control what documents are reindexed. WARNING: Sort in reindex is deprecated. Sorting in reindex was never guaranteed to index documents in order and prevents further development of reindex such as resilience and performance improvements. If used in combination with `max_docs`, consider using a query filter instead.').optional(),
  source_fields: z.lazy(() => SearchSourceConfig).describe('If `true`, reindex all source fields. Set it to a list to reindex select fields.').optional(),
  runtime_mappings: z.lazy(() => MappingRuntimeFields).optional()
}).meta({ id: 'ReindexSource' })
export type ReindexSource = z.infer<typeof ReindexSource>

/**
 * Reindex documents.
 *
 * Copy documents from a source to a destination.
 * You can copy all documents to the destination index or reindex a subset of the documents.
 * The source can be any existing index, alias, or data stream.
 * The destination must differ from the source.
 * For example, you cannot reindex a data stream into itself.
 *
 * IMPORTANT: Reindex requires `_source` to be enabled for all documents in the source.
 * The destination should be configured as wanted before calling the reindex API.
 * Reindex does not copy the settings from the source or its associated template.
 * Mappings, shard counts, and replicas, for example, must be configured ahead of time.
 *
 * If the Elasticsearch security features are enabled, you must have the following security privileges:
 *
 * * The `read` index privilege for the source data stream, index, or alias.
 * * The `write` index privilege for the destination data stream, index, or index alias.
 * * To automatically create a data stream or index with a reindex API request, you must have the `auto_configure`, `create_index`, or `manage` index privilege for the destination data stream, index, or alias.
 * * If reindexing from a remote cluster, the `source.remote.user` must have the `monitor` cluster privilege and the `read` index privilege for the source data stream, index, or alias.
 *
 * If reindexing from a remote cluster into a cluster using Elastic Stack, you must explicitly allow the remote host using the `reindex.remote.whitelist` node setting on the destination cluster.
 * If reindexing from a remote cluster into an Elastic Cloud Serverless project, only remote hosts from Elastic Cloud Hosted are allowed.
 * Automatic data stream creation requires a matching index template with data stream enabled.
 *
 * The `dest` element can be configured like the index API to control optimistic concurrency control.
 * Omitting `version_type` or setting it to `internal` causes Elasticsearch to blindly dump documents into the destination, overwriting any that happen to have the same ID.
 *
 * Setting `version_type` to `external` causes Elasticsearch to preserve the `version` from the source, create any documents that are missing, and update any documents that have an older version in the destination than they do in the source.
 *
 * Setting `op_type` to `create` causes the reindex API to create only missing documents in the destination.
 * All existing documents will cause a version conflict.
 *
 * IMPORTANT: Because data streams are append-only, any reindex request to a destination data stream must have an `op_type` of `create`.
 * A reindex can only add new documents to a destination data stream.
 * It cannot update existing documents in a destination data stream.
 *
 * By default, version conflicts abort the reindex process.
 * To continue reindexing if there are conflicts, set the `conflicts` request body property to `proceed`.
 * In this case, the response includes a count of the version conflicts that were encountered.
 * Note that the handling of other error types is unaffected by the `conflicts` property.
 * Additionally, if you opt to count version conflicts, the operation could attempt to reindex more documents from the source than `max_docs` until it has successfully indexed `max_docs` documents into the target or it has gone through every document in the source query.
 *
 * It's recommended to reindex on indices with a green status. Reindexing can fail when a node shuts down or crashes.
 * * When requested with `wait_for_completion=true` (default), the request fails if the node shuts down.
 * * When requested with `wait_for_completion=false`, a task id is returned, for use with the task management APIs. The task may disappear or fail if the node shuts down.
 * When retrying a failed reindex operation, it might be necessary to set `conflicts=proceed` or to first delete the partial destination index.
 * Additionally, dry runs, checking disk space, and fetching index recovery information can help address the root cause.
 *
 * Refer to the linked documentation for examples of how to reindex documents.
 */
export const ReindexRequest = z.object({
  refresh: z.boolean().describe('If `true`, the request refreshes affected shards to make this operation visible to search.').optional().meta({ found_in: 'query' }),
  requests_per_second: z.lazy(() => float).describe('The throttle for this request in sub-requests per second. By default, there is no throttle.').optional().meta({ found_in: 'query' }),
  scroll: z.lazy(() => Duration).describe('The period of time that a consistent view of the index should be maintained for scrolled search.').optional().meta({ found_in: 'query' }),
  slices: z.lazy(() => Slices).describe('The number of slices this task should be divided into. It defaults to one slice, which means the task isn\'t sliced into subtasks. Reindex supports sliced scroll to parallelize the reindexing process. This parallelization can improve efficiency and provide a convenient way to break the request down into smaller parts. NOTE: Reindexing from remote clusters does not support manual or automatic slicing. If set to `auto`, Elasticsearch chooses the number of slices to use. This setting will use one slice per shard, up to a certain limit. If there are multiple sources, it will choose the number of slices based on the index or backing index with the smallest number of shards.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period each indexing waits for automatic index creation, dynamic mapping updates, and waiting for active shards. By default, Elasticsearch waits for at least one minute before failing. The actual wait time could be longer, particularly when multiple waits occur.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of shard copies that must be active before proceeding with the operation. Set it to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The default value is one, which means it waits for each primary shard to be active.').optional().meta({ found_in: 'query' }),
  wait_for_completion: z.boolean().describe('If `true`, the request blocks until the operation is complete.').optional().meta({ found_in: 'query' }),
  require_alias: z.boolean().describe('If `true`, the destination must be an index alias.').optional().meta({ found_in: 'query' }),
  conflicts: z.lazy(() => Conflicts).describe('Indicates whether to continue reindexing even when there are conflicts.').optional().meta({ found_in: 'body' }),
  dest: ReindexDestination.describe('The destination you are copying to.').meta({ found_in: 'body' }),
  max_docs: z.lazy(() => long).describe('The maximum number of documents to reindex. By default, all documents are reindexed. If it is a value less then or equal to `scroll_size`, a scroll will not be used to retrieve the results for the operation. If `conflicts` is set to `proceed`, the reindex operation could attempt to reindex more documents from the source than `max_docs` until it has successfully indexed `max_docs` documents into the target or it has gone through every document in the source query.').optional().meta({ found_in: 'body' }),
  script: z.lazy(() => Script).describe('The script to run to update the document source or metadata when reindexing.').optional().meta({ found_in: 'body' }),
  source: ReindexSource.describe('The source you are copying from.').meta({ found_in: 'body' })
}).meta({ id: 'ReindexRequest' })
export type ReindexRequest = z.infer<typeof ReindexRequest>

export const ReindexResponse = z.object({
  batches: z.lazy(() => long).describe('The number of scroll responses that were pulled back by the reindex.').optional(),
  created: z.lazy(() => long).describe('The number of documents that were successfully created.').optional(),
  deleted: z.lazy(() => long).describe('The number of documents that were successfully deleted.').optional(),
  failures: z.array(z.lazy(() => BulkIndexByScrollFailure)).describe('If there were any unrecoverable errors during the process, it is an array of those failures. If this array is not empty, the request ended because of those failures. Reindex is implemented using batches and any failure causes the entire process to end but all failures in the current batch are collected into the array. You can use the `conflicts` option to prevent the reindex from ending on version conflicts.').optional(),
  noops: z.lazy(() => long).describe('The number of documents that were ignored because the script used for the reindex returned a `noop` value for `ctx.op`.').optional(),
  retries: z.lazy(() => Retries).describe('The number of retries attempted by reindex.').optional(),
  requests_per_second: z.lazy(() => float).describe('The number of requests per second effectively run during the reindex.').optional(),
  slice_id: z.lazy(() => integer).optional(),
  slices: z.array(z.lazy(() => ReindexStatus)).describe('Status of each slice if the reindex was sliced').optional(),
  task: z.lazy(() => TaskId).optional(),
  throttled_millis: z.lazy(() => EpochTime).describe('The number of milliseconds the request slept to conform to `requests_per_second`.').optional(),
  throttled_until_millis: z.lazy(() => EpochTime).describe('This field should always be equal to zero in a reindex response. It has meaning only when using the task API, where it indicates the next time (in milliseconds since epoch) that a throttled request will be run again in order to conform to `requests_per_second`.').optional(),
  timed_out: z.boolean().describe('If any of the requests that ran during the reindex timed out, it is `true`.').optional(),
  took: z.lazy(() => DurationValue).describe('The total milliseconds the entire operation took.').optional(),
  total: z.lazy(() => long).describe('The number of documents that were successfully processed.').optional(),
  updated: z.lazy(() => long).describe('The number of documents that were successfully updated. That is to say, a document with the same ID already existed before the reindex updated it.').optional(),
  version_conflicts: z.lazy(() => long).describe('The number of version conflicts that occurred.').optional()
}).meta({ id: 'ReindexResponse' })
export type ReindexResponse = z.infer<typeof ReindexResponse>

export const ReindexRethrottleReindexTask = z.object({
  action: z.string(),
  cancellable: z.boolean(),
  cancelled: z.boolean(),
  description: z.string(),
  id: z.lazy(() => long),
  node: z.lazy(() => Name),
  running_time_in_nanos: z.lazy(() => DurationValue),
  start_time_in_millis: z.lazy(() => EpochTime),
  status: z.lazy(() => ReindexStatus),
  type: z.string(),
  headers: z.lazy(() => HttpHeaders)
}).meta({ id: 'ReindexRethrottleReindexTask' })
export type ReindexRethrottleReindexTask = z.infer<typeof ReindexRethrottleReindexTask>

export const ReindexRethrottleParentReindexTask = z.object({
  ...ReindexRethrottleReindexTask.shape,
  children: z.array(ReindexRethrottleReindexTask).optional()
}).meta({ id: 'ReindexRethrottleParentReindexTask' })
export type ReindexRethrottleParentReindexTask = z.infer<typeof ReindexRethrottleParentReindexTask>

export const ReindexRethrottleReindexNode = z.object({
  attributes: z.record(z.string(), z.string()),
  host: z.lazy(() => Host),
  ip: z.lazy(() => Ip),
  name: z.lazy(() => Name),
  roles: z.lazy(() => NodeRoles).optional(),
  transport_address: z.lazy(() => TransportAddress),
  tasks: z.record(z.lazy(() => TaskId), ReindexRethrottleReindexTask)
}).meta({ id: 'ReindexRethrottleReindexNode' })
export type ReindexRethrottleReindexNode = z.infer<typeof ReindexRethrottleReindexNode>

export const ReindexRethrottleReindexTasks = z.union([z.array(ReindexRethrottleReindexTask), z.record(z.string(), ReindexRethrottleParentReindexTask)]).meta({ id: 'ReindexRethrottleReindexTasks' })
export type ReindexRethrottleReindexTasks = z.infer<typeof ReindexRethrottleReindexTasks>

/**
 * Throttle a reindex operation.
 *
 * Change the number of requests per second for a particular reindex operation.
 * For example:
 *
 * ```
 * POST _reindex/r1A2WoRbTwKZ516z6NEs5A:36619/_rethrottle?requests_per_second=-1
 * ```
 *
 * Rethrottling that speeds up the query takes effect immediately.
 * Rethrottling that slows down the query will take effect after completing the current batch.
 * This behavior prevents scroll timeouts.
 */
export const ReindexRethrottleRequest = z.object({
  task_id: z.lazy(() => Id).describe('The task identifier, which can be found by using the tasks API.').meta({ found_in: 'path' }),
  requests_per_second: z.lazy(() => float).describe('The throttle for this request in sub-requests per second. It can be either `-1` to turn off throttling or any decimal number like `1.7` or `12` to throttle to that level.').meta({ found_in: 'query' })
}).meta({ id: 'ReindexRethrottleRequest' })
export type ReindexRethrottleRequest = z.infer<typeof ReindexRethrottleRequest>

export const ReindexRethrottleResponse = z.object({
  node_failures: z.array(z.lazy(() => ErrorCause)).optional(),
  task_failures: z.array(z.lazy(() => TaskFailure)).optional(),
  nodes: z.record(z.string(), ReindexRethrottleReindexNode).optional(),
  tasks: ReindexRethrottleReindexTasks.optional()
}).meta({ id: 'ReindexRethrottleResponse' })
export type ReindexRethrottleResponse = z.infer<typeof ReindexRethrottleResponse>

/**
 * Render a search template.
 *
 * Render a search template as a search request body.
 */
export const RenderSearchTemplateRequest = z.object({
  id: z.lazy(() => Id).describe('The ID of the search template to render. If no `source` is specified, this or the `id` request body parameter is required.').optional().meta({ found_in: 'path' }),
  file: z.string().optional().meta({ found_in: 'body' }),
  params: z.record(z.string(), z.any()).describe('Key-value pairs used to replace Mustache variables in the template. The key is the variable name. The value is the variable value.').optional().meta({ found_in: 'body' }),
  source: z.lazy(() => ScriptSource).describe('An inline search template. It supports the same parameters as the search API\'s request body. These parameters also support Mustache variables. If no `id` or `<templated-id>` is specified, this parameter is required.').optional().meta({ found_in: 'body' })
}).meta({ id: 'RenderSearchTemplateRequest' })
export type RenderSearchTemplateRequest = z.infer<typeof RenderSearchTemplateRequest>

export const RenderSearchTemplateResponse = z.object({
  template_output: z.record(z.string(), z.any())
}).meta({ id: 'RenderSearchTemplateResponse' })
export type RenderSearchTemplateResponse = z.infer<typeof RenderSearchTemplateResponse>

export const ScriptsPainlessExecutePainlessContext = z.enum(['painless_test', 'filter', 'score', 'boolean_field', 'date_field', 'double_field', 'geo_point_field', 'ip_field', 'keyword_field', 'long_field', 'composite_field']).meta({ id: 'ScriptsPainlessExecutePainlessContext' })
export type ScriptsPainlessExecutePainlessContext = z.infer<typeof ScriptsPainlessExecutePainlessContext>

export const ScriptsPainlessExecutePainlessContextSetup = z.object({
  document: z.any().describe('Document that\'s temporarily indexed in-memory and accessible from the script.'),
  index: z.lazy(() => IndexName).describe('Index containing a mapping that\'s compatible with the indexed document. You may specify a remote index by prefixing the index with the remote cluster alias. For example, `remote1:my_index` indicates that you want to run the painless script against the "my_index" index on the "remote1" cluster. This request will be forwarded to the "remote1" cluster if you have configured a connection to that remote cluster. NOTE: Wildcards are not accepted in the index expression for this endpoint. The expression `*:myindex` will return the error "No such remote cluster" and the expression `logs*` or `remote1:logs*` will return the error "index not found".'),
  query: z.lazy(() => QueryDslQueryContainer).describe('Use this parameter to specify a query for computing a score.').optional()
}).meta({ id: 'ScriptsPainlessExecutePainlessContextSetup' })
export type ScriptsPainlessExecutePainlessContextSetup = z.infer<typeof ScriptsPainlessExecutePainlessContextSetup>

/**
 * Run a script.
 *
 * Runs a script and returns a result.
 * Use this API to build and test scripts, such as when defining a script for a runtime field.
 * This API requires very few dependencies and is especially useful if you don't have permissions to write documents on a cluster.
 *
 * The API uses several _contexts_, which control how scripts are run, what variables are available at runtime, and what the return type is.
 *
 * Each context requires a script, but additional parameters depend on the context you're using for that script.
 */
export const ScriptsPainlessExecuteRequest = z.object({
  context: ScriptsPainlessExecutePainlessContext.describe('The context that the script should run in. NOTE: Result ordering in the field contexts is not guaranteed.').optional().meta({ found_in: 'body' }),
  context_setup: ScriptsPainlessExecutePainlessContextSetup.describe('Additional parameters for the `context`. NOTE: This parameter is required for all contexts except `painless_test`, which is the default if no value is provided for `context`.').optional().meta({ found_in: 'body' }),
  script: z.lazy(() => Script).describe('The Painless script to run.').optional().meta({ found_in: 'body' })
}).meta({ id: 'ScriptsPainlessExecuteRequest' })
export type ScriptsPainlessExecuteRequest = z.infer<typeof ScriptsPainlessExecuteRequest>

export const ScriptsPainlessExecuteResponse = z.object({
  result: z.any()
}).meta({ id: 'ScriptsPainlessExecuteResponse' })
export type ScriptsPainlessExecuteResponse = z.infer<typeof ScriptsPainlessExecuteResponse>

/**
 * Run a scrolling search.
 *
 * IMPORTANT: The scroll API is no longer recommend for deep pagination. If you need to preserve the index state while paging through more than 10,000 hits, use the `search_after` parameter with a point in time (PIT).
 *
 * The scroll API gets large sets of results from a single scrolling search request.
 * To get the necessary scroll ID, submit a search API request that includes an argument for the `scroll` query parameter.
 * The `scroll` parameter indicates how long Elasticsearch should retain the search context for the request.
 * The search response returns a scroll ID in the `_scroll_id` response body parameter.
 * You can then use the scroll ID with the scroll API to retrieve the next batch of results for the request.
 * If the Elasticsearch security features are enabled, the access to the results of a specific scroll ID is restricted to the user or API key that submitted the search.
 *
 * You can also use the scroll API to specify a new scroll parameter that extends or shortens the retention period for the search context.
 *
 * IMPORTANT: Results from a scrolling search reflect the state of the index at the time of the initial search request. Subsequent indexing or document changes only affect later search and scroll requests.
 */
export const ScrollRequest = z.object({
  rest_total_hits_as_int: z.boolean().describe('If true, the API response’s hit.total property is returned as an integer. If false, the API response’s hit.total property is returned as an object.').optional().meta({ found_in: 'query' }),
  scroll: z.lazy(() => Duration).describe('The period to retain the search context for scrolling.').optional().meta({ found_in: 'body' }),
  scroll_id: z.lazy(() => ScrollId).describe('The scroll ID of the search.').meta({ found_in: 'body' })
}).meta({ id: 'ScrollRequest' })
export type ScrollRequest = z.infer<typeof ScrollRequest>

export const ScrollResponse = SearchResponseBody.meta({ id: 'ScrollResponse' })
export type ScrollResponse = z.infer<typeof ScrollResponse>

/**
 * Run a search.
 *
 * Get search hits that match the query defined in the request.
 * You can provide search queries using the `q` query string parameter or the request body.
 * If both are specified, only the query parameter is used.
 *
 * If the Elasticsearch security features are enabled, you must have the read index privilege for the target data stream, index, or alias. For cross-cluster search, refer to the documentation about configuring CCS privileges.
 * To search a point in time (PIT) for an alias, you must have the `read` index privilege for the alias's data streams or indices.
 *
 * **Search slicing**
 *
 * When paging through a large number of documents, it can be helpful to split the search into multiple slices to consume them independently with the `slice` and `pit` properties.
 * By default the splitting is done first on the shards, then locally on each shard.
 *
 * For instance if the number of shards is equal to 2 and you request 4 slices, the slices 0 and 2 are assigned to the first shard and the slices 1 and 3 are assigned to the second shard.
 *
 * IMPORTANT: The same point-in-time ID should be used for all slices.
 * If different PIT IDs are used, slices can overlap and miss documents.
 * This situation can occur because, by default, the splitting criterion is based on Lucene document IDs, which are not stable across changes to the index.
 */
export const SearchRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`). To search all data streams and indices, omit this parameter or use `*` or `_all`.').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  allow_partial_search_results: z.boolean().describe('If `true` and there are shard request timeouts or shard failures, the request returns partial results. If `false`, it returns an error with no partial results. To override the default behavior, you can set the `search.default_allow_partial_results` cluster setting to `false`.').optional().meta({ found_in: 'query' }),
  analyzer: z.string().describe('The analyzer to use for the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  analyze_wildcard: z.boolean().describe('If `true`, wildcard and prefix queries are analyzed. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  batched_reduce_size: z.lazy(() => long).describe('The number of shard results that should be reduced at once on the coordinating node. If the potential number of shards in the request can be large, this value should be used as a protection mechanism to reduce the memory overhead per search request.').optional().meta({ found_in: 'query' }),
  ccs_minimize_roundtrips: z.boolean().describe('If `true`, network round-trips between the coordinating node and the remote clusters are minimized when running cross-cluster search (CCS) requests.').optional().meta({ found_in: 'query' }),
  default_operator: z.lazy(() => QueryDslOperator).describe('The default operator for the query string query: `and` or `or`. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  df: z.string().describe('The field to use as a default when no field prefix is given in the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. It supports comma-separated values such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  ignore_throttled: z.boolean().describe('If `true`, concrete, expanded or aliased indices will be ignored when frozen.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  include_named_queries_score: z.boolean().describe('If `true`, the response includes the score contribution from any named queries. This functionality reruns each named query on every hit in a search response. Typically, this adds a small overhead to a request. However, using computationally expensive named queries on a large number of hits may add significant overhead.').optional().meta({ found_in: 'query' }),
  lenient: z.boolean().describe('If `true`, format-based query failures (such as providing text to a numeric field) in the query string will be ignored. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  max_concurrent_shard_requests: z.lazy(() => integer).describe('The number of concurrent shard requests per node that the search runs concurrently. This value should be used to limit the impact of the search on the cluster in order to limit the number of concurrent shard requests.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The nodes and shards used for the search. By default, Elasticsearch selects from eligible nodes and shards using adaptive replica selection, accounting for allocation awareness. Valid values are: * `_only_local` to run the search only on shards on the local node. * `_local` to, if possible, run the search on shards on the local node, or if not, select shards using the default method. * `_only_nodes:<node-id>,<node-id>` to run the search on only the specified nodes IDs. If suitable shards exist on more than one selected node, use shards on those nodes using the default method. If none of the specified nodes are available, select shards from any available node using the default method. * `_prefer_nodes:<node-id>,<node-id>` to if possible, run the search on the specified nodes IDs. If not, select shards using the default method. * `_shards:<shard>,<shard>` to run the search only on the specified shards. You can combine this value with other `preference` values. However, the `_shards` value must come first. For example: `_shards:2,3|_local`. * `<custom-string>` (any string that does not start with `_`) to route searches with the same `<custom-string>` to the same shards in the same order.').optional().meta({ found_in: 'query' }),
  pre_filter_shard_size: z.lazy(() => long).describe('A threshold that enforces a pre-filter roundtrip to prefilter search shards based on query rewriting if the number of shards the search request expands to exceeds the threshold. This filter roundtrip can limit the number of shards significantly if for instance a shard can not match any documents based on its rewrite method (if date filters are mandatory to match but the shard bounds and the query are disjoint). When unspecified, the pre-filter phase is executed if any of these conditions is met: * The request targets more than 128 shards. * The request targets one or more read-only index. * The primary sort of the query targets an indexed field.').optional().meta({ found_in: 'query' }),
  request_cache: z.boolean().describe('If `true`, the caching of search results is enabled for requests where `size` is `0`. It defaults to index level settings.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value that is used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  scroll: z.lazy(() => Duration).describe('The period to retain the search context for scrolling. By default, this value cannot exceed `1d` (24 hours). You can change this limit by using the `search.max_keep_alive` cluster-level setting.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('Indicates how distributed term frequencies are calculated for relevance scoring.').optional().meta({ found_in: 'query' }),
  suggest_field: z.lazy(() => Field).describe('The field to use for suggestions.').optional().meta({ found_in: 'query' }),
  suggest_mode: z.lazy(() => SuggestMode).describe('The suggest mode. This parameter can be used only when the `suggest_field` and `suggest_text` query string parameters are specified.').optional().meta({ found_in: 'query' }),
  suggest_size: z.lazy(() => long).describe('The number of suggestions to return. This parameter can be used only when the `suggest_field` and `suggest_text` query string parameters are specified.').optional().meta({ found_in: 'query' }),
  suggest_text: z.string().describe('The source text for which the suggestions should be returned. This parameter can be used only when the `suggest_field` and `suggest_text` query string parameters are specified.').optional().meta({ found_in: 'query' }),
  typed_keys: z.boolean().describe('If `true`, aggregation and suggester names are be prefixed by their respective types in the response.').optional().meta({ found_in: 'query' }),
  rest_total_hits_as_int: z.boolean().describe('Indicates whether `hits.total` should be rendered as an integer or an object in the rest search response.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('A comma-separated list of source fields to exclude from the response. You can also use this parameter to exclude fields from the subset specified in `_source_includes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  _source_exclude_vectors: z.boolean().describe('Whether vectors should be excluded from _source').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('A comma-separated list of source fields to include in the response. If this parameter is specified, only these source fields are returned. You can exclude fields from this subset using the `_source_excludes` query parameter. If the `_source` parameter is `false`, this parameter is ignored.').optional().meta({ found_in: 'query' }),
  q: z.string().describe('A query in the Lucene query string syntax. Query parameter searches do not support the full Elasticsearch Query DSL but are handy for testing. IMPORTANT: This parameter overrides the query parameter in the request body. If both parameters are specified, documents matching the query request body parameter are not returned.').optional().meta({ found_in: 'query' }),
  aggregations: z.record(z.string(), z.lazy(() => AggregationsAggregationContainer)).describe('Defines the aggregations that are run as part of the search request.').optional().meta({ found_in: 'body' }),
  aggs: z.record(z.string(), z.lazy(() => AggregationsAggregationContainer)).describe('Defines the aggregations that are run as part of the search request.').optional(),
  collapse: z.lazy(() => SearchFieldCollapse).describe('Collapses search results the values of the specified field.').optional().meta({ found_in: 'body' }),
  explain: z.boolean().describe('If `true`, the request returns detailed information about score computation as part of a hit.').optional().meta({ found_in: 'body' }),
  ext: z.record(z.string(), z.any()).describe('Configuration of search extensions defined by Elasticsearch plugins.').optional().meta({ found_in: 'body' }),
  from: z.lazy(() => integer).describe('The starting document offset, which must be non-negative. By default, you cannot page through more than 10,000 hits using the `from` and `size` parameters. To page through more hits, use the `search_after` parameter.').optional().meta({ found_in: 'body' }),
  highlight: z.lazy(() => SearchHighlight).describe('Specifies the highlighter to use for retrieving highlighted snippets from one or more fields in your search results.').optional().meta({ found_in: 'body' }),
  track_total_hits: SearchTrackHits.describe('Number of hits matching the query to count accurately. If `true`, the exact number of hits is returned at the cost of some performance. If `false`, the  response does not include the total number of hits matching the query.').optional().meta({ found_in: 'body' }),
  indices_boost: z.array(z.record(z.lazy(() => IndexName), z.lazy(() => double))).describe('Boost the `_score` of documents from specified indices. The boost value is the factor by which scores are multiplied. A boost value greater than `1.0` increases the score. A boost value between `0` and `1.0` decreases the score.').optional().meta({ found_in: 'body' }),
  docvalue_fields: z.array(z.lazy(() => QueryDslFieldAndFormat)).describe('An array of wildcard (`*`) field patterns. The request returns doc values for field names matching these patterns in the `hits.fields` property of the response.').optional().meta({ found_in: 'body' }),
  knn: z.union([z.lazy(() => KnnSearch), z.array(z.lazy(() => KnnSearch))]).describe('The approximate kNN search to run.').optional().meta({ found_in: 'body' }),
  min_score: z.lazy(() => double).describe('The minimum `_score` for matching documents. Documents with a lower `_score` are not included in search results and results collected by aggregations.').optional().meta({ found_in: 'body' }),
  post_filter: z.lazy(() => QueryDslQueryContainer).describe('Use the `post_filter` parameter to filter search results. The search hits are filtered after the aggregations are calculated. A post filter has no impact on the aggregation results.').optional().meta({ found_in: 'body' }),
  profile: z.boolean().describe('Set to `true` to return detailed timing information about the execution of individual components in a search request. NOTE: This is a debugging tool and adds significant overhead to search execution.').optional().meta({ found_in: 'body' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('The search definition using the Query DSL.').optional().meta({ found_in: 'body' }),
  rescore: z.union([z.lazy(() => SearchRescore), z.array(z.lazy(() => SearchRescore))]).describe('Can be used to improve precision by reordering just the top (for example 100 - 500) documents returned by the `query` and `post_filter` phases.').optional().meta({ found_in: 'body' }),
  retriever: z.lazy(() => RetrieverContainer).describe('A retriever is a specification to describe top documents returned from a search. A retriever replaces other elements of the search API that also return top documents such as `query` and `knn`.').optional().meta({ found_in: 'body' }),
  script_fields: z.record(z.string(), z.lazy(() => ScriptField)).describe('Retrieve a script evaluation (based on different fields) for each hit.').optional().meta({ found_in: 'body' }),
  search_after: z.lazy(() => SortResults).describe('Used to retrieve the next page of hits using a set of sort values from the previous page.').optional().meta({ found_in: 'body' }),
  size: z.lazy(() => integer).describe('The number of hits to return, which must not be negative. By default, you cannot page through more than 10,000 hits using the `from` and `size` parameters. To page through more hits, use the `search_after` property.').optional().meta({ found_in: 'body' }),
  slice: z.lazy(() => SlicedScroll).describe('Split a scrolled search into multiple slices that can be consumed independently.').optional().meta({ found_in: 'body' }),
  sort: z.lazy(() => Sort).describe('A comma-separated list of <field>:<direction> pairs.').optional().meta({ found_in: 'body' }),
  _source: z.lazy(() => SearchSourceConfig).describe('The source fields that are returned for matching documents. These fields are returned in the `hits._source` property of the search response. If the `stored_fields` property is specified, the `_source` property defaults to `false`. Otherwise, it defaults to `true`.').optional().meta({ found_in: 'body' }),
  fields: z.array(z.lazy(() => QueryDslFieldAndFormat)).describe('An array of wildcard (`*`) field patterns. The request returns values for field names matching these patterns in the `hits.fields` property of the response.').optional().meta({ found_in: 'body' }),
  suggest: SearchSuggester.describe('Defines a suggester that provides similar looking terms based on a provided text.').optional().meta({ found_in: 'body' }),
  terminate_after: z.lazy(() => long).describe('The maximum number of documents to collect for each shard. If a query reaches this limit, Elasticsearch terminates the query early. Elasticsearch collects documents before sorting. IMPORTANT: Use with caution. Elasticsearch applies this property to each shard handling the request. When possible, let Elasticsearch perform early termination automatically. Avoid specifying this property for requests that target data streams with backing indices across multiple data tiers. If set to `0` (default), the query does not terminate early.').optional().meta({ found_in: 'body' }),
  timeout: z.string().describe('The period of time to wait for a response from each shard. If no response is received before the timeout expires, the request fails and returns an error. Defaults to no timeout.').optional().meta({ found_in: 'body' }),
  track_scores: z.boolean().describe('If `true`, calculate and return document scores, even if the scores are not used for sorting.').optional().meta({ found_in: 'body' }),
  version: z.boolean().describe('If `true`, the request returns the document version as part of a hit.').optional().meta({ found_in: 'body' }),
  seq_no_primary_term: z.boolean().describe('If `true`, the request returns sequence number and primary term of the last modification of each hit.').optional().meta({ found_in: 'body' }),
  stored_fields: z.lazy(() => Fields).describe('A comma-separated list of stored fields to return as part of a hit. If no fields are specified, no stored fields are included in the response. If this field is specified, the `_source` property defaults to `false`. You can pass `_source: true` to return both source fields and stored fields in the search response.').optional().meta({ found_in: 'body' }),
  pit: SearchPointInTimeReference.describe('Limit the search to a point in time (PIT). If you provide a PIT, you cannot specify an `<index>` in the request path.').optional().meta({ found_in: 'body' }),
  runtime_mappings: z.lazy(() => MappingRuntimeFields).describe('One or more runtime fields in the search request. These fields take precedence over mapped fields with the same name.').optional().meta({ found_in: 'body' }),
  stats: z.array(z.string()).describe('The stats groups to associate with the search. Each group maintains a statistics aggregation for its associated searches. You can retrieve these stats using the indices stats API.').optional().meta({ found_in: 'body' })
}).meta({ id: 'SearchRequest' })
export type SearchRequest = z.infer<typeof SearchRequest>

export const SearchResponse = SearchResponseBody.meta({ id: 'SearchResponse' })
export type SearchResponse = z.infer<typeof SearchResponse>

export const SearchCompletionContext = z.object({
  boost: z.lazy(() => double).describe('The factor by which the score of the suggestion should be boosted. The score is computed by multiplying the boost with the suggestion weight.').optional(),
  context: SearchContext.describe('The value of the category to filter/boost on.'),
  neighbours: z.array(z.lazy(() => GeoHashPrecision)).describe('An array of precision values at which neighboring geohashes should be taken into account. Precision value can be a distance value (`5m`, `10km`, etc.) or a raw geohash precision (`1`..`12`). Defaults to generating neighbors for index time precision level.').optional(),
  precision: z.lazy(() => GeoHashPrecision).describe('The precision of the geohash to encode the query geo point. Can be specified as a distance value (`5m`, `10km`, etc.), or as a raw geohash precision (`1`..`12`). Defaults to index time precision level.').optional(),
  prefix: z.boolean().describe('Whether the category value should be treated as a prefix or not.').optional()
}).meta({ id: 'SearchCompletionContext' })
export type SearchCompletionContext = z.infer<typeof SearchCompletionContext>

export const SearchSuggesterBase = z.object({
  field: z.lazy(() => Field).describe('The field to fetch the candidate suggestions from. Needs to be set globally or per suggestion.'),
  analyzer: z.string().describe('The analyzer to analyze the suggest text with. Defaults to the search analyzer of the suggest field.').optional(),
  size: z.lazy(() => integer).describe('The maximum corrections to be returned per suggest text token.').optional()
}).meta({ id: 'SearchSuggesterBase' })
export type SearchSuggesterBase = z.infer<typeof SearchSuggesterBase>

export const SearchSuggestFuzziness = z.object({
  fuzziness: z.lazy(() => Fuzziness).describe('The fuzziness factor.').optional(),
  min_length: z.lazy(() => integer).describe('Minimum length of the input before fuzzy suggestions are returned.').optional(),
  prefix_length: z.lazy(() => integer).describe('Minimum length of the input, which is not checked for fuzzy alternatives.').optional(),
  transpositions: z.boolean().describe('If set to `true`, transpositions are counted as one change instead of two.').optional(),
  unicode_aware: z.boolean().describe('If `true`, all measurements (like fuzzy edit distance, transpositions, and lengths) are measured in Unicode code points instead of in bytes. This is slightly slower than raw bytes.').optional()
}).meta({ id: 'SearchSuggestFuzziness' })
export type SearchSuggestFuzziness = z.infer<typeof SearchSuggestFuzziness>

export const SearchRegexOptions = z.object({
  flags: z.union([z.lazy(() => integer), z.string()]).describe('Optional operators for the regular expression.').optional(),
  max_determinized_states: z.lazy(() => integer).describe('Maximum number of automaton states required for the query.').optional()
}).meta({ id: 'SearchRegexOptions' })
export type SearchRegexOptions = z.infer<typeof SearchRegexOptions>

export const SearchCompletionSuggester = z.object({
  ...SearchSuggesterBase.shape,
  contexts: z.record(z.lazy(() => Field), z.union([SearchCompletionContext, z.array(SearchCompletionContext)])).describe('A value, geo point object, or a geo hash string to filter or boost the suggestion on.').optional(),
  fuzzy: SearchSuggestFuzziness.describe('Enables fuzziness, meaning you can have a typo in your search and still get results back.').optional(),
  regex: SearchRegexOptions.describe('A regex query that expresses a prefix as a regular expression.').optional(),
  skip_duplicates: z.boolean().describe('Whether duplicate suggestions should be filtered out.').optional()
}).meta({ id: 'SearchCompletionSuggester' })
export type SearchCompletionSuggester = z.infer<typeof SearchCompletionSuggester>

export const SearchDirectGenerator = z.object({
  field: z.lazy(() => Field).describe('The field to fetch the candidate suggestions from. Needs to be set globally or per suggestion.'),
  max_edits: z.lazy(() => integer).describe('The maximum edit distance candidate suggestions can have in order to be considered as a suggestion. Can only be `1` or `2`.').optional(),
  max_inspections: z.lazy(() => float).describe('A factor that is used to multiply with the shard_size in order to inspect more candidate spelling corrections on the shard level. Can improve accuracy at the cost of performance.').optional(),
  max_term_freq: z.lazy(() => float).describe('The maximum threshold in number of documents in which a suggest text token can exist in order to be included. This can be used to exclude high frequency terms—which are usually spelled correctly—from being spellchecked. Can be a relative percentage number (for example `0.4`) or an absolute number to represent document frequencies. If a value higher than 1 is specified, then fractional can not be specified.').optional(),
  min_doc_freq: z.lazy(() => float).describe('The minimal threshold in number of documents a suggestion should appear in. This can improve quality by only suggesting high frequency terms. Can be specified as an absolute number or as a relative percentage of number of documents. If a value higher than 1 is specified, the number cannot be fractional.').optional(),
  min_word_length: z.lazy(() => integer).describe('The minimum length a suggest text term must have in order to be included.').optional(),
  post_filter: z.string().describe('A filter (analyzer) that is applied to each of the generated tokens before they are passed to the actual phrase scorer.').optional(),
  pre_filter: z.string().describe('A filter (analyzer) that is applied to each of the tokens passed to this candidate generator. This filter is applied to the original token before candidates are generated.').optional(),
  prefix_length: z.lazy(() => integer).describe('The number of minimal prefix characters that must match in order be a candidate suggestions. Increasing this number improves spellcheck performance.').optional(),
  size: z.lazy(() => integer).describe('The maximum corrections to be returned per suggest text token.').optional(),
  suggest_mode: z.lazy(() => SuggestMode).describe('Controls what suggestions are included on the suggestions generated on each shard.').optional()
}).meta({ id: 'SearchDirectGenerator' })
export type SearchDirectGenerator = z.infer<typeof SearchDirectGenerator>

export const SearchPhraseSuggestCollateQuery = z.object({
  id: z.lazy(() => Id).describe('The search template ID.').optional(),
  source: z.lazy(() => ScriptSource).describe('The query source.').optional()
}).meta({ id: 'SearchPhraseSuggestCollateQuery' })
export type SearchPhraseSuggestCollateQuery = z.infer<typeof SearchPhraseSuggestCollateQuery>

export const SearchPhraseSuggestCollate = z.object({
  params: z.record(z.string(), z.any()).describe('Parameters to use if the query is templated.').optional(),
  prune: z.boolean().describe('Returns all suggestions with an extra `collate_match` option indicating whether the generated phrase matched any document.').optional(),
  query: SearchPhraseSuggestCollateQuery.describe('A collate query that is run once for every suggestion.')
}).meta({ id: 'SearchPhraseSuggestCollate' })
export type SearchPhraseSuggestCollate = z.infer<typeof SearchPhraseSuggestCollate>

export const SearchPhraseSuggestHighlight = z.object({
  post_tag: z.string().describe('Use in conjunction with `pre_tag` to define the HTML tags to use for the highlighted text.'),
  pre_tag: z.string().describe('Use in conjunction with `post_tag` to define the HTML tags to use for the highlighted text.')
}).meta({ id: 'SearchPhraseSuggestHighlight' })
export type SearchPhraseSuggestHighlight = z.infer<typeof SearchPhraseSuggestHighlight>

export const SearchLaplaceSmoothingModel = z.object({
  alpha: z.lazy(() => double).describe('A constant that is added to all counts to balance weights.')
}).meta({ id: 'SearchLaplaceSmoothingModel' })
export type SearchLaplaceSmoothingModel = z.infer<typeof SearchLaplaceSmoothingModel>

export const SearchLinearInterpolationSmoothingModel = z.object({
  bigram_lambda: z.lazy(() => double),
  trigram_lambda: z.lazy(() => double),
  unigram_lambda: z.lazy(() => double)
}).meta({ id: 'SearchLinearInterpolationSmoothingModel' })
export type SearchLinearInterpolationSmoothingModel = z.infer<typeof SearchLinearInterpolationSmoothingModel>

export const SearchStupidBackoffSmoothingModel = z.object({
  discount: z.lazy(() => double).describe('A constant factor that the lower order n-gram model is discounted by.')
}).meta({ id: 'SearchStupidBackoffSmoothingModel' })
export type SearchStupidBackoffSmoothingModel = z.infer<typeof SearchStupidBackoffSmoothingModel>

const SearchSmoothingModelContainerExclusiveProps = z.union([z.object({ laplace: SearchLaplaceSmoothingModel }), z.object({ linear_interpolation: SearchLinearInterpolationSmoothingModel }), z.object({ stupid_backoff: SearchStupidBackoffSmoothingModel })])

export const SearchSmoothingModelContainer = SearchSmoothingModelContainerExclusiveProps.meta({ id: 'SearchSmoothingModelContainer' })
export type SearchSmoothingModelContainer = z.infer<typeof SearchSmoothingModelContainer>

export const SearchPhraseSuggester = z.object({
  ...SearchSuggesterBase.shape,
  collate: SearchPhraseSuggestCollate.describe('Checks each suggestion against the specified query to prune suggestions for which no matching docs exist in the index.').optional(),
  confidence: z.lazy(() => double).describe('Defines a factor applied to the input phrases score, which is used as a threshold for other suggest candidates. Only candidates that score higher than the threshold will be included in the result.').optional(),
  direct_generator: z.array(SearchDirectGenerator).describe('A list of candidate generators that produce a list of possible terms per term in the given text.').optional(),
  force_unigrams: z.boolean().optional(),
  gram_size: z.lazy(() => integer).describe('Sets max size of the n-grams (shingles) in the field. If the field doesn’t contain n-grams (shingles), this should be omitted or set to `1`. If the field uses a shingle filter, the `gram_size` is set to the `max_shingle_size` if not explicitly set.').optional(),
  highlight: SearchPhraseSuggestHighlight.describe('Sets up suggestion highlighting. If not provided, no highlighted field is returned.').optional(),
  max_errors: z.lazy(() => double).describe('The maximum percentage of the terms considered to be misspellings in order to form a correction. This method accepts a float value in the range `[0..1)` as a fraction of the actual query terms or a number `>=1` as an absolute number of query terms.').optional(),
  real_word_error_likelihood: z.lazy(() => double).describe('The likelihood of a term being misspelled even if the term exists in the dictionary.').optional(),
  separator: z.string().describe('The separator that is used to separate terms in the bigram field. If not set, the whitespace character is used as a separator.').optional(),
  shard_size: z.lazy(() => integer).describe('Sets the maximum number of suggested terms to be retrieved from each individual shard.').optional(),
  smoothing: SearchSmoothingModelContainer.describe('The smoothing model used to balance weight between infrequent grams (grams (shingles) are not existing in the index) and frequent grams (appear at least once in the index). The default model is Stupid Backoff.').optional(),
  token_limit: z.lazy(() => integer).optional()
}).meta({ id: 'SearchPhraseSuggester' })
export type SearchPhraseSuggester = z.infer<typeof SearchPhraseSuggester>

export const SearchSuggestSort = z.enum(['score', 'frequency']).meta({ id: 'SearchSuggestSort' })
export type SearchSuggestSort = z.infer<typeof SearchSuggestSort>

export const SearchStringDistance = z.enum(['internal', 'damerau_levenshtein', 'levenshtein', 'jaro_winkler', 'ngram']).meta({ id: 'SearchStringDistance' })
export type SearchStringDistance = z.infer<typeof SearchStringDistance>

export const SearchTermSuggester = z.object({
  ...SearchSuggesterBase.shape,
  lowercase_terms: z.boolean().optional(),
  max_edits: z.lazy(() => integer).describe('The maximum edit distance candidate suggestions can have in order to be considered as a suggestion. Can only be `1` or `2`.').optional(),
  max_inspections: z.lazy(() => integer).describe('A factor that is used to multiply with the shard_size in order to inspect more candidate spelling corrections on the shard level. Can improve accuracy at the cost of performance.').optional(),
  max_term_freq: z.lazy(() => float).describe('The maximum threshold in number of documents in which a suggest text token can exist in order to be included. Can be a relative percentage number (for example `0.4`) or an absolute number to represent document frequencies. If a value higher than 1 is specified, then fractional can not be specified.').optional(),
  min_doc_freq: z.lazy(() => float).describe('The minimal threshold in number of documents a suggestion should appear in. This can improve quality by only suggesting high frequency terms. Can be specified as an absolute number or as a relative percentage of number of documents. If a value higher than 1 is specified, then the number cannot be fractional.').optional(),
  min_word_length: z.lazy(() => integer).describe('The minimum length a suggest text term must have in order to be included.').optional(),
  prefix_length: z.lazy(() => integer).describe('The number of minimal prefix characters that must match in order be a candidate for suggestions. Increasing this number improves spellcheck performance.').optional(),
  shard_size: z.lazy(() => integer).describe('Sets the maximum number of suggestions to be retrieved from each individual shard.').optional(),
  sort: SearchSuggestSort.describe('Defines how suggestions should be sorted per suggest text term.').optional(),
  string_distance: SearchStringDistance.describe('The string distance implementation to use for comparing how similar suggested terms are.').optional(),
  suggest_mode: z.lazy(() => SuggestMode).describe('Controls what suggestions are included or controls for what suggest text terms, suggestions should be suggested.').optional()
}).meta({ id: 'SearchTermSuggester' })
export type SearchTermSuggester = z.infer<typeof SearchTermSuggester>

const SearchFieldSuggesterCommonProps = z.object({
  prefix: z.string().describe('Prefix used to search for suggestions.').optional(),
  regex: z.string().describe('A prefix expressed as a regular expression.').optional(),
  text: z.string().describe('The text to use as input for the suggester. Needs to be set globally or per suggestion.').optional()
})

const SearchFieldSuggesterExclusiveProps = z.union([z.object({ completion: SearchCompletionSuggester }), z.object({ phrase: SearchPhraseSuggester }), z.object({ term: SearchTermSuggester })])

export const SearchFieldSuggester = SearchFieldSuggesterCommonProps.and(SearchFieldSuggesterExclusiveProps).meta({ id: 'SearchFieldSuggester' })
export type SearchFieldSuggester = z.infer<typeof SearchFieldSuggester>

export const SearchMvtZoomLevel = z.lazy(() => integer).meta({ id: 'SearchMvtZoomLevel' })
export type SearchMvtZoomLevel = z.infer<typeof SearchMvtZoomLevel>

export const SearchMvtCoordinate = z.lazy(() => integer).meta({ id: 'SearchMvtCoordinate' })
export type SearchMvtCoordinate = z.infer<typeof SearchMvtCoordinate>

export const SearchMvtGridAggregationType = z.enum(['geotile', 'geohex']).meta({ id: 'SearchMvtGridAggregationType' })
export type SearchMvtGridAggregationType = z.infer<typeof SearchMvtGridAggregationType>

export const SearchMvtGridType = z.enum(['grid', 'point', 'centroid']).meta({ id: 'SearchMvtGridType' })
export type SearchMvtGridType = z.infer<typeof SearchMvtGridType>

/**
 * Search a vector tile.
 *
 * Search a vector tile for geospatial values.
 * Before using this API, you should be familiar with the Mapbox vector tile specification.
 * The API returns results as a binary mapbox vector tile.
 *
 * Internally, Elasticsearch translates a vector tile search API request into a search containing:
 *
 * * A `geo_bounding_box` query on the `<field>`. The query uses the `<zoom>/<x>/<y>` tile as a bounding box.
 * * A `geotile_grid` or `geohex_grid` aggregation on the `<field>`. The `grid_agg` parameter determines the aggregation type. The aggregation uses the `<zoom>/<x>/<y>` tile as a bounding box.
 * * Optionally, a `geo_bounds` aggregation on the `<field>`. The search only includes this aggregation if the `exact_bounds` parameter is `true`.
 * * If the optional parameter `with_labels` is `true`, the internal search will include a dynamic runtime field that calls the `getLabelPosition` function of the geometry doc value. This enables the generation of new point features containing suggested geometry labels, so that, for example, multi-polygons will have only one label.
 *
 * The API returns results as a binary Mapbox vector tile.
 * Mapbox vector tiles are encoded as Google Protobufs (PBF). By default, the tile contains three layers:
 *
 * * A `hits` layer containing a feature for each `<field>` value matching the `geo_bounding_box` query.
 * * An `aggs` layer containing a feature for each cell of the `geotile_grid` or `geohex_grid`. The layer only contains features for cells with matching data.
 * * A meta layer containing:
 *   * A feature containing a bounding box. By default, this is the bounding box of the tile.
 *   * Value ranges for any sub-aggregations on the `geotile_grid` or `geohex_grid`.
 *   * Metadata for the search.
 *
 * The API only returns features that can display at its zoom level.
 * For example, if a polygon feature has no area at its zoom level, the API omits it.
 * The API returns errors as UTF-8 encoded JSON.
 *
 * IMPORTANT: You can specify several options for this API as either a query parameter or request body parameter.
 * If you specify both parameters, the query parameter takes precedence.
 *
 * **Grid precision for geotile**
 *
 * For a `grid_agg` of `geotile`, you can use cells in the `aggs` layer as tiles for lower zoom levels.
 * `grid_precision` represents the additional zoom levels available through these cells. The final precision is computed by as follows: `<zoom> + grid_precision`.
 * For example, if `<zoom>` is 7 and `grid_precision` is 8, then the `geotile_grid` aggregation will use a precision of 15.
 * The maximum final precision is 29.
 * The `grid_precision` also determines the number of cells for the grid as follows: `(2^grid_precision) x (2^grid_precision)`.
 * For example, a value of 8 divides the tile into a grid of 256 x 256 cells.
 * The `aggs` layer only contains features for cells with matching data.
 *
 * **Grid precision for geohex**
 *
 * For a `grid_agg` of `geohex`, Elasticsearch uses `<zoom>` and `grid_precision` to calculate a final precision as follows: `<zoom> + grid_precision`.
 *
 * This precision determines the H3 resolution of the hexagonal cells produced by the `geohex` aggregation.
 * The following table maps the H3 resolution for each precision.
 * For example, if `<zoom>` is 3 and `grid_precision` is 3, the precision is 6.
 * At a precision of 6, hexagonal cells have an H3 resolution of 2.
 * If `<zoom>` is 3 and `grid_precision` is 4, the precision is 7.
 * At a precision of 7, hexagonal cells have an H3 resolution of 3.
 *
 * | Precision | Unique tile bins | H3 resolution | Unique hex bins | Ratio |
 * | --------- | ---------------- | ------------- | ----------------| ----- |
 * | 1  | 4                  | 0  | 122             | 30.5           |
 * | 2  | 16                 | 0  | 122             | 7.625          |
 * | 3  | 64                 | 1  | 842             | 13.15625       |
 * | 4  | 256                | 1  | 842             | 3.2890625      |
 * | 5  | 1024               | 2  | 5882            | 5.744140625    |
 * | 6  | 4096               | 2  | 5882            | 1.436035156    |
 * | 7  | 16384              | 3  | 41162           | 2.512329102    |
 * | 8  | 65536              | 3  | 41162           | 0.6280822754   |
 * | 9  | 262144             | 4  | 288122          | 1.099098206    |
 * | 10 | 1048576            | 4  | 288122          | 0.2747745514   |
 * | 11 | 4194304            | 5  | 2016842         | 0.4808526039   |
 * | 12 | 16777216           | 6  | 14117882        | 0.8414913416   |
 * | 13 | 67108864           | 6  | 14117882        | 0.2103728354   |
 * | 14 | 268435456          | 7  | 98825162        | 0.3681524172   |
 * | 15 | 1073741824         | 8  | 691776122       | 0.644266719    |
 * | 16 | 4294967296         | 8  | 691776122       | 0.1610666797   |
 * | 17 | 17179869184        | 9  | 4842432842      | 0.2818666889   |
 * | 18 | 68719476736        | 10 | 33897029882     | 0.4932667053   |
 * | 19 | 274877906944       | 11 | 237279209162    | 0.8632167343   |
 * | 20 | 1099511627776      | 11 | 237279209162    | 0.2158041836   |
 * | 21 | 4398046511104      | 12 | 1660954464122   | 0.3776573213   |
 * | 22 | 17592186044416     | 13 | 11626681248842  | 0.6609003122   |
 * | 23 | 70368744177664     | 13 | 11626681248842  | 0.165225078    |
 * | 24 | 281474976710656    | 14 | 81386768741882  | 0.2891438866   |
 * | 25 | 1125899906842620   | 15 | 569707381193162 | 0.5060018015   |
 * | 26 | 4503599627370500   | 15 | 569707381193162 | 0.1265004504   |
 * | 27 | 18014398509482000  | 15 | 569707381193162 | 0.03162511259  |
 * | 28 | 72057594037927900  | 15 | 569707381193162 | 0.007906278149 |
 * | 29 | 288230376151712000 | 15 | 569707381193162 | 0.001976569537 |
 *
 * Hexagonal cells don't align perfectly on a vector tile.
 * Some cells may intersect more than one vector tile.
 * To compute the H3 resolution for each precision, Elasticsearch compares the average density of hexagonal bins at each resolution with the average density of tile bins at each zoom level.
 * Elasticsearch uses the H3 resolution that is closest to the corresponding geotile density.
 *
 * Learn how to use the vector tile search API with practical examples in the [Vector tile search examples](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/vector-tile-search) guide.
 */
export const SearchMvtRequest = z.object({
  index: z.lazy(() => Indices).describe('A list of indices, data streams, or aliases to search. It supports wildcards (`*`). To search all data streams and indices, omit this parameter or use `*` or `_all`. To search a remote cluster, use the `<cluster>:<target>` syntax.').meta({ found_in: 'path' }),
  field: z.lazy(() => Field).describe('A field that contains the geospatial data to return. It must be a `geo_point` or `geo_shape` field. The field must have doc values enabled. It cannot be a nested field. NOTE: Vector tiles do not natively support geometry collections. For `geometrycollection` values in a `geo_shape` field, the API returns a hits layer feature for each element of the collection. This behavior may change in a future release.').meta({ found_in: 'path' }),
  zoom: SearchMvtZoomLevel.describe('The zoom level of the vector tile to search. It accepts `0` to `29`.').meta({ found_in: 'path' }),
  x: SearchMvtCoordinate.describe('The X coordinate for the vector tile to search.').meta({ found_in: 'path' }),
  y: SearchMvtCoordinate.describe('The Y coordinate for the vector tile to search.').meta({ found_in: 'path' }),
  aggs: z.record(z.string(), z.lazy(() => AggregationsAggregationContainer)).describe('Sub-aggregations for the geotile_grid. It supports the following aggregation types: - `avg` - `boxplot` - `cardinality` - `extended stats` - `max` - `median absolute deviation` - `min` - `percentile` - `percentile-rank` - `stats` - `sum` - `value count` The aggregation names can\'t start with `_mvt_`. The `_mvt_` prefix is reserved for internal aggregations.').optional().meta({ found_in: 'body' }),
  buffer: z.lazy(() => integer).describe('The size, in pixels, of a clipping buffer outside the tile. This allows renderers to avoid outline artifacts from geometries that extend past the extent of the tile.').optional().meta({ found_in: 'body' }),
  exact_bounds: z.boolean().describe('If `false`, the meta layer\'s feature is the bounding box of the tile. If `true`, the meta layer\'s feature is a bounding box resulting from a `geo_bounds` aggregation. The aggregation runs on <field> values that intersect the `<zoom>/<x>/<y>` tile with `wrap_longitude` set to `false`. The resulting bounding box may be larger than the vector tile.').optional().meta({ found_in: 'body' }),
  extent: z.lazy(() => integer).describe('The size, in pixels, of a side of the tile. Vector tiles are square with equal sides.').optional().meta({ found_in: 'body' }),
  fields: z.lazy(() => Fields).describe('The fields to return in the `hits` layer. It supports wildcards (`*`). This parameter does not support fields with array values. Fields with array values may return inconsistent results.').optional().meta({ found_in: 'body' }),
  grid_agg: SearchMvtGridAggregationType.describe('The aggregation used to create a grid for the `field`.').optional().meta({ found_in: 'body' }),
  grid_precision: z.lazy(() => integer).describe('Additional zoom levels available through the aggs layer. For example, if `<zoom>` is `7` and `grid_precision` is `8`, you can zoom in up to level 15. Accepts 0-8. If 0, results don\'t include the aggs layer.').optional().meta({ found_in: 'body' }),
  grid_type: SearchMvtGridType.describe('Determines the geometry type for features in the aggs layer. In the aggs layer, each feature represents a `geotile_grid` cell. If `grid, each feature is a polygon of the cells bounding box. If `point`, each feature is a Point that is the centroid of the cell.').optional().meta({ found_in: 'body' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('The query DSL used to filter documents for the search.').optional().meta({ found_in: 'body' }),
  runtime_mappings: z.lazy(() => MappingRuntimeFields).describe('Defines one or more runtime fields in the search request. These fields take precedence over mapped fields with the same name.').optional().meta({ found_in: 'body' }),
  size: z.lazy(() => integer).describe('The maximum number of features to return in the hits layer. Accepts 0-10000. If 0, results don\'t include the hits layer.').optional().meta({ found_in: 'body' }),
  sort: z.lazy(() => Sort).describe('Sort the features in the hits layer. By default, the API calculates a bounding box for each feature. It sorts features based on this box\'s diagonal length, from longest to shortest.').optional().meta({ found_in: 'body' }),
  track_total_hits: SearchTrackHits.describe('The number of hits matching the query to count accurately. If `true`, the exact number of hits is returned at the cost of some performance. If `false`, the response does not include the total number of hits matching the query.').optional().meta({ found_in: 'body' }),
  with_labels: z.boolean().describe('If `true`, the hits and aggs layers will contain additional point features representing suggested label positions for the original features. * `Point` and `MultiPoint` features will have one of the points selected. * `Polygon` and `MultiPolygon` features will have a single point generated, either the centroid, if it is within the polygon, or another point within the polygon selected from the sorted triangle-tree. * `LineString` features will likewise provide a roughly central point selected from the triangle-tree. * The aggregation results will provide one central point for each aggregation bucket. All attributes from the original features will also be copied to the new label features. In addition, the new features will be distinguishable using the tag `_mvt_label_position`.').optional().meta({ found_in: 'body' })
}).meta({ id: 'SearchMvtRequest' })
export type SearchMvtRequest = z.infer<typeof SearchMvtRequest>

export const SearchMvtResponse = z.lazy(() => MapboxVectorTiles).meta({ id: 'SearchMvtResponse' })
export type SearchMvtResponse = z.infer<typeof SearchMvtResponse>

/**
 * Get the search shards.
 *
 * Get the indices and shards that a search request would be run against.
 * This information can be useful for working out issues or planning optimizations with routing and shard preferences.
 * When filtered aliases are used, the filter is returned as part of the `indices` section.
 *
 * If the Elasticsearch security features are enabled, you must have the `view_index_metadata` or `manage` index privilege for the target data stream, index, or alias.
 */
export const SearchShardsRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`). To search all data streams and indices, omit this parameter or use `*` or `_all`.').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('Type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. Supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  local: z.boolean().describe('If `true`, the request retrieves information from the local node only.').optional().meta({ found_in: 'query' }),
  master_timeout: z.lazy(() => Duration).describe('The period to wait for a connection to the master node. If the master node is not available before the timeout expires, the request fails and returns an error. IT can also be set to `-1` to indicate that the request should never timeout.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' })
}).meta({ id: 'SearchShardsRequest' })
export type SearchShardsRequest = z.infer<typeof SearchShardsRequest>

export const SearchShardsSearchShardsNodeAttributes = z.object({
  name: z.lazy(() => NodeName).describe('The human-readable identifier of the node.'),
  ephemeral_id: z.lazy(() => Id).describe('The ephemeral ID of the node.'),
  transport_address: z.lazy(() => TransportAddress).describe('The host and port where transport HTTP connections are accepted.'),
  external_id: z.string(),
  attributes: z.record(z.string(), z.string()).describe('Lists node attributes.'),
  roles: z.lazy(() => NodeRoles),
  version: z.lazy(() => VersionString),
  min_index_version: z.lazy(() => integer),
  max_index_version: z.lazy(() => integer)
}).meta({ id: 'SearchShardsSearchShardsNodeAttributes' })
export type SearchShardsSearchShardsNodeAttributes = z.infer<typeof SearchShardsSearchShardsNodeAttributes>

export const SearchShardsShardStoreIndex = z.object({
  aliases: z.array(z.lazy(() => Name)).optional(),
  filter: z.lazy(() => QueryDslQueryContainer).optional()
}).meta({ id: 'SearchShardsShardStoreIndex' })
export type SearchShardsShardStoreIndex = z.infer<typeof SearchShardsShardStoreIndex>

export const SearchShardsResponse = z.object({
  nodes: z.record(z.lazy(() => NodeId), SearchShardsSearchShardsNodeAttributes),
  shards: z.array(z.array(z.lazy(() => NodeShard))),
  indices: z.record(z.lazy(() => IndexName), SearchShardsShardStoreIndex)
}).meta({ id: 'SearchShardsResponse' })
export type SearchShardsResponse = z.infer<typeof SearchShardsResponse>

/** Run a search with a search template. */
export const SearchTemplateRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`).').optional().meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  ccs_minimize_roundtrips: z.boolean().describe('Indicates whether network round-trips should be minimized as part of cross-cluster search requests execution.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. Supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  ignore_throttled: z.boolean().describe('If `true`, specified concrete, expanded, or aliased indices are not included in the response when throttled.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  scroll: z.lazy(() => Duration).describe('Specifies how long a consistent view of the index should be maintained for scrolled search.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('The type of the search operation.').optional().meta({ found_in: 'query' }),
  rest_total_hits_as_int: z.boolean().describe('If `true`, `hits.total` is rendered as an integer in the response. If `false`, it is rendered as an object.').optional().meta({ found_in: 'query' }),
  typed_keys: z.boolean().describe('If `true`, the response prefixes aggregation and suggester names with their respective types.').optional().meta({ found_in: 'query' }),
  explain: z.boolean().describe('If `true`, returns detailed information about score calculation as part of each hit. If you specify both this and the `explain` query parameter, the API uses only the query parameter.').optional().meta({ found_in: 'body' }),
  id: z.lazy(() => Id).describe('The ID of the search template to use. If no `source` is specified, this parameter is required.').optional().meta({ found_in: 'body' }),
  params: z.record(z.string(), z.any()).describe('Key-value pairs used to replace Mustache variables in the template. The key is the variable name. The value is the variable value.').optional().meta({ found_in: 'body' }),
  profile: z.boolean().describe('If `true`, the query execution is profiled.').optional().meta({ found_in: 'body' }),
  source: z.lazy(() => ScriptSource).describe('An inline search template. Supports the same parameters as the search API\'s request body. It also supports Mustache variables. If no `id` is specified, this parameter is required.').optional().meta({ found_in: 'body' })
}).meta({ id: 'SearchTemplateRequest' })
export type SearchTemplateRequest = z.infer<typeof SearchTemplateRequest>

export const SearchTemplateResponse = z.object({
  took: z.lazy(() => long),
  timed_out: z.boolean(),
  _shards: z.lazy(() => ShardStatistics),
  hits: z.lazy(() => SearchHitsMetadata),
  aggregations: z.record(z.lazy(() => AggregateName), z.lazy(() => AggregationsAggregate)).optional(),
  _clusters: z.lazy(() => ClusterStatistics).optional(),
  fields: z.record(z.string(), z.any()).optional(),
  max_score: z.lazy(() => double).optional(),
  num_reduce_phases: z.lazy(() => long).optional(),
  profile: SearchProfile.optional(),
  pit_id: z.lazy(() => Id).optional(),
  _scroll_id: z.lazy(() => ScrollId).optional(),
  suggest: z.record(z.lazy(() => SuggestionName), z.array(SearchSuggest)).optional(),
  terminated_early: z.boolean().optional()
}).meta({ id: 'SearchTemplateResponse' })
export type SearchTemplateResponse = z.infer<typeof SearchTemplateResponse>

/**
 * Get terms in an index.
 *
 * Discover terms that match a partial string in an index.
 * This API is designed for low-latency look-ups used in auto-complete scenarios.
 *
 * > info
 * > The terms enum API may return terms from deleted documents. Deleted documents are initially only marked as deleted. It is not until their segments are merged that documents are actually deleted. Until that happens, the terms enum API will return terms from these documents.
 */
export const TermsEnumRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and index aliases to search. Wildcard (`*`) expressions are supported. To search all data streams or indices, omit this parameter or use `*`  or `_all`.').meta({ found_in: 'path' }),
  field: z.lazy(() => Field).describe('The string to match at the start of indexed terms. If not provided, all terms in the field are considered.').meta({ found_in: 'body' }),
  size: z.lazy(() => integer).describe('The number of matching terms to return.').optional().meta({ found_in: 'body' }),
  timeout: z.lazy(() => Duration).describe('The maximum length of time to spend collecting results. If the timeout is exceeded the `complete` flag set to `false` in the response and the results may be partial or empty.').optional().meta({ found_in: 'body' }),
  case_insensitive: z.boolean().describe('When `true`, the provided search string is matched against index terms without case sensitivity.').optional().meta({ found_in: 'body' }),
  index_filter: z.lazy(() => QueryDslQueryContainer).describe('Filter an index shard if the provided query rewrites to `match_none`.').optional().meta({ found_in: 'body' }),
  string: z.string().describe('The string to match at the start of indexed terms. If it is not provided, all terms in the field are considered. > info > The prefix string cannot be larger than the largest possible keyword value, which is Lucene\'s term byte-length limit of 32766.').optional().meta({ found_in: 'body' }),
  search_after: z.string().describe('The string after which terms in the index should be returned. It allows for a form of pagination if the last result from one request is passed as the `search_after` parameter for a subsequent request.').optional().meta({ found_in: 'body' })
}).meta({ id: 'TermsEnumRequest' })
export type TermsEnumRequest = z.infer<typeof TermsEnumRequest>

export const TermsEnumResponse = z.object({
  _shards: z.lazy(() => ShardStatistics),
  terms: z.array(z.string()),
  complete: z.boolean().describe('If `false`, the returned terms set may be incomplete and should be treated as approximate. This can occur due to a few reasons, such as a request timeout or a node error.')
}).meta({ id: 'TermsEnumResponse' })
export type TermsEnumResponse = z.infer<typeof TermsEnumResponse>

/**
 * Get term vector information.
 *
 * Get information and statistics about terms in the fields of a particular document.
 *
 * You can retrieve term vectors for documents stored in the index or for artificial documents passed in the body of the request.
 * You can specify the fields you are interested in through the `fields` parameter or by adding the fields to the request body.
 * For example:
 *
 * ```
 * GET /my-index-000001/_termvectors/1?fields=message
 * ```
 *
 * Fields can be specified using wildcards, similar to the multi match query.
 *
 * Term vectors are real-time by default, not near real-time.
 * This can be changed by setting `realtime` parameter to `false`.
 *
 * You can request three types of values: _term information_, _term statistics_, and _field statistics_.
 * By default, all term information and field statistics are returned for all fields but term statistics are excluded.
 *
 * **Term information**
 *
 * * term frequency in the field (always returned)
 * * term positions (`positions: true`)
 * * start and end offsets (`offsets: true`)
 * * term payloads (`payloads: true`), as base64 encoded bytes
 *
 * If the requested information wasn't stored in the index, it will be computed on the fly if possible.
 * Additionally, term vectors could be computed for documents not even existing in the index, but instead provided by the user.
 *
 * > warn
 * > Start and end offsets assume UTF-16 encoding is being used. If you want to use these offsets in order to get the original text that produced this token, you should make sure that the string you are taking a sub-string of is also encoded using UTF-16.
 *
 * **Behaviour**
 *
 * The term and field statistics are not accurate.
 * Deleted documents are not taken into account.
 * The information is only retrieved for the shard the requested document resides in.
 * The term and field statistics are therefore only useful as relative measures whereas the absolute numbers have no meaning in this context.
 * By default, when requesting term vectors of artificial documents, a shard to get the statistics from is randomly selected.
 * Use `routing` only to hit a particular shard.
 * Refer to the linked documentation for detailed examples of how to use this API.
 */
export const TermvectorsRequest = z.object({
  index: z.lazy(() => IndexName).describe('The name of the index that contains the document.').meta({ found_in: 'path' }),
  id: z.lazy(() => Id).describe('A unique identifier for the document.').optional().meta({ found_in: 'path' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  realtime: z.boolean().describe('If true, the request is real-time as opposed to near-real-time.').optional().meta({ found_in: 'query' }),
  doc: z.any().describe('An artificial document (a document not present in the index) for which you want to retrieve term vectors.').optional().meta({ found_in: 'body' }),
  filter: TermvectorsFilter.describe('Filter terms based on their tf-idf scores. This could be useful in order find out a good characteristic vector of a document. This feature works in a similar manner to the second phase of the More Like This Query.').optional().meta({ found_in: 'body' }),
  per_field_analyzer: z.record(z.lazy(() => Field), z.string()).describe('Override the default per-field analyzer. This is useful in order to generate term vectors in any fashion, especially when using artificial documents. When providing an analyzer for a field that already stores term vectors, the term vectors will be regenerated.').optional().meta({ found_in: 'body' }),
  fields: z.array(z.lazy(() => Field)).describe('A list of fields to include in the statistics. It is used as the default list unless a specific field list is provided in the `completion_fields` or `fielddata_fields` parameters.').optional().meta({ found_in: 'body' }),
  field_statistics: z.boolean().describe('If `true`, the response includes: * The document count (how many documents contain this field). * The sum of document frequencies (the sum of document frequencies for all terms in this field). * The sum of total term frequencies (the sum of total term frequencies of each term in this field).').optional().meta({ found_in: 'body' }),
  offsets: z.boolean().describe('If `true`, the response includes term offsets.').optional().meta({ found_in: 'body' }),
  payloads: z.boolean().describe('If `true`, the response includes term payloads.').optional().meta({ found_in: 'body' }),
  positions: z.boolean().describe('If `true`, the response includes term positions.').optional().meta({ found_in: 'body' }),
  term_statistics: z.boolean().describe('If `true`, the response includes: * The total term frequency (how often a term occurs in all documents). * The document frequency (the number of documents containing the current term). By default these values are not returned since term statistics can have a serious performance impact.').optional().meta({ found_in: 'body' }),
  routing: z.lazy(() => Routing).describe('A custom value that is used to route operations to a specific shard.').optional().meta({ found_in: 'body' }),
  version: z.lazy(() => VersionNumber).describe('If `true`, returns the document version as part of a hit.').optional().meta({ found_in: 'body' }),
  version_type: z.lazy(() => VersionType).describe('The version type.').optional().meta({ found_in: 'body' })
}).meta({ id: 'TermvectorsRequest' })
export type TermvectorsRequest = z.infer<typeof TermvectorsRequest>

export const TermvectorsResponse = z.object({
  found: z.boolean(),
  _id: z.lazy(() => Id).optional(),
  _index: z.lazy(() => IndexName),
  term_vectors: z.record(z.lazy(() => Field), TermvectorsTermVector).optional(),
  took: z.lazy(() => long),
  _version: z.lazy(() => VersionNumber)
}).meta({ id: 'TermvectorsResponse' })
export type TermvectorsResponse = z.infer<typeof TermvectorsResponse>

/**
 * Update a document.
 *
 * Update a document by running a script or passing a partial document.
 *
 * If the Elasticsearch security features are enabled, you must have the `index` or `write` index privilege for the target index or index alias.
 *
 * The script can update, delete, or skip modifying the document.
 * The API also supports passing a partial document, which is merged into the existing document.
 * To fully replace an existing document, use the index API.
 * This operation:
 *
 * * Gets the document (collocated with the shard) from the index.
 * * Runs the specified script.
 * * Indexes the result.
 *
 * The document must still be reindexed, but using this API removes some network roundtrips and reduces chances of version conflicts between the GET and the index operation.
 *
 * The `_source` field must be enabled to use this API.
 * In addition to `_source`, you can access the following variables through the `ctx` map: `_index`, `_type`, `_id`, `_version`, `_routing`, and `_now` (the current timestamp).
 * For usage examples such as partial updates, upserts, and scripted updates, see the External documentation.
 */
export const UpdateRequest = z.object({
  id: z.lazy(() => Id).describe('A unique identifier for the document to be updated.').meta({ found_in: 'path' }),
  index: z.lazy(() => IndexName).describe('The name of the target index. By default, the index is created automatically if it doesn\'t exist.').meta({ found_in: 'path' }),
  if_primary_term: z.lazy(() => long).describe('Only perform the operation if the document has this primary term.').optional().meta({ found_in: 'query' }),
  if_seq_no: z.lazy(() => SequenceNumber).describe('Only perform the operation if the document has this sequence number.').optional().meta({ found_in: 'query' }),
  include_source_on_error: z.boolean().describe('True or false if to include the document source in the error message in case of parsing errors.').optional().meta({ found_in: 'query' }),
  lang: z.string().describe('The script language.').optional().meta({ found_in: 'query' }),
  refresh: z.lazy(() => Refresh).describe('If \'true\', Elasticsearch refreshes the affected shards to make this operation visible to search. If \'wait_for\', it waits for a refresh to make this operation visible to search. If \'false\', it does nothing with refreshes.').optional().meta({ found_in: 'query' }),
  require_alias: z.boolean().describe('If `true`, the destination must be an index alias.').optional().meta({ found_in: 'query' }),
  retry_on_conflict: z.lazy(() => integer).describe('The number of times the operation should be retried when a conflict occurs.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period to wait for the following operations: dynamic mapping updates and waiting for active shards. Elasticsearch waits for at least the timeout period before failing. The actual wait time could be longer, particularly when multiple waits occur.').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of copies of each shard that must be active before proceeding with the operation. Set to \'all\' or any positive integer up to the total number of shards in the index (`number_of_replicas`+1). The default value of `1` means it waits for each primary shard to be active.').optional().meta({ found_in: 'query' }),
  _source_excludes: z.lazy(() => Fields).describe('The source fields you want to exclude.').optional().meta({ found_in: 'query' }),
  _source_includes: z.lazy(() => Fields).describe('The source fields you want to retrieve.').optional().meta({ found_in: 'query' }),
  detect_noop: z.boolean().describe('If `true`, the `result` in the response is set to `noop` (no operation) when there are no changes to the document.').optional().meta({ found_in: 'body' }),
  doc: z.any().describe('A partial update to an existing document. If both `doc` and `script` are specified, `doc` is ignored.').optional().meta({ found_in: 'body' }),
  doc_as_upsert: z.boolean().describe('If `true`, use the contents of \'doc\' as the value of \'upsert\'. NOTE: Using ingest pipelines with `doc_as_upsert` is not supported.').optional().meta({ found_in: 'body' }),
  script: z.lazy(() => Script).describe('The script to run to update the document.').optional().meta({ found_in: 'body' }),
  scripted_upsert: z.boolean().describe('If `true`, run the script whether or not the document exists.').optional().meta({ found_in: 'body' }),
  _source: z.lazy(() => SearchSourceConfig).describe('If `false`, turn off source retrieval. You can also specify a comma-separated list of the fields you want to retrieve.').optional().meta({ found_in: 'body' }),
  upsert: z.any().describe('If the document does not already exist, the contents of \'upsert\' are inserted as a new document. If the document exists, the \'script\' is run.').optional().meta({ found_in: 'body' })
}).meta({ id: 'UpdateRequest' })
export type UpdateRequest = z.infer<typeof UpdateRequest>

export const UpdateUpdateWriteResponseBase = z.object({
  _id: z.lazy(() => Id).describe('The unique identifier for the added document.'),
  _index: z.lazy(() => IndexName).describe('The name of the index the document was added to.'),
  _primary_term: z.lazy(() => long).describe('The primary term assigned to the document for the indexing operation.').optional(),
  result: z.lazy(() => Result).describe('The result of the indexing operation: `created` or `updated`.'),
  _seq_no: z.lazy(() => SequenceNumber).describe('The sequence number assigned to the document for the indexing operation. Sequence numbers are used to ensure an older version of a document doesn\'t overwrite a newer version.').optional(),
  _shards: z.lazy(() => ShardStatistics).describe('Information about the replication process of the operation.'),
  _version: z.lazy(() => VersionNumber).describe('The document version, which is incremented each time the document is updated.'),
  failure_store: z.lazy(() => BulkFailureStoreStatus).describe('The role of the failure store in this document response').optional(),
  forced_refresh: z.boolean().optional(),
  get: z.lazy(() => InlineGet).optional()
}).meta({ id: 'UpdateUpdateWriteResponseBase' })
export type UpdateUpdateWriteResponseBase = z.infer<typeof UpdateUpdateWriteResponseBase>

export const UpdateResponse = UpdateUpdateWriteResponseBase.meta({ id: 'UpdateResponse' })
export type UpdateResponse = z.infer<typeof UpdateResponse>

/**
 * Update documents.
 *
 * Updates documents that match the specified query.
 * If no query is specified, performs an update on every document in the data stream or index without modifying the source, which is useful for picking up mapping changes.
 *
 * If the Elasticsearch security features are enabled, you must have the following index privileges for the target data stream, index, or alias:
 *
 * * `read`
 * * `index` or `write`
 *
 * You can specify the query criteria in the request URI or the request body using the same syntax as the search API.
 *
 * When you submit an update by query request, Elasticsearch gets a snapshot of the data stream or index when it begins processing the request and updates matching documents using internal versioning.
 * When the versions match, the document is updated and the version number is incremented.
 * If a document changes between the time that the snapshot is taken and the update operation is processed, it results in a version conflict and the operation fails.
 * You can opt to count version conflicts instead of halting and returning by setting `conflicts` to `proceed`.
 * Note that if you opt to count version conflicts, the operation could attempt to update more documents from the source than `max_docs` until it has successfully updated `max_docs` documents or it has gone through every document in the source query.
 *
 * NOTE: Documents with a version equal to 0 cannot be updated using update by query because internal versioning does not support 0 as a valid version number.
 *
 * While processing an update by query request, Elasticsearch performs multiple search requests sequentially to find all of the matching documents.
 * A bulk update request is performed for each batch of matching documents.
 * Any query or update failures cause the update by query request to fail and the failures are shown in the response.
 * Any update requests that completed successfully still stick, they are not rolled back.
 *
 * **Refreshing shards**
 *
 * Specifying the `refresh` parameter refreshes all shards once the request completes.
 * This is different to the update API's `refresh` parameter, which causes only the shard
 * that received the request to be refreshed. Unlike the update API, it does not support
 * `wait_for`.
 *
 * **Running update by query asynchronously**
 *
 * If the request contains `wait_for_completion=false`, Elasticsearch
 * performs some preflight checks, launches the request, and returns a
 * [task](https://www.elastic.co/docs/api/doc/elasticsearch/group/endpoint-tasks) you can use to cancel or get the status of the task.
 * Elasticsearch creates a record of this task as a document at `.tasks/task/${taskId}`.
 *
 * **Waiting for active shards**
 *
 * `wait_for_active_shards` controls how many copies of a shard must be active
 * before proceeding with the request. See [`wait_for_active_shards`](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-create#operation-create-wait_for_active_shards)
 * for details. `timeout` controls how long each write request waits for unavailable
 * shards to become available. Both work exactly the way they work in the
 * [Bulk API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-bulk). Update by query uses scrolled searches, so you can also
 * specify the `scroll` parameter to control how long it keeps the search context
 * alive, for example `?scroll=10m`. The default is 5 minutes.
 *
 * **Throttling update requests**
 *
 * To control the rate at which update by query issues batches of update operations, you can set `requests_per_second` to any positive decimal number.
 * This pads each batch with a wait time to throttle the rate.
 * Set `requests_per_second` to `-1` to turn off throttling.
 *
 * Throttling uses a wait time between batches so that the internal scroll requests can be given a timeout that takes the request padding into account.
 * The padding time is the difference between the batch size divided by the `requests_per_second` and the time spent writing.
 * By default the batch size is 1000, so if `requests_per_second` is set to `500`:
 *
 * ```
 * target_time = 1000 / 500 per second = 2 seconds
 * wait_time = target_time - write_time = 2 seconds - .5 seconds = 1.5 seconds
 * ```
 *
 * Since the batch is issued as a single _bulk request, large batch sizes cause Elasticsearch to create many requests and wait before starting the next set.
 * This is "bursty" instead of "smooth".
 *
 * **Slicing**
 *
 * Update by query supports sliced scroll to parallelize the update process.
 * This can improve efficiency and provide a convenient way to break the request down into smaller parts.
 *
 * Setting `slices` to `auto` chooses a reasonable number for most data streams and indices.
 * This setting will use one slice per shard, up to a certain limit.
 * If there are multiple source data streams or indices, it will choose the number of slices based on the index or backing index with the smallest number of shards.
 *
 * Adding `slices` to `_update_by_query` just automates the manual process of creating sub-requests, which means it has some quirks:
 *
 * * You can see these requests in the tasks APIs. These sub-requests are "child" tasks of the task for the request with slices.
 * * Fetching the status of the task for the request with `slices` only contains the status of completed slices.
 * * These sub-requests are individually addressable for things like cancellation and rethrottling.
 * * Rethrottling the request with `slices` will rethrottle the unfinished sub-request proportionally.
 * * Canceling the request with slices will cancel each sub-request.
 * * Due to the nature of slices each sub-request won't get a perfectly even portion of the documents. All documents will be addressed, but some slices may be larger than others. Expect larger slices to have a more even distribution.
 * * Parameters like `requests_per_second` and `max_docs` on a request with slices are distributed proportionally to each sub-request. Combine that with the point above about distribution being uneven and you should conclude that using `max_docs` with `slices` might not result in exactly `max_docs` documents being updated.
 * * Each sub-request gets a slightly different snapshot of the source data stream or index though these are all taken at approximately the same time.
 *
 * If you're slicing manually or otherwise tuning automatic slicing, keep in mind that:
 *
 * * Query performance is most efficient when the number of slices is equal to the number of shards in the index or backing index. If that number is large (for example, 500), choose a lower number as too many slices hurts performance. Setting slices higher than the number of shards generally does not improve efficiency and adds overhead.
 * * Update performance scales linearly across available resources with the number of slices.
 *
 * Whether query or update performance dominates the runtime depends on the documents being reindexed and cluster resources.
 * Refer to the linked documentation for examples of how to update documents using the `_update_by_query` API:
 */
export const UpdateByQueryRequest = z.object({
  index: z.lazy(() => Indices).describe('A comma-separated list of data streams, indices, and aliases to search. It supports wildcards (`*`). To search all data streams or indices, omit this parameter or use `*` or `_all`.').meta({ found_in: 'path' }),
  allow_no_indices: z.boolean().describe('A setting that does two separate checks on the index expression. If `false`, the request returns an error (1) if any wildcard expression (including `_all` and `*`) resolves to zero matching indices or (2) if the complete set of resolved indices, aliases or data streams is empty after all expressions are evaluated. If `true`, index expressions that resolve to no indices are allowed and the request returns an empty result.').optional().meta({ found_in: 'query' }),
  analyzer: z.string().describe('The analyzer to use for the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  analyze_wildcard: z.boolean().describe('If `true`, wildcard and prefix queries are analyzed. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  default_operator: z.lazy(() => QueryDslOperator).describe('The default operator for query string query: `and` or `or`. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  df: z.string().describe('The field to use as default where no field prefix is given in the query string. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  expand_wildcards: z.lazy(() => ExpandWildcards).describe('The type of index that wildcard patterns can match. If the request can target data streams, this argument determines whether wildcard expressions match hidden data streams. It supports comma-separated values, such as `open,hidden`.').optional().meta({ found_in: 'query' }),
  from: z.lazy(() => long).describe('Skips the specified number of documents.').optional().meta({ found_in: 'query' }),
  ignore_unavailable: z.boolean().describe('If `false`, the request returns an error if it targets a concrete (non-wildcarded) index, alias, or data stream that is missing, closed, or otherwise unavailable. If `true`, unavailable concrete targets are silently ignored.').optional().meta({ found_in: 'query' }),
  lenient: z.boolean().describe('If `true`, format-based query failures (such as providing text to a numeric field) in the query string will be ignored. This parameter can be used only when the `q` query string parameter is specified.').optional().meta({ found_in: 'query' }),
  pipeline: z.string().describe('The ID of the pipeline to use to preprocess incoming documents. If the index has a default ingest pipeline specified, then setting the value to `_none` disables the default ingest pipeline for this request. If a final pipeline is configured it will always run, regardless of the value of this parameter.').optional().meta({ found_in: 'query' }),
  preference: z.string().describe('The node or shard the operation should be performed on. It is random by default.').optional().meta({ found_in: 'query' }),
  q: z.string().describe('A query in the Lucene query string syntax.').optional().meta({ found_in: 'query' }),
  refresh: z.boolean().describe('If `true`, Elasticsearch refreshes affected shards to make the operation visible to search after the request completes. This is different than the update API\'s `refresh` parameter, which causes just the shard that received the request to be refreshed.').optional().meta({ found_in: 'query' }),
  request_cache: z.boolean().describe('If `true`, the request cache is used for this request. It defaults to the index-level setting.').optional().meta({ found_in: 'query' }),
  requests_per_second: z.lazy(() => float).describe('The throttle for this request in sub-requests per second.').optional().meta({ found_in: 'query' }),
  routing: z.lazy(() => Routing).describe('A custom value used to route operations to a specific shard.').optional().meta({ found_in: 'query' }),
  scroll: z.lazy(() => Duration).describe('The period to retain the search context for scrolling.').optional().meta({ found_in: 'query' }),
  scroll_size: z.lazy(() => long).describe('The size of the scroll request that powers the operation.').optional().meta({ found_in: 'query' }),
  search_timeout: z.lazy(() => Duration).describe('An explicit timeout for each search request. By default, there is no timeout.').optional().meta({ found_in: 'query' }),
  search_type: z.lazy(() => SearchType).describe('The type of the search operation. Available options include `query_then_fetch` and `dfs_query_then_fetch`.').optional().meta({ found_in: 'query' }),
  slices: z.lazy(() => Slices).describe('The number of slices this task should be divided into.').optional().meta({ found_in: 'query' }),
  sort: z.array(z.string()).describe('A comma-separated list of <field>:<direction> pairs.').optional().meta({ found_in: 'query' }),
  stats: z.array(z.string()).describe('The specific `tag` of the request for logging and statistical purposes.').optional().meta({ found_in: 'query' }),
  terminate_after: z.lazy(() => long).describe('The maximum number of documents to collect for each shard. If a query reaches this limit, Elasticsearch terminates the query early. Elasticsearch collects documents before sorting. IMPORTANT: Use with caution. Elasticsearch applies this parameter to each shard handling the request. When possible, let Elasticsearch perform early termination automatically. Avoid specifying this parameter for requests that target data streams with backing indices across multiple data tiers.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period each update request waits for the following operations: dynamic mapping updates, waiting for active shards. By default, it is one minute. This guarantees Elasticsearch waits for at least the timeout before failing. The actual wait time could be longer, particularly when multiple waits occur.').optional().meta({ found_in: 'query' }),
  version: z.boolean().describe('If `true`, returns the document version as part of a hit.').optional().meta({ found_in: 'query' }),
  version_type: z.boolean().describe('Should the document increment the version number (internal) on hit or not (reindex)').optional().meta({ found_in: 'query' }),
  wait_for_active_shards: z.lazy(() => WaitForActiveShards).describe('The number of shard copies that must be active before proceeding with the operation. Set to `all` or any positive integer up to the total number of shards in the index (`number_of_replicas+1`). The `timeout` parameter controls how long each write request waits for unavailable shards to become available. Both work exactly the way they work in the bulk API.').optional().meta({ found_in: 'query' }),
  wait_for_completion: z.boolean().describe('If `true`, the request blocks until the operation is complete. If `false`, Elasticsearch performs some preflight checks, launches the request, and returns a task ID that you can use to cancel or get the status of the task. Elasticsearch creates a record of this task as a document at `.tasks/task/{taskId}`.').optional().meta({ found_in: 'query' }),
  max_docs: z.lazy(() => long).describe('The maximum number of documents to update.').optional().meta({ found_in: 'body' }),
  query: z.lazy(() => QueryDslQueryContainer).describe('The documents to update using the Query DSL.').optional().meta({ found_in: 'body' }),
  script: z.lazy(() => Script).describe('The script to run to update the document source or metadata when updating.').optional().meta({ found_in: 'body' }),
  slice: z.lazy(() => SlicedScroll).describe('Slice the request manually using the provided slice ID and total number of slices.').optional().meta({ found_in: 'body' }),
  conflicts: z.lazy(() => Conflicts).describe('The preferred behavior when update by query hits version conflicts: `abort` or `proceed`.').optional().meta({ found_in: 'body' })
}).meta({ id: 'UpdateByQueryRequest' })
export type UpdateByQueryRequest = z.infer<typeof UpdateByQueryRequest>

export const UpdateByQueryResponse = z.object({
  batches: z.lazy(() => long).describe('The number of scroll responses pulled back by the update by query.').optional(),
  failures: z.array(z.lazy(() => BulkIndexByScrollFailure)).describe('Array of failures if there were any unrecoverable errors during the process. If this is non-empty then the request ended because of those failures. Update by query is implemented using batches. Any failure causes the entire process to end, but all failures in the current batch are collected into the array. You can use the `conflicts` option to prevent reindex from ending when version conflicts occur.').optional(),
  noops: z.lazy(() => long).describe('The number of documents that were ignored because the script used for the update by query returned a noop value for `ctx.op`.').optional(),
  deleted: z.lazy(() => long).describe('The number of documents that were successfully deleted.').optional(),
  requests_per_second: z.lazy(() => float).describe('The number of requests per second effectively run during the update by query.').optional(),
  retries: z.lazy(() => Retries).describe('The number of retries attempted by update by query. `bulk` is the number of bulk actions retried. `search` is the number of search actions retried.').optional(),
  slices: z.array(z.lazy(() => ReindexStatus)).describe('Status of each slice if the update by query was sliced').optional(),
  task: z.lazy(() => TaskId).optional(),
  timed_out: z.boolean().describe('If true, some requests timed out during the update by query.').optional(),
  took: z.lazy(() => DurationValue).describe('The number of milliseconds from start to end of the whole operation.').optional(),
  total: z.lazy(() => long).describe('The number of documents that were successfully processed.').optional(),
  updated: z.lazy(() => long).describe('The number of documents that were successfully updated.').optional(),
  version_conflicts: z.lazy(() => long).describe('The number of version conflicts that the update by query hit.').optional(),
  throttled: z.lazy(() => Duration).optional(),
  throttled_millis: z.lazy(() => DurationValue).describe('The number of milliseconds the request slept to conform to `requests_per_second`.').optional(),
  throttled_until: z.lazy(() => Duration).optional(),
  throttled_until_millis: z.lazy(() => DurationValue).describe('This field should always be equal to zero in an _update_by_query response. It only has meaning when using the task API, where it indicates the next time (in milliseconds since epoch) a throttled request will be run again in order to conform to `requests_per_second`.').optional()
}).meta({ id: 'UpdateByQueryResponse' })
export type UpdateByQueryResponse = z.infer<typeof UpdateByQueryResponse>

/**
 * Throttle an update by query operation.
 *
 * Change the number of requests per second for a particular update by query operation.
 * Rethrottling that speeds up the query takes effect immediately but rethrotting that slows down the query takes effect after completing the current batch to prevent scroll timeouts.
 */
export const UpdateByQueryRethrottleRequest = z.object({
  task_id: z.lazy(() => Id).describe('The ID for the task.').meta({ found_in: 'path' }),
  requests_per_second: z.lazy(() => float).describe('The throttle for this request in sub-requests per second. To turn off throttling, set it to `-1`.').meta({ found_in: 'query' })
}).meta({ id: 'UpdateByQueryRethrottleRequest' })
export type UpdateByQueryRethrottleRequest = z.infer<typeof UpdateByQueryRethrottleRequest>

export const UpdateByQueryRethrottleUpdateByQueryRethrottleNode = z.object({
  attributes: z.record(z.string(), z.string()),
  host: z.lazy(() => Host),
  ip: z.lazy(() => Ip),
  name: z.lazy(() => Name),
  roles: z.lazy(() => NodeRoles).optional(),
  transport_address: z.lazy(() => TransportAddress),
  tasks: z.record(z.lazy(() => TaskId), z.lazy(() => TasksTaskInfo))
}).meta({ id: 'UpdateByQueryRethrottleUpdateByQueryRethrottleNode' })
export type UpdateByQueryRethrottleUpdateByQueryRethrottleNode = z.infer<typeof UpdateByQueryRethrottleUpdateByQueryRethrottleNode>

export const UpdateByQueryRethrottleResponse = z.object({
  nodes: z.record(z.string(), UpdateByQueryRethrottleUpdateByQueryRethrottleNode)
}).meta({ id: 'UpdateByQueryRethrottleResponse' })
export type UpdateByQueryRethrottleResponse = z.infer<typeof UpdateByQueryRethrottleResponse>
