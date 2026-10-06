/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic api <method> <path>` -- untyped HTTP against the active context.
 *
 * Prefer generated commands. Use this when no typed command exists (preview
 * Kibana routes, custom headers, undocumented query params, incident paths).
 */

import type { Command } from 'commander'
import { defineCommand } from '../factory.ts'
import type { HandlerResult, JsonValue, OpaqueCommandHandle, ParsedResult } from '../factory.ts'
import { getResolvedConfig } from '../config/store.ts'
import { buildApiRequest, redactRequest, sendApiRequest } from './request.ts'
import { EsResponseError, EsConnectionError } from '../lib/es-client.ts'

function collectHeader (value: string, previous: string[]): string[] {
  return [...previous, value]
}

function extraHeaders (cmd: Command): string[] {
  const raw = cmd.getOptionValue('header')
  return Array.isArray(raw) ? raw as string[] : []
}

function inputError (err: unknown): HandlerResult {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'input_error', message } } as unknown as HandlerResult
}

function missingConfigError (err: unknown): HandlerResult {
  const message = err instanceof Error ? err.message : String(err)
  return { error: { code: 'missing_config', message } } as unknown as HandlerResult
}

async function apiHandler (parsed: ParsedResult, cmd: Command): Promise<HandlerResult> {
  const method = parsed.arg ?? ''
  const path = typeof cmd.processedArgs[1] === 'string' ? cmd.processedArgs[1] : ''
  const service = String(parsed.options['service'] ?? '')
  const fromFile = parsed.options['input-file'] != null
  const input = parsed.input
  const hasKeys = input != null && typeof input === 'object' && !Array.isArray(input) && Object.keys(input as object).length > 0
  const body = fromFile === true || hasKeys ? input : undefined

  try {
    const req = buildApiRequest({
      method,
      path,
      service,
      extraHeaders: extraHeaders(cmd),
      body,
      config: parsed.config ?? getResolvedConfig(),
    })
    if (parsed.options['dry-run'] === true) {
      return redactRequest(req) as unknown as JsonValue
    }
    return await sendApiRequest(req) as JsonValue
  } catch (err) {
    // Let EsResponseError (HTTP 4xx/5xx) and EsConnectionError bubble up so the
    // top-level error handler can apply the usual auth_required / status_code
    // mapping instead of collapsing them into a generic transport_error.
    if (err instanceof EsResponseError || err instanceof EsConnectionError) {
      throw err
    }

    const code = err != null && typeof err === 'object' && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined
    if (code === 'input_error') return inputError(err)
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('missing_config')) return missingConfigError(err)

    // Re-throw anything else we don't recognise so it surfaces clearly.
    throw err
  }
}

/**
 * Builds the `elastic api` command. Two positionals (`method`, `path`) because
 * the factory only wires one; the path argument is registered after defineCommand.
 */
export function registerApiCommand (): OpaqueCommandHandle {
  const cmd = defineCommand({
    name: 'api',
    description: 'Send an untyped HTTP request using the active context (prefer generated commands)',
    positionalArg: { name: 'method', description: 'HTTP method (GET, POST, PUT, DELETE, HEAD, PATCH)', required: true },
    options: [
      { long: 'service', description: 'target service: es, kb, or cloud', required: true },
    ],
    input: { type: 'object', additionalProperties: true },
    passthroughDryRun: true,
    handler: (parsed) => apiHandler(parsed, cmd),
  })
  cmd.argument('<path>', 'request path, for example / or /_cluster/health')
  cmd.option('-H, --header <header>', 'extra request header as Name: value (repeatable)', collectHeader, [])
  return cmd
}
