/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compile entry for `bun build --compile`. Imports the generated schema
 * loaders (string-literal `import()`) so Bun embeds `@elastic/schemas`, then
 * starts the CLI.
 */
import { setSchemaLoaders } from './lib/json-schema-refs.ts'
import { schemaLoaders } from '../dist/schema-loaders.generated.js'

setSchemaLoaders(schemaLoaders)
await import('./cli.ts')
