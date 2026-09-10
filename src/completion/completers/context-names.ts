/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dynamic completer for the `--use-context <name>` flag.
 *
 * Reads the active config file (env var or home-directory discovery) using a
 * structural-only parse (no expression resolution, no service-block
 * validation). Returns the keys of the `contexts` map.
 *
 * Completion MUST NOT propagate errors: missing files, malformed YAML,
 * permission errors, or unresolved `$(...)` expressions all return `[]`.
 */
import { StructuralConfigSchema } from '../../config/schema.ts'

const ENV_CONFIG_FILE = 'ELASTIC_CLI_CONFIG_FILE'

/**
 * Resolves the list of context names from the active config file.
 *
 * Resolution precedence mirrors {@link loadConfig}:
 *   1. `$ELASTIC_CLI_CONFIG_FILE` if set and non-empty
 *   2. Discovery in the user's home directory
 *
 * Returns `[]` on any failure — the function never throws.
 */
export async function completeContextNames (): Promise<string[]> {
  try {
    const { discoverConfigFile, loadConfigFile } = await import('../../config/loader.js')
    const envPath = process.env[ENV_CONFIG_FILE]
    const path = envPath != null && envPath.length > 0
      ? envPath
      : await discoverConfigFile()
    if (path == null) return []

    const raw = await loadConfigFile(path)
    const parsed = StructuralConfigSchema.safeParse(raw)
    if (!parsed.success) return []

    return Object.keys(parsed.data.contexts)
  } catch {
    return []
  }
}
