/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandIntent } from './factory.ts'

/**
 * Derives intent from an HTTP method.
 *
 * GET and HEAD are safe and idempotent.
 * PUT is idempotent (upsert semantics).
 * DELETE is destructive and idempotent.
 * POST and PATCH are left undefined — their semantics depend on the specific
 * endpoint and should be annotated explicitly via EsApiMeta.intent / KbApiMeta.intent.
 */
export function inferIntentFromHttp (method: string): CommandIntent | undefined {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return { destructive: false, idempotent: true, scope: 'global' }
    case 'PUT':
      return { destructive: false, idempotent: true, scope: 'global' }
    case 'DELETE':
      return { destructive: true, idempotent: true, scope: 'global' }
    default:
      return undefined
  }
}
