/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-redeclare */
import { z } from 'zod'

import { SpecUtilsWithNullValue } from './_spec_utils.ts'
import { AcknowledgedResponseBase, DateTime, Duration, Field, Id, IndexName, Indices, Metadata, Names, Result, ScalarValue, double, integer, long } from './_types.ts'

export const ConnectorDependency = z.object({
  field: z.string(),
  value: z.lazy(() => ScalarValue)
})
export type ConnectorDependency = z.infer<typeof ConnectorDependency>

export const ConnectorDisplayType = z.enum(['textbox', 'textarea', 'numeric', 'toggle', 'dropdown'])
export type ConnectorDisplayType = z.infer<typeof ConnectorDisplayType>

export const ConnectorSelectOption = z.object({
  label: z.string(),
  value: z.lazy(() => ScalarValue)
})
export type ConnectorSelectOption = z.infer<typeof ConnectorSelectOption>

export const ConnectorConnectorFieldType = z.enum(['str', 'int', 'list', 'bool'])
export type ConnectorConnectorFieldType = z.infer<typeof ConnectorConnectorFieldType>

export const ConnectorLessThanValidation = z.object({
  type: z.literal('less_than'),
  constraint: z.lazy(() => double)
})
export type ConnectorLessThanValidation = z.infer<typeof ConnectorLessThanValidation>

export const ConnectorGreaterThanValidation = z.object({
  type: z.literal('greater_than'),
  constraint: z.lazy(() => double)
})
export type ConnectorGreaterThanValidation = z.infer<typeof ConnectorGreaterThanValidation>

export const ConnectorListTypeValidation = z.object({
  type: z.literal('list_type'),
  constraint: z.string()
})
export type ConnectorListTypeValidation = z.infer<typeof ConnectorListTypeValidation>

export const ConnectorIncludedInValidation = z.object({
  type: z.literal('included_in'),
  constraint: z.array(z.lazy(() => ScalarValue))
})
export type ConnectorIncludedInValidation = z.infer<typeof ConnectorIncludedInValidation>

export const ConnectorRegexValidation = z.object({
  type: z.literal('regex'),
  constraint: z.string()
})
export type ConnectorRegexValidation = z.infer<typeof ConnectorRegexValidation>

export const ConnectorValidation = z.union([ConnectorLessThanValidation, ConnectorGreaterThanValidation, ConnectorListTypeValidation, ConnectorIncludedInValidation, ConnectorRegexValidation])
export type ConnectorValidation = z.infer<typeof ConnectorValidation>

export const ConnectorConnectorConfigProperties = z.object({
  category: z.string().optional(),
  default_value: z.lazy(() => ScalarValue),
  depends_on: z.array(ConnectorDependency),
  display: ConnectorDisplayType,
  label: z.string(),
  options: z.array(ConnectorSelectOption),
  order: z.lazy(() => integer).optional(),
  placeholder: z.string().optional(),
  required: z.boolean(),
  sensitive: z.boolean(),
  tooltip: z.union([z.string(), z.null()]).optional(),
  type: ConnectorConnectorFieldType.optional(),
  ui_restrictions: z.array(z.string()).optional(),
  validations: z.array(ConnectorValidation).optional(),
  value: z.any()
})
export type ConnectorConnectorConfigProperties = z.infer<typeof ConnectorConnectorConfigProperties>

export const ConnectorConnectorConfiguration = z.record(z.string(), ConnectorConnectorConfigProperties)
export type ConnectorConnectorConfiguration = z.infer<typeof ConnectorConnectorConfiguration>

export const ConnectorCustomSchedulingConfigurationOverrides = z.object({
  max_crawl_depth: z.lazy(() => integer).optional(),
  sitemap_discovery_disabled: z.boolean().optional(),
  domain_allowlist: z.array(z.string()).optional(),
  sitemap_urls: z.array(z.string()).optional(),
  seed_urls: z.array(z.string()).optional()
})
export type ConnectorCustomSchedulingConfigurationOverrides = z.infer<typeof ConnectorCustomSchedulingConfigurationOverrides>

export const ConnectorCustomScheduling = z.object({
  configuration_overrides: ConnectorCustomSchedulingConfigurationOverrides,
  enabled: z.boolean(),
  interval: z.string(),
  last_synced: z.lazy(() => DateTime).optional(),
  name: z.string()
})
export type ConnectorCustomScheduling = z.infer<typeof ConnectorCustomScheduling>

export const ConnectorConnectorCustomScheduling = z.record(z.string(), ConnectorCustomScheduling)
export type ConnectorConnectorCustomScheduling = z.infer<typeof ConnectorConnectorCustomScheduling>

export const ConnectorFeatureEnabled = z.object({
  enabled: z.boolean()
})
export type ConnectorFeatureEnabled = z.infer<typeof ConnectorFeatureEnabled>

