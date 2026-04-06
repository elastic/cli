# Research: External Zod Schema Integration

**Branch**: `007-external-zod-schema-integration` | **Date**: 2026-04-03

## R1: Zod v4 `.meta()` Behavior with Wrapper Types

**Task**: Research how Zod v4's `.meta()` interacts with `.optional()`, `.default()`, and other wrapper types, to determine how `found_in` metadata should be extracted during schema introspection.

**Findings**:

- `.meta({found_in: "path"})` stores metadata on the *outermost* Zod type at the call site
- Wrapping *after* `.meta()` (e.g., `z.string().meta({...}).optional()`) causes `.meta()` on the outer type to return `undefined` — the metadata is buried inside the wrapper
- Wrapping *before* `.meta()` (e.g., `z.string().optional().meta({...})`) keeps metadata accessible on the outer type
- `.meta()` called with no arguments returns the metadata object or `undefined`
- The inner type is accessible via `field.def.innerType` for `optional` and `default` wrappers

**Decision**: The `extractSchemaArgs` function must read `.meta()` from the *outermost* field type first. If not found, it should also check inner types during the existing `unwrapField` traversal. This makes the code robust regardless of whether the code generator applies `.meta()` before or after optional/default wrappers.

**Assumption for code generator**: `.meta()` SHOULD be applied last (outermost) on each field. The CLI will handle both orderings defensively.

**Alternatives considered**:
- Require `.meta()` always last: rejected because the CLI cannot enforce code generator behavior
- Store `found_in` in Zod `description` string: rejected because it conflates display text with routing metadata

---

## R2: `found_in` Metadata Extraction Strategy

**Task**: Determine how to extract `found_in` from a Zod field during `extractSchemaArgs` and integrate it into `SchemaArgDefinition`.

**Findings**:

Current `unwrapField()` peels `optional` and `default` layers to find the base type. It does not inspect `.meta()`. The `.meta()` API is separate from `.def` — it's a method on any `ZodType`.

Extraction approach:
1. Call `field.meta()` on the outermost field first
2. If `.meta()` returns `undefined` or lacks `found_in`, walk the wrapper chain (same traversal as `unwrapField`) calling `.meta()` at each level
3. Return the first `found_in` value found, or `undefined` if none exists

**Decision**: Add a `extractFoundIn(field: z.ZodType): "path" | "query" | "body" | undefined` helper to `schema-args.ts`. Integrate the result into `SchemaArgDefinition` as a new optional `foundIn` field. Default to `"body"` when `foundIn` is undefined (FR-008).

**Alternatives considered**:
- Separate function outside `schema-args.ts`: rejected for cohesion — it's part of schema introspection
- Store in a parallel map instead of `SchemaArgDefinition`: rejected for complexity

---

## R3: Request Builder Refactoring Strategy

**Task**: Research how to replace the current param-array-based routing in `buildRequestParams` with `found_in` metadata-based routing.

**Findings**:

Current `buildRequestParams` uses three functions:
- `interpolatePath(def, input)` — reads `def.pathParams` to find path param names
- `buildQuerystring(def, input)` — reads `def.queryParams` to find query param names and ES names
- `collectBody(def, input)` — reads `def.body.shape` keys to find body fields

With `found_in` metadata, the routing source changes from the definition's param arrays to the schema's per-field metadata. The new approach:
- Extract `SchemaArgDefinition[]` (already done at registration) which now includes `foundIn`
- Pass these arg definitions to `buildRequestParams` instead of (or alongside) the definition
- Route by `foundIn` value: `"path"` → interpolate, `"query"` → querystring, `"body"` → body object

For query params, the `schemaKey` (snake_case) is the ES query parameter name (per clarification Q3). No separate name mapping needed.

**Decision**: Refactor `buildRequestParams` to accept a `SchemaArgDefinition[]` (or derive it from the schema at call time) and classify parameters by `foundIn`. The three internal functions (`interpolatePath`, `buildQuerystring`, `collectBody`) will iterate the arg definitions filtered by `foundIn` rather than reading separate param arrays.

**Alternatives considered**:
- Keep param arrays as a parallel routing manifest: rejected because it duplicates information already in the schema
- Read metadata directly in request builder without SchemaArgDefinition: rejected because extracting meta at every request is wasteful; extract once at registration

---

## R4: EsApiDefinition Simplification

**Task**: Determine the new shape of `EsApiDefinition` after removing `pathParams`, `queryParams`, and `body`.

**Findings**:

Current `EsApiDefinition` fields:
- `name`, `namespace`, `description` — kept (display/registration metadata)
- `method`, `path` — kept (endpoint routing)
- `responseType` — kept (response handling)
- `pathParams`, `queryParams`, `body` — **removed** (replaced by unified schema with `found_in` metadata)

New field needed:
- `input: z.ZodObject<z.ZodRawShape>` — the unified Zod schema (may come from `@elastic/zod` or be defined locally)

The `validateApiDefinition` function must be updated:
- Remove checks for `pathParams`/`queryParams`/`body` consistency
- Add validation that every `found_in: "path"` field has a matching `{param}` token in the path template
- Add validation that every `{param}` token in the path template has a corresponding `found_in: "path"` field
- Schema key collision checks now operate on the unified schema keys (already unique by nature of being object keys)

**Decision**: Simplify `EsApiDefinition` to contain `name`, `namespace`, `description`, `method`, `path`, `input` (Zod schema), and optional `responseType`. Validation extracts `found_in` metadata from the schema to perform path template consistency checks.

**Alternatives considered**:
- Keep `pathParams` for validation only: rejected because it duplicates the schema's `found_in: "path"` metadata
- Create a new interface instead of modifying: rejected because all consumers will migrate

---

## R5: Migration Strategy for Existing Hand-Authored Commands

**Task**: Determine the approach for migrating `cat.ts` and `indices.ts` definitions.

**Findings**:

Current definitions use:
- `pathParams: EsPathParam[]` — name, description, required
- `queryParams: EsQueryParam[]` — name, cliFlag, type, description, required, defaultValue
- `body: z.ZodObject<...>` — Zod schema for body fields

Migration for each definition:
1. Create a single `z.object({...})` containing all params
2. Path params: `z.string().describe(desc).optional().meta({found_in: "path"})` (or required)
3. Query params: `z.string().describe(desc).optional().meta({found_in: "query"})` (with appropriate type)
4. Body fields: existing Zod fields get `.meta({found_in: "body"})` appended
5. Use `z.looseObject(shape)` to preserve passthrough behavior for underscore-prefixed body fields
6. Shared param helpers (e.g., `catCommon`, `masterTimeout`) become schema field snippets

For the `catCommon` shared query params pattern, create reusable Zod field objects that can be spread into a schema shape.

**Decision**: Migrate all definitions in a single pass. Convert shared param arrays to shared schema field objects. Maintain `z.looseObject()` for body-containing schemas. Apply `.meta({found_in: ...})` as the outermost call on each field.

**Alternatives considered**:
- Incremental migration with adapter: rejected because both patterns would need to be supported simultaneously, increasing complexity
- Auto-migration script: rejected due to small number of definitions; manual conversion is safer and can be verified per-command
