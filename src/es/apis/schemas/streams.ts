/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-redeclare */
import { z } from 'zod'

import { AcknowledgedResponseBase, Duration } from './_types.ts'

export const StreamsStreamType = z.enum(['logs', 'logs.otel', 'logs.ecs'])
export type StreamsStreamType = z.infer<typeof StreamsStreamType>

/**
 * Disable a named stream.
 *
 * Turn off the named stream feature for this cluster.
 */
export const StreamsLogsDisableRequest = z.object({
  name: StreamsStreamType.describe('The stream type to disable.').meta({ found_in: 'path' }),
  master_timeout: z.lazy(() => Duration).describe('The period to wait for a connection to the master node. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' })
})
export type StreamsLogsDisableRequest = z.infer<typeof StreamsLogsDisableRequest>

export const StreamsLogsDisableResponse = z.lazy(() => AcknowledgedResponseBase)
export type StreamsLogsDisableResponse = z.infer<typeof StreamsLogsDisableResponse>

/**
 * Enable a named stream.
 *
 * Turn on the named stream feature for this cluster.
 *
 * NOTE: To protect existing data, this feature can be turned on only if the cluster does not have
 * existing indices or data streams that match the pattern `<name>|<name>.*` for the enabled stream
 * type name. If those indices or data streams exist, a `409 - Conflict` response and error is
 * returned.
 */
export const StreamsLogsEnableRequest = z.object({
  name: StreamsStreamType.describe('The stream type to enable.').meta({ found_in: 'path' }),
  master_timeout: z.lazy(() => Duration).describe('The period to wait for a connection to the master node. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('The period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' })
})
export type StreamsLogsEnableRequest = z.infer<typeof StreamsLogsEnableRequest>

export const StreamsLogsEnableResponse = z.lazy(() => AcknowledgedResponseBase)
export type StreamsLogsEnableResponse = z.infer<typeof StreamsLogsEnableResponse>

/**
 * Get the status of streams.
 *
 * Get the current status for all types of streams.
 */
export const StreamsStatusRequest = z.object({
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' })
})
export type StreamsStatusRequest = z.infer<typeof StreamsStatusRequest>

export const StreamsStatusStreamStatus = z.object({
  enabled: z.boolean().describe('If true, the stream feature is enabled.')
})
export type StreamsStatusStreamStatus = z.infer<typeof StreamsStatusStreamStatus>

export const StreamsStatusResponse = z.object({
  logs: StreamsStatusStreamStatus,
  'logs.otel': StreamsStatusStreamStatus,
  'logs.ecs': StreamsStatusStreamStatus
})
export type StreamsStatusResponse = z.infer<typeof StreamsStatusResponse>
