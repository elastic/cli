/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compile entry for `bun build --compile`. Imports the generated schema
 * loaders (string-literal `import()`) so Bun embeds `@elastic/schemas`, then
 * starts the CLI.
 */
import { setSchemaLoaders } from '../src/lib/json-schema-refs.ts'
import { schemaLoaders } from './schema-loaders.generated.ts'

setSchemaLoaders(schemaLoaders)
await import('../src/cli.ts')