export const ConnectorSyncRulesFeature = z.object({
  advanced: ConnectorFeatureEnabled.describe('Indicates whether advanced sync rules are enabled.').optional(),
  basic: ConnectorFeatureEnabled.describe('Indicates whether basic sync rules are enabled.').optional()
})
export type ConnectorSyncRulesFeature = z.infer<typeof ConnectorSyncRulesFeature>

export const ConnectorConnectorFeatures = z.object({
  document_level_security: ConnectorFeatureEnabled.describe('Indicates whether document-level security is enabled.').optional(),
  incremental_sync: ConnectorFeatureEnabled.describe('Indicates whether incremental syncs are enabled.').optional(),
  native_connector_api_keys: ConnectorFeatureEnabled.describe('Indicates whether managed connector API keys are enabled.').optional(),
  sync_rules: ConnectorSyncRulesFeature.optional()
})
export type ConnectorConnectorFeatures = z.infer<typeof ConnectorConnectorFeatures>

export const ConnectorFilteringAdvancedSnippet = z.object({
  created_at: z.lazy(() => DateTime).optional(),
  updated_at: z.lazy(() => DateTime).optional(),
  value: z.any()
})
export type ConnectorFilteringAdvancedSnippet = z.infer<typeof ConnectorFilteringAdvancedSnippet>

export const ConnectorFilteringPolicy = z.enum(['exclude', 'include'])
export type ConnectorFilteringPolicy = z.infer<typeof ConnectorFilteringPolicy>

export const ConnectorFilteringRuleRule = z.enum(['contains', 'ends_with', 'equals', 'regex', 'starts_with', '>', '<'])
export type ConnectorFilteringRuleRule = z.infer<typeof ConnectorFilteringRuleRule>

export const ConnectorFilteringRule = z.object({
  created_at: z.lazy(() => DateTime).optional(),
  field: z.lazy(() => Field),
  id: z.lazy(() => Id),
  order: z.lazy(() => integer),
  policy: ConnectorFilteringPolicy,
  rule: ConnectorFilteringRuleRule,
  updated_at: z.lazy(() => DateTime).optional(),
  value: z.string()
})
export type ConnectorFilteringRule = z.infer<typeof ConnectorFilteringRule>

export const ConnectorFilteringValidation = z.object({
  ids: z.array(z.lazy(() => Id)),
  messages: z.array(z.string())
})
export type ConnectorFilteringValidation = z.infer<typeof ConnectorFilteringValidation>

export const ConnectorFilteringValidationState = z.enum(['edited', 'invalid', 'valid'])
export type ConnectorFilteringValidationState = z.infer<typeof ConnectorFilteringValidationState>

export const ConnectorFilteringRulesValidation = z.object({
  errors: z.array(ConnectorFilteringValidation),
  state: ConnectorFilteringValidationState
})
export type ConnectorFilteringRulesValidation = z.infer<typeof ConnectorFilteringRulesValidation>

export const ConnectorFilteringRules = z.object({
  advanced_snippet: ConnectorFilteringAdvancedSnippet,
  rules: z.array(ConnectorFilteringRule),
  validation: ConnectorFilteringRulesValidation
})
export type ConnectorFilteringRules = z.infer<typeof ConnectorFilteringRules>

export const ConnectorFilteringConfig = z.object({
  active: ConnectorFilteringRules,
  domain: z.string().optional(),
  draft: ConnectorFilteringRules
})
export type ConnectorFilteringConfig = z.infer<typeof ConnectorFilteringConfig>

export const ConnectorSyncStatus = z.enum(['canceling', 'canceled', 'completed', 'error', 'in_progress', 'pending', 'suspended'])
export type ConnectorSyncStatus = z.infer<typeof ConnectorSyncStatus>

export const ConnectorIngestPipelineParams = z.object({
  extract_binary_content: z.boolean(),
  name: z.string(),
  reduce_whitespace: z.boolean(),
  run_ml_inference: z.boolean()
})
export type ConnectorIngestPipelineParams = z.infer<typeof ConnectorIngestPipelineParams>

export const ConnectorConnectorScheduling = z.object({
  enabled: z.boolean(),
  interval: z.string().describe('The interval is expressed using the crontab syntax')
})
export type ConnectorConnectorScheduling = z.infer<typeof ConnectorConnectorScheduling>

export const ConnectorSchedulingConfiguration = z.object({
  access_control: ConnectorConnectorScheduling.optional(),
  full: ConnectorConnectorScheduling.optional(),
  incremental: ConnectorConnectorScheduling.optional()
})
export type ConnectorSchedulingConfiguration = z.infer<typeof ConnectorSchedulingConfiguration>

export const ConnectorConnectorStatus = z.enum(['created', 'needs_configuration', 'configured', 'connected', 'error'])
export type ConnectorConnectorStatus = z.infer<typeof ConnectorConnectorStatus>

