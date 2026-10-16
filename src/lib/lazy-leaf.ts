/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Imports only `commander`: this module sits on the `es --help` / `kb --help` import
// graph, so loading the real leaf stays with the caller's `loadReal` callback.
import { Command } from 'commander'

/** Name and description shown for a stub leaf in group-level help. */
export interface StubLeafMeta {
  name: string
  description: string
}

/**
 * Builds a lightweight stub leaf: name and description only, no options. Commander
 * lists it in group-level help without resolving its input schema. If the stub is
 * invoked (the argv sniff missed it), it loads the real leaf via `loadReal`, swaps
 * itself out of its parent for that leaf, and re-enters Commander parsing so the real
 * leaf's options dispatch.
 *
 * @param meta - name and description for the stub
 * @param loadReal - loads and builds the real leaf command on demand
 * @returns the stub command
 */
export function buildStubLeaf (meta: StubLeafMeta, loadReal: () => Promise<Command>): Command {
  const cmd = new Command(meta.name)
  cmd.description(meta.description)
  cmd.allowUnknownOption(true)
  cmd.action(async () => {
    const real = await loadReal()
    const parent = cmd.parent
    if (parent != null) {
      // Commander's `commands` array is typed readonly but mutated internally;
      // splice directly to swap the stub for the real leaf.
      const list = parent.commands as Command[]
      const idx = list.indexOf(cmd)
      if (idx >= 0) list.splice(idx, 1)
      parent.addCommand(real)
      await parent.parseAsync(process.argv)
    }
  })
  return cmd
}
