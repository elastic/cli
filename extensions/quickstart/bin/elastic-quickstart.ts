#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Entrypoint spawned by `elastic quickstart`.
 *
 * Runs as TypeScript directly under Node's type stripping: the extension host
 * installs with `--ignore-scripts`, so no build step runs and there is no
 * `dist/` to point at.
 */

import { parseArgs, usage } from '../src/argv.ts'
import { resolveCliBin } from '../src/cli-bin.ts'
import { createRunCli } from '../src/executor.ts'
import { detectMode } from '../src/mode.ts'
import { QuickstartError, reportError } from '../src/errors.ts'

async function main (): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(usage())
    return 0
  }

  const cli = await resolveCliBin(args.cliBin)
  const mode = detectMode(args.json)

  // Bound here so the resolved binary is proven reachable before any journey
  // node runs; the flow itself is not ported yet.
  void createRunCli(cli.path)

  throw new QuickstartError(
    'not_implemented',
    `The quickstart journey is not ported yet (mode: ${mode}, elastic ${cli.version} at ${cli.path}).`,
    ['Follow the MVP flow on feat/quickstart-mvp until the port lands.'],
  )
}

try {
  process.exitCode = await main()
} catch (err) {
  process.exitCode = reportError(err, process.stderr)
}