export const ConnectorConnector = z.object({
  api_key_id: z.string().optional(),
  api_key_secret_id: z.string().optional(),
  configuration: ConnectorConnectorConfiguration,
  custom_scheduling: ConnectorConnectorCustomScheduling,
  deleted: z.boolean(),
  description: z.string().optional(),
  error: z.union([z.string(), z.null()]).optional(),
  features: ConnectorConnectorFeatures.optional(),
  filtering: z.array(ConnectorFilteringConfig),
  id: z.lazy(() => Id).optional(),
  index_name: z.union([z.lazy(() => IndexName), z.null()]).optional(),
  is_native: z.boolean(),
  language: z.string().optional(),
  last_access_control_sync_error: z.string().optional(),
  last_access_control_sync_scheduled_at: z.lazy(() => DateTime).optional(),
  last_access_control_sync_status: ConnectorSyncStatus.optional(),
  last_deleted_document_count: z.lazy(() => long).optional(),
  last_incremental_sync_scheduled_at: z.lazy(() => DateTime).optional(),
  last_indexed_document_count: z.lazy(() => long).optional(),
  last_seen: z.lazy(() => DateTime).optional(),
  last_sync_error: z.string().optional(),
  last_sync_scheduled_at: z.lazy(() => DateTime).optional(),
  last_sync_status: ConnectorSyncStatus.optional(),
  last_synced: z.lazy(() => DateTime).optional(),
  name: z.string().optional(),
  pipeline: ConnectorIngestPipelineParams.optional(),
  scheduling: ConnectorSchedulingConfiguration,
  service_type: z.string().optional(),
  status: ConnectorConnectorStatus,
  sync_cursor: z.any().optional(),
  sync_now: z.boolean()
})
export type ConnectorConnector = z.infer<typeof ConnectorConnector>

export const ConnectorSyncJobConnectorReference = z.object({
  configuration: ConnectorConnectorConfiguration,
  filtering: ConnectorFilteringRules,
  id: z.lazy(() => Id),
  index_name: z.string(),
  language: z.string().optional(),
  pipeline: ConnectorIngestPipelineParams.optional(),
  service_type: z.string(),
  sync_cursor: z.any().optional()
})
export type ConnectorSyncJobConnectorReference = z.infer<typeof ConnectorSyncJobConnectorReference>

export const ConnectorSyncJobType = z.enum(['full', 'incremental', 'access_control'])
export type ConnectorSyncJobType = z.infer<typeof ConnectorSyncJobType>

export const ConnectorSyncJobTriggerMethod = z.enum(['on_demand', 'scheduled'])
export type ConnectorSyncJobTriggerMethod = z.infer<typeof ConnectorSyncJobTriggerMethod>

export const ConnectorConnectorSyncJob = z.object({
  cancelation_requested_at: z.lazy(() => DateTime).optional(),
  canceled_at: z.lazy(() => DateTime).optional(),
  completed_at: z.lazy(() => DateTime).optional(),
  connector: ConnectorSyncJobConnectorReference,
  created_at: z.lazy(() => DateTime),
  deleted_document_count: z.lazy(() => long),
  error: z.string().optional(),
  id: z.lazy(() => Id),
  indexed_document_count: z.lazy(() => long),
  indexed_document_volume: z.lazy(() => long),
  job_type: ConnectorSyncJobType,
  last_seen: z.lazy(() => DateTime).optional(),
  metadata: z.record(z.string(), z.any()),
  started_at: z.lazy(() => DateTime).optional(),
  status: ConnectorSyncStatus,
  total_document_count: z.lazy(() => long),
  trigger_method: ConnectorSyncJobTriggerMethod,
  worker_hostname: z.string().optional()
})
export type ConnectorConnectorSyncJob = z.infer<typeof ConnectorConnectorSyncJob>

/**
 * Check in a connector.
 *
 * Update the `last_seen` field in the connector and set it to the current timestamp.
 */
export const ConnectorCheckInRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be checked in').meta({ found_in: 'path' })
})
export type ConnectorCheckInRequest = z.infer<typeof ConnectorCheckInRequest>

export const ConnectorCheckInResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorCheckInResponse = z.infer<typeof ConnectorCheckInResponse>

/**
 * Delete a connector.
 *
 * Removes a connector and associated sync jobs.
 * This is a destructive action that is not recoverable.
 * NOTE: This action doesn’t delete any API keys, ingest pipelines, or data indices associated with the connector.
 * These need to be removed manually.
 */
export const ConnectorDeleteRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be deleted').meta({ found_in: 'path' }),
  delete_sync_jobs: z.boolean().describe('A flag indicating if associated sync jobs should be also removed.').optional().meta({ found_in: 'query' }),
  hard: z.boolean().describe('A flag indicating if the connector should be hard deleted.').optional().meta({ found_in: 'query' })
})
export type ConnectorDeleteRequest = z.infer<typeof ConnectorDeleteRequest>

