/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts a resolved CLI config into a flat set of environment variables
 * that extensions can read to connect to Elastic services without re-implementing
 * config parsing.
 *
 * Only variables with a defined value are included in the returned object.
 * Extensions must treat absent variables as "service not configured".
 *
 * Exported variable names:
 *   ELASTIC_ES_URL              Elasticsearch URL
 *   ELASTIC_ES_API_KEY          Elasticsearch API key (api_key auth)
 *   ELASTIC_ES_USERNAME         Elasticsearch username (basic auth)
 *   ELASTIC_ES_PASSWORD         Elasticsearch password (basic auth)
 *   ELASTIC_KIBANA_URL          Kibana URL
 *   ELASTIC_KIBANA_API_KEY      Kibana API key
 *   ELASTIC_KIBANA_USERNAME     Kibana username (basic auth)
 *   ELASTIC_KIBANA_PASSWORD     Kibana password (basic auth)
 *   ELASTIC_CLOUD_URL           Elastic Cloud URL
 *   ELASTIC_CLOUD_API_KEY       Elastic Cloud API key
 */

import type { ResolvedConfig, ServiceBlock } from '../config/types.ts'

type EnvMap = Record<string, string>

function serviceEnv (prefix: string, block: ServiceBlock): EnvMap {
  const env: EnvMap = {}
  env[`${prefix}_URL`] = block.url
  if (block.auth == null) return env
  if ('api_key' in block.auth) {
    env[`${prefix}_API_KEY`] = block.auth.api_key
  } else {
    env[`${prefix}_USERNAME`] = block.auth.username
    env[`${prefix}_PASSWORD`] = block.auth.password
  }
  return env
}

/**
 * Returns a flat `Record<string, string>` of environment variables derived
 * from the resolved config. Merge this into the child process `env` when
 * spawning an extension.
 */
export function buildContextEnv (config: ResolvedConfig): EnvMap {
  const env: EnvMap = {}
  const { elasticsearch, kibana, cloud } = config.context
  if (elasticsearch != null) Object.assign(env, serviceEnv('ELASTIC_ES', elasticsearch))
  if (kibana != null) Object.assign(env, serviceEnv('ELASTIC_KIBANA', kibana))
  if (cloud != null) Object.assign(env, serviceEnv('ELASTIC_CLOUD', cloud))
  return env
}
