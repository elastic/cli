/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public `elastic completion <shell>` command: prints the per-shell wrapper
 * script that hooks the CLI into the user's shell completion system.
 *
 * The wrapper is dynamic — every tab press calls back into `elastic
 * __complete` to ask for candidates. See `complete.ts` for the callback
 * protocol and `shells/*.ts` for the per-shell wrappers themselves.
 */

import { defineCommand } from '../factory.ts'
import type { OpaqueCommandHandle } from '../factory.ts'
import { bashWrapper } from './shells/bash.ts'
import { zshWrapper } from './shells/zsh.ts'
import { fishWrapper } from './shells/fish.ts'

/** Maps a shell name to a function that produces its wrapper script. */
const WRAPPERS: Readonly<Record<string, () => string>> = Object.freeze({
  bash: bashWrapper,
  zsh: zshWrapper,
  fish: fishWrapper,
})

/** Shells supported by `elastic completion <shell>`, in declaration order. */
export const SUPPORTED_SHELLS: readonly string[] = Object.freeze(Object.keys(WRAPPERS))

/**
 * Builds the `elastic completion <shell>` command.
 *
 * Behaviour:
 *   - `elastic completion bash`      → prints the bash wrapper to stdout
 *   - `elastic completion zsh`       → prints the zsh wrapper to stdout
 *   - `elastic completion fish`      → prints the fish wrapper to stdout
 *   - `elastic completion <other>`   → structured error, exit 1
 *   - `elastic completion --json <shell>` → JSON `{shell, script}` on stdout
 */
export function buildCompletionCommand (): OpaqueCommandHandle {
  return defineCommand({
    name: 'completion',
    description: `Print a shell completion script (${SUPPORTED_SHELLS.join(', ')})`,
    positionalArg: {
      name: 'shell',
      description: `target shell (${SUPPORTED_SHELLS.join(', ')})`,
      required: true,
    },
    handler: (parsed) => {
      // `shell` is a required positional, so Commander rejects missing input
      // before the handler runs; the non-null assertion documents this
      // invariant and removes a dead `?? ''` branch from coverage.
      const shell = parsed.arg!
      const wrapper = WRAPPERS[shell]
      if (wrapper == null) {
        return {
          error: {
            code: 'unknown_shell',
            message: `unknown shell "${shell}". Supported: ${SUPPORTED_SHELLS.join(', ')}`,
          },
        }
      }
      return { shell, script: wrapper() }
    },
    formatOutput: (result) => {
      const r = result as { shell: string; script: string }
      return r.script
    },
  })
}