export const ConnectorDeleteResponse = z.lazy(() => AcknowledgedResponseBase)
export type ConnectorDeleteResponse = z.infer<typeof ConnectorDeleteResponse>

/**
 * Get a connector.
 *
 * Get the details about a connector.
 */
export const ConnectorGetRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector').meta({ found_in: 'path' }),
  include_deleted: z.boolean().describe('A flag to indicate if the desired connector should be fetched, even if it was soft-deleted.').optional().meta({ found_in: 'query' })
})
export type ConnectorGetRequest = z.infer<typeof ConnectorGetRequest>

export const ConnectorGetResponse = ConnectorConnector
export type ConnectorGetResponse = z.infer<typeof ConnectorGetResponse>

/**
 * Update the connector last sync stats.
 *
 * Update the fields related to the last sync of a connector.
 * This action is used for analytics and monitoring.
 */
export const ConnectorLastSyncRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  last_access_control_sync_error: z.string().optional().meta({ found_in: 'body' }),
  last_access_control_sync_scheduled_at: z.lazy(() => DateTime).optional().meta({ found_in: 'body' }),
  last_access_control_sync_status: ConnectorSyncStatus.optional().meta({ found_in: 'body' }),
  last_deleted_document_count: z.lazy(() => long).optional().meta({ found_in: 'body' }),
  last_incremental_sync_scheduled_at: z.lazy(() => DateTime).optional().meta({ found_in: 'body' }),
  last_indexed_document_count: z.lazy(() => long).optional().meta({ found_in: 'body' }),
  last_seen: z.lazy(() => DateTime).optional().meta({ found_in: 'body' }),
  last_sync_error: z.string().optional().meta({ found_in: 'body' }),
  last_sync_scheduled_at: z.lazy(() => DateTime).optional().meta({ found_in: 'body' }),
  last_sync_status: ConnectorSyncStatus.optional().meta({ found_in: 'body' }),
  last_synced: z.lazy(() => DateTime).optional().meta({ found_in: 'body' }),
  sync_cursor: z.any().optional().meta({ found_in: 'body' })
})
export type ConnectorLastSyncRequest = z.infer<typeof ConnectorLastSyncRequest>

export const ConnectorLastSyncResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorLastSyncResponse = z.infer<typeof ConnectorLastSyncResponse>

/**
 * Get all connectors.
 *
 * Get information about all connectors.
 */
export const ConnectorListRequest = z.object({
  from: z.lazy(() => integer).describe('Starting offset').optional().meta({ found_in: 'query' }),
  size: z.lazy(() => integer).describe('Specifies a max number of results to get').optional().meta({ found_in: 'query' }),
  index_name: z.lazy(() => Indices).describe('A comma-separated list of connector index names to fetch connector documents for').optional().meta({ found_in: 'query' }),
  connector_name: z.lazy(() => Names).describe('A comma-separated list of connector names to fetch connector documents for').optional().meta({ found_in: 'query' }),
  service_type: z.lazy(() => Names).describe('A comma-separated list of connector service types to fetch connector documents for').optional().meta({ found_in: 'query' }),
  include_deleted: z.boolean().describe('A flag to indicate if the desired connector should be fetched, even if it was soft-deleted.').optional().meta({ found_in: 'query' }),
  query: z.string().describe('A wildcard query string that filters connectors with matching name, description or index name').optional().meta({ found_in: 'query' })
})
export type ConnectorListRequest = z.infer<typeof ConnectorListRequest>

export const ConnectorListResponse = z.object({
  count: z.lazy(() => long),
  results: z.array(ConnectorConnector)
})
export type ConnectorListResponse = z.infer<typeof ConnectorListResponse>

/**
 * Create a connector.
 *
 * Connectors are Elasticsearch integrations that bring content from third-party data sources, which can be deployed on Elastic Cloud or hosted on your own infrastructure.
 * Elastic managed connectors (Native connectors) are a managed service on Elastic Cloud.
 * Self-managed connectors (Connector clients) are self-managed on your infrastructure.
 */
export const ConnectorPostRequest = z.object({
  description: z.string().optional().meta({ found_in: 'body' }),
  index_name: z.lazy(() => IndexName).optional().meta({ found_in: 'body' }),
  is_native: z.boolean().optional().meta({ found_in: 'body' }),
  language: z.string().optional().meta({ found_in: 'body' }),
  name: z.string().optional().meta({ found_in: 'body' }),
  service_type: z.string().optional().meta({ found_in: 'body' })
})
export type ConnectorPostRequest = z.infer<typeof ConnectorPostRequest>

export const ConnectorPostResponse = z.object({
  result: z.lazy(() => Result),
  id: z.lazy(() => Id)
})
export type ConnectorPostResponse = z.infer<typeof ConnectorPostResponse>

