/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Side-effect module: must be the first import of cli.ts so ESM evaluates it
// before any other module is compiled. Caches V8 bytecode across runs.
import { enableCompileCache } from 'node:module'

try {
  // Added in Node 22.1 and absent on some runtimes; engines allows 22.0.0.
  enableCompileCache?.()
} catch {
  // Unsupported runtime or unwritable cache dir: run uncached.
}
