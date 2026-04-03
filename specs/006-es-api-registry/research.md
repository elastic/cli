# Research: Elasticsearch API Registry

**Branch**: `006-es-api-registry` | **Date**: 2026-04-02

## R1: @elastic/transport Integration Pattern

**Decision**: Use `Transport` class directly from `@elastic/transport` rather than going through `@elastic/elasticsearch` client. Instantiate a single `Transport` instance per CLI invocation from the resolved config context.

**Rationale**: The CLI already has its own config system (cosmiconfig + contexts). Using `Transport` directly avoids pulling in the full `@elastic/elasticsearch` client (which would add another large dependency). `Transport.request()` accepts `TransportRequestParams` (`method`, `path`, `body`, `querystring`) which maps perfectly to the API definition structure.

**Alternatives considered**:
- `@elastic/elasticsearch` client: Too heavyweight; bundles all API methods we'd be duplicating. Adds a large transitive dependency tree beyond what `@elastic/transport` already provides.
- Native `fetch` / `node:http`: Approved in spec clarification as Option B/C but rejected in favor of `@elastic/transport` (Option A) for built-in connection pooling, retry logic, TLS, and auth support.

**Key integration details**:
- `Transport` constructor requires a `ConnectionPool` with at least one node URL.
- Auth credentials from config context map to connection options (`ApiKeyAuth` or basic auth headers).
- `transport.request(params)` returns `TransportResult` with `body`, `statusCode`, `headers`.
- Use `{ meta: true }` option to get full response metadata for error handling.
- The transport handles serialization/deserialization; for `_cat` APIs that return plain text, set `Accept: text/plain` header or use the response as-is.

## R2: Commander.js Nested Group Registration

**Decision**: Use the existing `defineGroup` function to create namespace groups (`cat`, `indices`) and `defineCommand` (or a thin wrapper) for leaf API commands. Register all groups under a top-level `es` group.

**Rationale**: The existing `defineGroup` and `defineCommand` functions already handle Commander.js registration, help formatting, error output, and input validation. The API registry layer sits above them, translating `EsApiDefinition` objects into `CommandConfig` objects.

**Alternatives considered**:
- Building Commander commands directly without the factory: Would bypass the constitution-mandated config-driven approach and duplicate validation/help logic.
- A completely new registration system: Unnecessary; the factory already solves the Commander.js integration.

**Key details**:
- `defineGroup` accepts `GroupConfig` + child commands. The `es` group contains namespace groups; each namespace group contains leaf commands.
- `defineCommand` accepts `CommandConfig` with `handler`, `options`, `input`. The generic ES handler is the same function for all API commands — only the definition varies.
- The registration function iterates namespace arrays, groups definitions by namespace, creates Commander groups and commands, and returns the top-level `es` group handle.

## R3: API Definition Shape

**Decision**: Each API definition is a plain TypeScript object conforming to an `EsApiDefinition` interface. Definitions are grouped into arrays exported from per-namespace files.

**Rationale**: Plain objects are type-checked at compile time, trivially serializable for testing, and straightforward for code generation. The interface is extensible (future `aliases` field, etc.) without breaking existing definitions.

**Key fields**:
- `name`: Command name (kebab-case, e.g., `"health"`, `"create"`)
- `namespace`: ES namespace (e.g., `"cat"`, `"indices"`)
- `description`: Human-readable description for help text
- `method`: HTTP method (`"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"HEAD"`)
- `path`: URL path template with `{param}` placeholders (e.g., `"/_cat/health"`, `"/{index}"`)
- `pathParams`: Array of path parameter definitions (name, description, required)
- `queryParams`: Array of query parameter definitions (name, type, description, required, default)
- `body`: Optional Zod schema for request body validation
- `responseType`: `"json"` | `"text"` — determines response handling (pretty-print JSON vs pass-through text)

## R4: Response Handling Strategy

**Decision**: Pass-through raw response body. For `responseType: "text"` (e.g., `_cat` APIs), display the body as-is. For `responseType: "json"`, pretty-print the parsed JSON. When `--format json` is active, always output JSON (wrapping text responses is out of scope per spec clarification).

**Rationale**: Simplest approach that honors the ES server's formatting. `_cat` APIs return well-formatted text tables by default. JSON APIs return structured data. No client-side reformatting needed.

## R5: Transport Client Lifecycle

**Decision**: Create a `Transport` instance lazily on first use within a CLI invocation. The factory function reads from the resolved config context. Cache the instance in a module-level variable (same pattern as `config/store.ts`).

**Rationale**: The CLI only needs one transport instance per invocation. Creating it lazily avoids initialization cost for commands that don't need it (e.g., `--help`). The module-level singleton pattern is already established in the codebase (`config/store.ts`).

**Alternatives considered**:
- Create transport in `preAction` hook: Would initialize transport even for `--help` invocations; wasteful.
- Pass transport via `ParsedResult`: Would require modifying the factory's `ParsedResult` interface; too invasive for this feature.

## R6: `--dry-run` Support for ES Commands

**Decision**: All ES API commands support `--dry-run`. When active, the command validates input, builds the `TransportRequestParams`, outputs the resolved request as JSON, and exits without sending the request. This satisfies Constitution III.

**Rationale**: Constitution III requires `--dry-run` for all mutation/network commands. ES API commands always make network calls, so all need dry-run support. The generic handler checks the `--dry-run` flag before calling `transport.request()`.