/** Create or update a connector. */
export const ConnectorPutRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be created or updated. ID is auto-generated if not provided.').optional().meta({ found_in: 'path' }),
  description: z.string().optional().meta({ found_in: 'body' }),
  index_name: z.lazy(() => IndexName).optional().meta({ found_in: 'body' }),
  is_native: z.boolean().optional().meta({ found_in: 'body' }),
  language: z.string().optional().meta({ found_in: 'body' }),
  name: z.string().optional().meta({ found_in: 'body' }),
  service_type: z.string().optional().meta({ found_in: 'body' })
})
export type ConnectorPutRequest = z.infer<typeof ConnectorPutRequest>

export const ConnectorPutResponse = z.object({
  result: z.lazy(() => Result),
  id: z.lazy(() => Id)
})
export type ConnectorPutResponse = z.infer<typeof ConnectorPutResponse>

/** Deletes a connector secret. */
export const ConnectorSecretDeleteRequest = z.object({
  id: z.string().describe('The ID of the secret').meta({ found_in: 'path' })
})
export type ConnectorSecretDeleteRequest = z.infer<typeof ConnectorSecretDeleteRequest>

export const ConnectorSecretDeleteResponse = z.object({
  deleted: z.boolean()
})
export type ConnectorSecretDeleteResponse = z.infer<typeof ConnectorSecretDeleteResponse>

/** Retrieves a secret stored by Connectors. */
export const ConnectorSecretGetRequest = z.object({
  id: z.string().describe('The ID of the secret').meta({ found_in: 'path' })
})
export type ConnectorSecretGetRequest = z.infer<typeof ConnectorSecretGetRequest>

export const ConnectorSecretGetResponse = z.object({
  id: z.string(),
  value: z.string()
})
export type ConnectorSecretGetResponse = z.infer<typeof ConnectorSecretGetResponse>

/** Creates a secret for a Connector. */
export const ConnectorSecretPostRequest = z.object({
  value: z.string().optional().meta({ found_in: 'body' })
})
export type ConnectorSecretPostRequest = z.infer<typeof ConnectorSecretPostRequest>

export const ConnectorSecretPostResponse = z.object({
  id: z.string()
})
export type ConnectorSecretPostResponse = z.infer<typeof ConnectorSecretPostResponse>

/** Creates or updates a secret for a Connector. */
export const ConnectorSecretPutRequest = z.object({
  id: z.string().describe('The ID of the secret').meta({ found_in: 'path' }),
  value: z.string().meta({ found_in: 'body' })
})
export type ConnectorSecretPutRequest = z.infer<typeof ConnectorSecretPutRequest>

export const ConnectorSecretPutResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorSecretPutResponse = z.infer<typeof ConnectorSecretPutResponse>

/**
 * Cancel a connector sync job.
 *
 * Cancel a connector sync job, which sets the status to cancelling and updates `cancellation_requested_at` to the current time.
 * The connector service is then responsible for setting the status of connector sync jobs to cancelled.
 */
export const ConnectorSyncJobCancelRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier of the connector sync job').meta({ found_in: 'path' })
})
export type ConnectorSyncJobCancelRequest = z.infer<typeof ConnectorSyncJobCancelRequest>

export const ConnectorSyncJobCancelResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorSyncJobCancelResponse = z.infer<typeof ConnectorSyncJobCancelResponse>

/**
 * Check in a connector sync job.
 *
 * Check in a connector sync job and set the `last_seen` field to the current time before updating it in the internal index.
 *
 * To sync data using self-managed connectors, you need to deploy the Elastic connector service on your own infrastructure.
 * This service runs automatically on Elastic Cloud for Elastic managed connectors.
 */
export const ConnectorSyncJobCheckInRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier of the connector sync job to be checked in.').meta({ found_in: 'path' })
})
export type ConnectorSyncJobCheckInRequest = z.infer<typeof ConnectorSyncJobCheckInRequest>

export const ConnectorSyncJobCheckInResponse = z.object({
})
export type ConnectorSyncJobCheckInResponse = z.infer<typeof ConnectorSyncJobCheckInResponse>

/**
 * Claim a connector sync job.
 *
 * This action updates the job status to `in_progress` and sets the `last_seen` and `started_at` timestamps to the current time.
 * Additionally, it can set the `sync_cursor` property for the sync job.
 *
 * This API is not intended for direct connector management by users.
 * It supports the implementation of services that utilize the connector protocol to communicate with Elasticsearch.
 *
 * To sync data using self-managed connectors, you need to deploy the Elastic connector service on your own infrastructure.
 * This service runs automatically on Elastic Cloud for Elastic managed connectors.
 */
export const ConnectorSyncJobClaimRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier of the connector sync job.').meta({ found_in: 'path' }),
  sync_cursor: z.any().describe('The cursor object from the last incremental sync job. This should reference the `sync_cursor` field in the connector state for which the job runs.').optional().meta({ found_in: 'body' }),
  worker_hostname: z.string().describe('The host name of the current system that will run the job.').meta({ found_in: 'body' })
})
export type ConnectorSyncJobClaimRequest = z.infer<typeof ConnectorSyncJobClaimRequest>

export const ConnectorSyncJobClaimResponse = z.object({
})
export type ConnectorSyncJobClaimResponse = z.infer<typeof ConnectorSyncJobClaimResponse>

/**
 * Delete a connector sync job.
 *
 * Remove a connector sync job and its associated data.
 * This is a destructive action that is not recoverable.
 */
export const ConnectorSyncJobDeleteRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier of the connector sync job to be deleted').meta({ found_in: 'path' })
})
export type ConnectorSyncJobDeleteRequest = z.infer<typeof ConnectorSyncJobDeleteRequest>

export const ConnectorSyncJobDeleteResponse = z.lazy(() => AcknowledgedResponseBase)
export type ConnectorSyncJobDeleteResponse = z.infer<typeof ConnectorSyncJobDeleteResponse>

/**
 * Set a connector sync job error.
 *
 * Set the `error` field for a connector sync job and set its `status` to `error`.
 *
 * To sync data using self-managed connectors, you need to deploy the Elastic connector service on your own infrastructure.
 * This service runs automatically on Elastic Cloud for Elastic managed connectors.
 */
export const ConnectorSyncJobErrorRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier for the connector sync job.').meta({ found_in: 'path' }),
  error: z.string().describe('The error for the connector sync job error field.').meta({ found_in: 'body' })
})
export type ConnectorSyncJobErrorRequest = z.infer<typeof ConnectorSyncJobErrorRequest>

export const ConnectorSyncJobErrorResponse = z.object({
})
export type ConnectorSyncJobErrorResponse = z.infer<typeof ConnectorSyncJobErrorResponse>

/** Get a connector sync job. */
export const ConnectorSyncJobGetRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier of the connector sync job').meta({ found_in: 'path' })
})
export type ConnectorSyncJobGetRequest = z.infer<typeof ConnectorSyncJobGetRequest>

export const ConnectorSyncJobGetResponse = ConnectorConnectorSyncJob
export type ConnectorSyncJobGetResponse = z.infer<typeof ConnectorSyncJobGetResponse>

/**
 * Get all connector sync jobs.
 *
 * Get information about all stored connector sync jobs listed by their creation date in ascending order.
 */
export const ConnectorSyncJobListRequest = z.object({
  from: z.lazy(() => integer).describe('Starting offset').optional().meta({ found_in: 'query' }),
  size: z.lazy(() => integer).describe('Specifies a max number of results to get').optional().meta({ found_in: 'query' }),
  status: ConnectorSyncStatus.describe('A sync job status to fetch connector sync jobs for').optional().meta({ found_in: 'query' }),
  connector_id: z.lazy(() => Id).describe('A connector id to fetch connector sync jobs for').optional().meta({ found_in: 'query' }),
  job_type: z.union([ConnectorSyncJobType, z.array(ConnectorSyncJobType)]).describe('A comma-separated list of job types to fetch the sync jobs for').optional().meta({ found_in: 'query' })
})
export type ConnectorSyncJobListRequest = z.infer<typeof ConnectorSyncJobListRequest>

export const ConnectorSyncJobListResponse = z.object({
  count: z.lazy(() => long),
  results: z.array(ConnectorConnectorSyncJob)
})
export type ConnectorSyncJobListResponse = z.infer<typeof ConnectorSyncJobListResponse>

/**
 * Create a connector sync job.
 *
 * Create a connector sync job document in the internal index and initialize its counters and timestamps with default values.
 */
export const ConnectorSyncJobPostRequest = z.object({
  id: z.lazy(() => Id).describe('The id of the associated connector').meta({ found_in: 'body' }),
  job_type: ConnectorSyncJobType.optional().meta({ found_in: 'body' }),
  trigger_method: ConnectorSyncJobTriggerMethod.optional().meta({ found_in: 'body' })
})
export type ConnectorSyncJobPostRequest = z.infer<typeof ConnectorSyncJobPostRequest>

export const ConnectorSyncJobPostResponse = z.object({
  id: z.lazy(() => Id)
})
export type ConnectorSyncJobPostResponse = z.infer<typeof ConnectorSyncJobPostResponse>

/**
 * Set the connector sync job stats.
 *
 * Stats include: `deleted_document_count`, `indexed_document_count`, `indexed_document_volume`, and `total_document_count`.
 * You can also update `last_seen`.
 * This API is mainly used by the connector service for updating sync job information.
 *
 * To sync data using self-managed connectors, you need to deploy the Elastic connector service on your own infrastructure.
 * This service runs automatically on Elastic Cloud for Elastic managed connectors.
 */
