/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-redeclare */
import { z } from 'zod'

import { Duration, long } from './_types.ts'

/** This API is a diagnostics API and the output should not be relied upon for building applications. */
export const InternalDeleteDesiredBalanceRequest = z.object({
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node.').optional().meta({ found_in: 'query' })
})
export type InternalDeleteDesiredBalanceRequest = z.infer<typeof InternalDeleteDesiredBalanceRequest>

export const InternalDeleteDesiredBalanceResponse = z.boolean()
export type InternalDeleteDesiredBalanceResponse = z.infer<typeof InternalDeleteDesiredBalanceResponse>

/** Designed for indirect use by ECE/ESS and ECK, direct use is not supported. */
export const InternalDeleteDesiredNodesRequest = z.object({
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('Period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' })
})
export type InternalDeleteDesiredNodesRequest = z.infer<typeof InternalDeleteDesiredNodesRequest>

export const InternalDeleteDesiredNodesResponse = z.boolean()
export type InternalDeleteDesiredNodesResponse = z.infer<typeof InternalDeleteDesiredNodesResponse>

/** This API is a diagnostics API and the output should not be relied upon for building applications. */
export const InternalGetDesiredBalanceRequest = z.object({
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node.').optional().meta({ found_in: 'query' })
})
export type InternalGetDesiredBalanceRequest = z.infer<typeof InternalGetDesiredBalanceRequest>

export const InternalGetDesiredBalanceResponse = z.any()
export type InternalGetDesiredBalanceResponse = z.infer<typeof InternalGetDesiredBalanceResponse>

/** Gets the latest desired nodes. */
export const InternalGetDesiredNodesRequest = z.object({
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node.').optional().meta({ found_in: 'query' })
})
export type InternalGetDesiredNodesRequest = z.infer<typeof InternalGetDesiredNodesRequest>

export const InternalGetDesiredNodesResponse = z.any()
export type InternalGetDesiredNodesResponse = z.infer<typeof InternalGetDesiredNodesResponse>

/** Prevalidates node removal from the cluster. */
export const InternalPrevalidateNodeRemovalRequest = z.object({
  names: z.array(z.string()).describe('A comma-separated list of node names to prevalidate').optional().meta({ found_in: 'query' }),
  ids: z.array(z.string()).describe('A comma-separated list of node IDs to prevalidate').optional().meta({ found_in: 'query' }),
  external_ids: z.array(z.string()).describe('A comma-separated list of node external IDs to prevalidate').optional().meta({ found_in: 'query' }),
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('Period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' })
})
export type InternalPrevalidateNodeRemovalRequest = z.infer<typeof InternalPrevalidateNodeRemovalRequest>

export const InternalPrevalidateNodeRemovalResponse = z.any()
export type InternalPrevalidateNodeRemovalResponse = z.infer<typeof InternalPrevalidateNodeRemovalResponse>

/** Designed for indirect use by ECE/ESS and ECK, direct use is not supported. */
export const InternalUpdateDesiredNodesRequest = z.object({
  history_id: z.string().describe('The history ID').meta({ found_in: 'path' }),
  version: z.lazy(() => long).describe('The version number').meta({ found_in: 'path' }),
  dry_run: z.boolean().describe('Simulate the update').optional().meta({ found_in: 'query' }),
  master_timeout: z.lazy(() => Duration).describe('Period to wait for a connection to the master node.').optional().meta({ found_in: 'query' }),
  timeout: z.lazy(() => Duration).describe('Period to wait for a response. If no response is received before the timeout expires, the request fails and returns an error.').optional().meta({ found_in: 'query' }),
  body: z.any().optional().meta({ found_in: 'body' })
})
export type InternalUpdateDesiredNodesRequest = z.infer<typeof InternalUpdateDesiredNodesRequest>

export const InternalUpdateDesiredNodesResponse = z.object({
  replaced_existing_history_id: z.boolean(),
  dry_run: z.boolean()
})
export type InternalUpdateDesiredNodesResponse = z.infer<typeof InternalUpdateDesiredNodesResponse>
