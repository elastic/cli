/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `elastic status` -- a connectivity and authentication diagnostic for the
 * active config context.
 *
 * Runs one probe per configured service block (`elasticsearch`, `kibana`,
 * `cloud`) concurrently and reports a per-service result. Services missing
 * from the active context are omitted from the output; they are not failures.
 *
 * Unlike most commands, the handler loads the config itself rather than
 * relying on the `preAction` hook so that a partially broken config is
 * reported as a structured error instead of exiting before any probe runs.
 */

import { defineCommand } from '../factory.ts'
import type { JsonValue, OpaqueCommandHandle, ParsedResult } from '../factory.ts'
import { loadConfig } from '../config/loader.ts'
import type { BuiltInProfile, ResolvedContext } from '../config/types.ts'
import { BUILT_IN_PROFILES } from '../config/profiles.ts'
import { checkElasticsearch, checkKibana, checkCloud } from './checks.ts'
import type { EsCheck, KbCheck, CloudCheck } from './checks.ts'
import { formatStatusText } from './format.ts'
import type { StatusResult } from './types.ts'

/**
 * Test seam: the fetch implementation used by the three service probes.
 * Production code uses `globalThis.fetch`; integration tests replace it via
 * {@link _testSetFetch}.
 */
let _fetchImpl: typeof fetch = globalThis.fetch

/**
 * Replace the fetch implementation used by `elastic status`. Returns a restore
 * callback; call it in a `finally` block to avoid test pollution.
 *
 * @internal not part of the public API
 */
export function _testSetFetch (fn: typeof fetch): () => void {
  const prev = _fetchImpl
  _fetchImpl = fn
  return () => { _fetchImpl = prev }
}

/**
 * Runs each configured probe concurrently and returns the merged result.
 * Exported for direct unit testing of the orchestration logic without going
 * through Commander.
 */
export async function runStatusChecks (
  contextName: string,
  context: ResolvedContext,
  fetchFn: typeof fetch = _fetchImpl,
): Promise<StatusResult> {
  const tasks: Array<Promise<['elasticsearch', EsCheck] | ['kibana', KbCheck] | ['cloud', CloudCheck]>> = []
  if (context.elasticsearch != null) {
    const block = context.elasticsearch
    tasks.push(checkElasticsearch(block, fetchFn).then((r): ['elasticsearch', EsCheck] => ['elasticsearch', r]))
  }
  if (context.kibana != null) {
    const block = context.kibana
    tasks.push(checkKibana(block, fetchFn).then((r): ['kibana', KbCheck] => ['kibana', r]))
  }
  if (context.cloud != null) {
    const block = context.cloud
    tasks.push(checkCloud(block, fetchFn).then((r): ['cloud', CloudCheck] => ['cloud', r]))
  }

  const settled = await Promise.allSettled(tasks)
  const services: StatusResult['services'] = {}
  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') continue
    const [name, value] = outcome.value
    if (name === 'elasticsearch') services.elasticsearch = value
    else if (name === 'kibana') services.kibana = value
    else services.cloud = value
  }
  return { context: contextName, services }
}

function isBuiltInProfile (val: string): val is BuiltInProfile {
  return (BUILT_IN_PROFILES as readonly string[]).includes(val)
}

async function statusHandler (parsed: ParsedResult): Promise<JsonValue> {
  // Global flags are exposed on parsed.options as kebab-case keys by the factory
  // (see factory.ts:641-646). They are not declared as command options here.
  const opts = parsed.options
  const useContextRaw = opts['use-context']
  const configFileRaw = opts['config-file']
  const profileRaw = opts['command-profile']
  const useContext = typeof useContextRaw === 'string' ? useContextRaw : undefined
  const configFile = typeof configFileRaw === 'string' ? configFileRaw : undefined
  const profileName = typeof profileRaw === 'string' && isBuiltInProfile(profileRaw) ? profileRaw : undefined

  const loaded = await loadConfig({
    ...(useContext != null && { contextName: useContext }),
    ...(configFile != null && { configPath: configFile }),
    ...(profileName != null && { profileName }),
  })
  if (!loaded.ok) {
    return { error: { code: 'config_error', message: loaded.error.message } }
  }

  const result = await runStatusChecks(loaded.contextName, loaded.value.context)
  const anyFail = Object.values(result.services).some((svc) => svc != null && !svc.ok)
  if (anyFail) {
    process.exitCode = 1
  }
  return result as unknown as JsonValue
}

/**
 * Builds the `elastic status` command handle. Returned commands are registered
 * lazily by `cli.ts` so that the rest of the command tree does not pay the
 * import cost when `status` is not invoked.
 */
export function registerStatusCommand (): OpaqueCommandHandle {
  return defineCommand({
    name: 'status',
    description: 'Verify connectivity and authentication for the active context',
    handler: statusHandler,
    formatOutput: (result) => formatStatusText(result as unknown as StatusResult),
  })
}