export const ConnectorSyncJobUpdateStatsRequest = z.object({
  connector_sync_job_id: z.lazy(() => Id).describe('The unique identifier of the connector sync job.').meta({ found_in: 'path' }),
  deleted_document_count: z.lazy(() => long).describe('The number of documents the sync job deleted.').meta({ found_in: 'body' }),
  indexed_document_count: z.lazy(() => long).describe('The number of documents the sync job indexed.').meta({ found_in: 'body' }),
  indexed_document_volume: z.lazy(() => long).describe('The total size of the data (in MiB) the sync job indexed.').meta({ found_in: 'body' }),
  last_seen: z.lazy(() => Duration).describe('The timestamp to use in the `last_seen` property for the connector sync job.').optional().meta({ found_in: 'body' }),
  metadata: z.lazy(() => Metadata).describe('The connector-specific metadata.').optional().meta({ found_in: 'body' }),
  total_document_count: z.lazy(() => integer).describe('The total number of documents in the target index after the sync job finished.').optional().meta({ found_in: 'body' })
})
export type ConnectorSyncJobUpdateStatsRequest = z.infer<typeof ConnectorSyncJobUpdateStatsRequest>

export const ConnectorSyncJobUpdateStatsResponse = z.object({
})
export type ConnectorSyncJobUpdateStatsResponse = z.infer<typeof ConnectorSyncJobUpdateStatsResponse>

/**
 * Activate the connector draft filter.
 *
 * Activates the valid draft filtering for a connector.
 */
export const ConnectorUpdateActiveFilteringRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' })
})
export type ConnectorUpdateActiveFilteringRequest = z.infer<typeof ConnectorUpdateActiveFilteringRequest>

export const ConnectorUpdateActiveFilteringResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateActiveFilteringResponse = z.infer<typeof ConnectorUpdateActiveFilteringResponse>

/**
 * Update the connector API key ID.
 *
 * Update the `api_key_id` and `api_key_secret_id` fields of a connector.
 * You can specify the ID of the API key used for authorization and the ID of the connector secret where the API key is stored.
 * The connector secret ID is required only for Elastic managed (native) connectors.
 * Self-managed connectors (connector clients) do not use this field.
 */
export const ConnectorUpdateApiKeyIdRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  api_key_id: z.string().optional().meta({ found_in: 'body' }),
  api_key_secret_id: z.string().optional().meta({ found_in: 'body' })
})
export type ConnectorUpdateApiKeyIdRequest = z.infer<typeof ConnectorUpdateApiKeyIdRequest>

export const ConnectorUpdateApiKeyIdResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateApiKeyIdResponse = z.infer<typeof ConnectorUpdateApiKeyIdResponse>

/**
 * Update the connector configuration.
 *
 * Update the configuration field in the connector document.
 */
export const ConnectorUpdateConfigurationRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  configuration: ConnectorConnectorConfiguration.optional().meta({ found_in: 'body' }),
  values: z.record(z.string(), z.any()).optional().meta({ found_in: 'body' })
})
export type ConnectorUpdateConfigurationRequest = z.infer<typeof ConnectorUpdateConfigurationRequest>

export const ConnectorUpdateConfigurationResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateConfigurationResponse = z.infer<typeof ConnectorUpdateConfigurationResponse>

/**
 * Update the connector error field.
 *
 * Set the error field for the connector.
 * If the error provided in the request body is non-null, the connector’s status is updated to error.
 * Otherwise, if the error is reset to null, the connector status is updated to connected.
 */
export const ConnectorUpdateErrorRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  error: z.lazy(() => SpecUtilsWithNullValue).meta({ found_in: 'body' })
})
export type ConnectorUpdateErrorRequest = z.infer<typeof ConnectorUpdateErrorRequest>

export const ConnectorUpdateErrorResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateErrorResponse = z.infer<typeof ConnectorUpdateErrorResponse>

/**
 * Update the connector features.
 *
 * Update the connector features in the connector document.
 * This API can be used to control the following aspects of a connector:
 *
 * * document-level security
 * * incremental syncs
 * * advanced sync rules
 * * basic sync rules
 *
 * Normally, the running connector service automatically manages these features.
 * However, you can use this API to override the default behavior.
 *
 * To sync data using self-managed connectors, you need to deploy the Elastic connector service on your own infrastructure.
 * This service runs automatically on Elastic Cloud for Elastic managed connectors.
 */
export const ConnectorUpdateFeaturesRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated.').meta({ found_in: 'path' }),
  features: ConnectorConnectorFeatures.meta({ found_in: 'body' })
})
export type ConnectorUpdateFeaturesRequest = z.infer<typeof ConnectorUpdateFeaturesRequest>

export const ConnectorUpdateFeaturesResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateFeaturesResponse = z.infer<typeof ConnectorUpdateFeaturesResponse>

/**
 * Update the connector filtering.
 *
 * Update the draft filtering configuration of a connector and marks the draft validation state as edited.
 * The filtering draft is activated once validated by the running Elastic connector service.
 * The filtering property is used to configure sync rules (both basic and advanced) for a connector.
 */
export const ConnectorUpdateFilteringRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  filtering: z.array(ConnectorFilteringConfig).optional().meta({ found_in: 'body' }),
  rules: z.array(ConnectorFilteringRule).optional().meta({ found_in: 'body' }),
  advanced_snippet: ConnectorFilteringAdvancedSnippet.optional().meta({ found_in: 'body' })
})
export type ConnectorUpdateFilteringRequest = z.infer<typeof ConnectorUpdateFilteringRequest>

export const ConnectorUpdateFilteringResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateFilteringResponse = z.infer<typeof ConnectorUpdateFilteringResponse>

/**
 * Update the connector draft filtering validation.
 *
 * Update the draft filtering validation info for a connector.
 */
export const ConnectorUpdateFilteringValidationRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  validation: ConnectorFilteringRulesValidation.meta({ found_in: 'body' })
})
export type ConnectorUpdateFilteringValidationRequest = z.infer<typeof ConnectorUpdateFilteringValidationRequest>

export const ConnectorUpdateFilteringValidationResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateFilteringValidationResponse = z.infer<typeof ConnectorUpdateFilteringValidationResponse>

/**
 * Update the connector index name.
 *
 * Update the `index_name` field of a connector, specifying the index where the data ingested by the connector is stored.
 */
export const ConnectorUpdateIndexNameRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  index_name: z.lazy(() => SpecUtilsWithNullValue).meta({ found_in: 'body' })
})
export type ConnectorUpdateIndexNameRequest = z.infer<typeof ConnectorUpdateIndexNameRequest>

export const ConnectorUpdateIndexNameResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateIndexNameResponse = z.infer<typeof ConnectorUpdateIndexNameResponse>

/** Update the connector name and description. */
export const ConnectorUpdateNameRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  name: z.string().optional().meta({ found_in: 'body' }),
  description: z.string().optional().meta({ found_in: 'body' })
})
export type ConnectorUpdateNameRequest = z.infer<typeof ConnectorUpdateNameRequest>

export const ConnectorUpdateNameResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateNameResponse = z.infer<typeof ConnectorUpdateNameResponse>

/** Update the connector is_native flag. */
export const ConnectorUpdateNativeRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  is_native: z.boolean().meta({ found_in: 'body' })
})
export type ConnectorUpdateNativeRequest = z.infer<typeof ConnectorUpdateNativeRequest>

export const ConnectorUpdateNativeResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateNativeResponse = z.infer<typeof ConnectorUpdateNativeResponse>

/**
 * Update the connector pipeline.
 *
 * When you create a new connector, the configuration of an ingest pipeline is populated with default settings.
 */
export const ConnectorUpdatePipelineRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  pipeline: ConnectorIngestPipelineParams.meta({ found_in: 'body' })
})
export type ConnectorUpdatePipelineRequest = z.infer<typeof ConnectorUpdatePipelineRequest>

export const ConnectorUpdatePipelineResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdatePipelineResponse = z.infer<typeof ConnectorUpdatePipelineResponse>

/** Update the connector scheduling. */
export const ConnectorUpdateSchedulingRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  scheduling: ConnectorSchedulingConfiguration.meta({ found_in: 'body' })
})
export type ConnectorUpdateSchedulingRequest = z.infer<typeof ConnectorUpdateSchedulingRequest>

export const ConnectorUpdateSchedulingResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateSchedulingResponse = z.infer<typeof ConnectorUpdateSchedulingResponse>

/** Update the connector service type. */
export const ConnectorUpdateServiceTypeRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  service_type: z.string().meta({ found_in: 'body' })
})
export type ConnectorUpdateServiceTypeRequest = z.infer<typeof ConnectorUpdateServiceTypeRequest>

export const ConnectorUpdateServiceTypeResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateServiceTypeResponse = z.infer<typeof ConnectorUpdateServiceTypeResponse>

/** Update the connector status. */
export const ConnectorUpdateStatusRequest = z.object({
  connector_id: z.lazy(() => Id).describe('The unique identifier of the connector to be updated').meta({ found_in: 'path' }),
  status: ConnectorConnectorStatus.meta({ found_in: 'body' })
})
export type ConnectorUpdateStatusRequest = z.infer<typeof ConnectorUpdateStatusRequest>

export const ConnectorUpdateStatusResponse = z.object({
  result: z.lazy(() => Result)
})
export type ConnectorUpdateStatusResponse = z.infer<typeof ConnectorUpdateStatusResponse>
