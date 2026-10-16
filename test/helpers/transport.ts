/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsClient, EsRequestParams } from '../../src/lib/es-client.ts'

/** A request seen by {@link mockTransport}. */
export interface RecordedRequest {
  params: EsRequestParams
  opts?: { headers?: Record<string, string> } | undefined
}

/**
 * Builds an EsClient that records every `request()` and replays `responses` in
 * order. Once the queue is exhausted it answers with `whenExhausted`, or with
 * the last response when that is omitted.
 */
export function mockTransport<R> (responses: R[], whenExhausted?: R): {
  transport: EsClient
  requests: RecordedRequest[]
} {
  const requests: RecordedRequest[] = []
  let callIndex = 0
  const transport = {
    request: async (params: EsRequestParams, opts?: RecordedRequest['opts']) => {
      requests.push({ params, opts })
      return responses[callIndex++] ?? whenExhausted ?? responses[responses.length - 1]
    },
  } as unknown as EsClient
  return { transport, requests }
}
