# Contract: EsApiDefinition (Unified Schema)

**Branch**: `007-external-zod-schema-integration` | **Date**: 2026-04-03

## Overview

This contract defines the interface between the external code generator (which produces both `@elastic/zod` schemas and CLI definition manifests) and the CLI's command registration system. The CLI consumes `EsApiDefinition` objects to register ES API commands.

## EsApiDefinition Interface

```typescript
interface EsApiDefinition {
  /** kebab-case command name (e.g., "create", "put-mapping") */
  name: string

  /**
   * ES namespace (e.g., "cat", "indices") -- determines parent group.
   * When omitted, the command is registered as a direct leaf of the `es` group.
   */
  namespace?: string

  /** human-readable description for --help text */
  description: string

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'

  /** URL path template; path parameters use {param} syntax */
  path: string

  /**
   * Unified Zod object schema, or a no-arg factory function that returns one.
   * Every top-level field represents a parameter.
   * Each field MUST have .meta({ found_in: "path" | "query" | "body" }) applied.
   * Fields without found_in metadata default to "body".
   *
   * Schema keys are snake_case and serve as:
   * - The ES-native parameter name (for query params and body fields)
   * - The source for auto-derived kebab-case CLI flags
   *
   * Use z.looseObject() when body fields may include underscore-prefixed keys
   * that cannot be valid CLI flags.
   *
   * Use the factory form (`() => schema`) when the schema is imported from a file
   * that participates in circular module dependencies. This defers resolution to
   * call time (after all modules have initialised) and avoids TDZ errors.
   */
  input?: z.ZodObject<z.ZodRawShape> | (() => z.ZodObject<z.ZodRawShape>)

  /** how to handle the response body; defaults to "json" */
  responseType?: 'json' | 'text'
}
```

## found_in Metadata Contract

Each top-level field in the `input` schema carries routing metadata:

```typescript
// The metadata shape attached via .meta(...)
interface FoundInMeta {
  found_in: 'path' | 'query' | 'body'
}

// Example schema
const schema = z.looseObject({
  index:   z.string().describe('Target index').meta({ found_in: 'path' }),
  pretty:  z.boolean().optional().meta({ found_in: 'query' }),
  settings: z.record(z.string(), z.unknown()).optional().meta({ found_in: 'body' }),
})
```

### Ordering Requirement

`.meta()` SHOULD be applied as the **outermost** call on each field (after `.optional()`, `.default()`, `.describe()`). The CLI handles both orderings defensively, but outermost placement ensures maximum compatibility.

## Validation Rules (enforced at registration)

1. `name` matches `/^[a-z0-9][a-z0-9-]*$/`
2. `namespace`, if present, matches `/^[a-z][a-z-]*$/`
3. `path` starts with `/`
4. Every `{param}` token in `path` has a corresponding schema field with `found_in: "path"`
5. Every schema field with `found_in: "path"` has a corresponding `{param}` token in `path`
6. No two schema keys produce the same kebab-case CLI flag after normalization
7. No CLI flag collides with reserved names: `help`, `json`, `config-file`, `use-context`, `input-file`

## Parameter Routing

| `found_in` | HTTP Location | Key Used |
|------------|---------------|----------|
| `"path"` | URL path (interpolated into `{param}` tokens) | Schema key matches path token |
| `"query"` | URL query string | Schema key (snake_case) = ES query param name |
| `"body"` | Request body JSON object | Schema key = body field name |

## Namespace Module Convention

Schemas from `@elastic/zod` are organized by namespace:

```
@elastic/zod/indices  -> schemas for the indices namespace
@elastic/zod/cat      -> schemas for the cat namespace
@elastic/zod/cluster  -> schemas for the cluster namespace
```

Each module exports Zod schemas only. The CLI pairs these with locally defined (or externally generated) `EsApiDefinition` objects that provide the endpoint metadata.
