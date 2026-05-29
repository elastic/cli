/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension runner: locates and spawns an installed extension process.
 *
 * Security:
 *   - The entrypoint path comes from the validated registry (store.ts enforces
 *     that it is an absolute path).
 *   - spawn() is always called with shell: false and an explicit args array to
 *     prevent shell injection.
 *   - The child process inherits the parent's stdio so it behaves like a
 *     first-class terminal command.
 *   - Context credentials are passed as env vars merged into the inherited
 *     process.env; the extension process does not receive additional privileges.
 */

import { spawn } from 'node:child_process'
import type { InstalledExtension } from './store.ts'

/**
 * Spawns the extension's entrypoint with `args`, merging `contextEnv` into
 * the inherited environment. Resolves with the child's exit code.
 *
 * The caller should forward the exit code to `process.exit()`.
 */
export function runExtension (
  ext: InstalledExtension,
  args: string[],
  contextEnv: Record<string, string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(ext.entrypoint, args, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...contextEnv },
    })
    child.on('error', (err) => {
      reject(new Error(`Failed to start extension "${ext.name}" (${ext.entrypoint}): ${err.message}`))
    })
    child.on('close', (code) => {
      resolve(code ?? 1)
    })
  })
}
