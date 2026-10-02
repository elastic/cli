/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cheap config-file discovery primitives.
 *
 * Kept free of heavy imports (no `yaml`, `ajv`, or `@elastic/config-resolver`)
 * so startup paths that only need to know *whether* a config source exists can
 * import this without pulling in the full loader stack. See #706.
 */

import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** File names checked during home-directory discovery, in priority order. */
export const CONFIG_FILE_NAMES = ['.elasticrc', '.elasticrc.json', '.elasticrc.yaml', '.elasticrc.yml']

/** Environment variable that overrides config file discovery with an explicit path. */
export const ENV_CONFIG_FILE = 'ELASTIC_CLI_CONFIG_FILE'

/**
 * Searches a single directory for the first readable config file.
 *
 * Checks each file name in {@link CONFIG_FILE_NAMES} order. Returns the
 * absolute path of the first readable match, or `null` if none is found.
 *
 * @param dir - Directory to search. Defaults to the user's home directory.
 */
export async function discoverConfigFile (dir?: string): Promise<string | null> {
  const searchDir = dir ?? homedir()
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = join(searchDir, name)
    try {
      await access(candidate, constants.R_OK)
      return candidate
    } catch { continue }
  }
  return null
}

/**
 * Returns `true` when a config source exists: the `ELASTIC_CLI_CONFIG_FILE` env
 * var is set, or a config file is discoverable in the home directory. Used to
 * avoid importing the full config loader when there is nothing to load.
 */
export async function hasConfigSource (): Promise<boolean> {
  if (process.env[ENV_CONFIG_FILE] != null) return true
  return (await discoverConfigFile()) != null
}
