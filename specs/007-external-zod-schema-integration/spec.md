# Feature spec: External Zod Schema Integration for Full Elasticsearch API Surface

**Feature Branch**: `007-external-zod-schema-integration`
**Created**: 2026-04-03
**Status**: Draft
**Input**: User description: "support for the entire Elasticsearch API surface area will be added by an external code generator library. however, the structure of an ES API's command definition will change slightly: the Zod schema will include all path, query and body parameters as top-level parameters in one schema, rather than keeping path and query parameters separate; each top-level parameter in a schema will have metadata attached (via Zod's `.meta(...)` functionality) that is typed as `found_in: "path" | "query" | "body"`. Zod schemas will be imported from an external library; assume this is called `@elastic/zod` for now. like the CLI commands, Zod schemas stored in `@elastic/zod` will live in namespace-specific modules"

## Clarifications

### Session 2026-04-03

- Q: What does `@elastic/zod` export per API operation — only Zod schemas, or also endpoint metadata (method, path, responseType, name, description)? → A: `@elastic/zod` exports only Zod schemas. The CLI retains a local definition manifest with endpoint metadata (method, path template, responseType, name, namespace, description) and pairs each imported schema at registration time.
- Q: Do existing hand-authored ES API definitions migrate to the new `found_in` schema pattern, or keep using separate `pathParams[]`/`queryParams[]`/`body` arrays? → A: All existing hand-authored commands will migrate to unified schemas with `found_in` metadata. The old `EsApiDefinition` param arrays (`pathParams`, `queryParams`, `body`) will be eliminated.
- Q: How are query parameter names mapped between the CLI flag and the ES query string? → A: The schema key is the ES-native query parameter name (snake_case). The CLI auto-derives the kebab-case flag from it via `toKebabCase`. No separate name mapping is needed.
- Q: Is the local definition manifest for generated commands also code-generated, or hand-maintained? → A: The manifest is produced by an external code generator (out of scope for this project). The CLI defines the expected manifest structure/contract but does not implement the generator.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Any Elasticsearch API Command (Priority: P1)

A CLI user runs a command against the full Elasticsearch API (e.g., `elastic indices get --index my-index`) and the CLI correctly routes the `index` parameter to the URL path, while other parameters are sent as query parameters or body content as appropriate.

**Why this priority**: This is the core value of the feature — exposing the full ES API surface through the CLI. Without correct parameter routing, no ES command will produce correct results.

**Independent Test**: Can be fully tested by running a generated ES API command and verifying the outbound HTTP request places each parameter in the correct location (path, query string, or request body).

**Acceptance Scenarios**:

1. **given** a generated command with a schema where `index` has `found_in: "path"`, **when** the user provides `--index my-index`, **then** `my-index` is interpolated into the URL path and not sent as a query parameter or body field
2. **given** a generated command with a schema where `pretty` has `found_in: "query"`, **when** the user provides `--pretty`, **then** `pretty` is appended to the URL query string
3. **given** a generated command with a schema where `mappings` has `found_in: "body"`, **when** the user provides `--mappings` (or via `--file`), **then** `mappings` is included in the request body JSON and not in the URL
4. **given** a command schema with a mix of path, query, and body parameters, **when** all are provided, **then** each is sent in its correct location simultaneously

---

### User Story 2 - Consume Schemas from the External `@elastic/zod` Library (Priority: P1)

The CLI command factory accepts Zod schemas imported from `@elastic/zod` namespace modules (e.g., `@elastic/zod/indices`) and uses them to define commands. The CLI retains its own local definition manifest that supplies endpoint metadata (HTTP method, path template, responseType, name, namespace, description) for each command; only the Zod parameter schema is sourced from the external library.

**Why this priority**: The entire ES API surface will be driven by these external schemas. The factory must be able to consume them without modification.

**Independent Test**: Can be fully tested by importing a schema from a simulated `@elastic/zod` module, pairing it with a local definition manifest entry, and verifying that `defineCommand` registers it correctly — generating appropriate CLI flags and help text.

**Acceptance Scenarios**:

1. **given** a schema imported from `@elastic/zod/indices` and a local definition providing method, path, and name, **when** they are combined and passed to command registration, **then** the command registers without errors and all top-level schema fields become CLI flags
2. **given** a schema from `@elastic/zod` where parameters have `found_in` metadata, **when** the command is registered, **then** the CLI correctly classifies each parameter by its `found_in` value
3. **given** that `@elastic/zod` is not installed, **when** the CLI starts, **then** it starts successfully and any commands requiring those schemas are unavailable with a clear diagnostic message

---

~~### User Story 3 - Inspect Parameter Routing via Help Text~~ *(removed)*

> **Removed**: Exposing HTTP transport routing labels (`[path]`, `[query]`, `[body]`) in
> help text or JSON Schema output leaks the HTTP transport contract into the user
> interface. Per Constitution Principle VIII (Transport-Layer Abstraction), routing
> metadata is an internal implementation concern and MUST remain invisible to CLI
> consumers. Users benefit from parameter descriptions, not from knowing which HTTP
> bucket a value is placed in.

---

### User Story 4 - Migrate Existing Hand-Authored Commands (Priority: P1)

All existing hand-authored ES API commands (currently defined via `EsApiDefinition` with separate `pathParams[]`, `queryParams[]`, and `body` fields) are migrated to use unified Zod schemas with `found_in` metadata. After migration, no command uses the old separate param array structure.

**Why this priority**: Converging on a single schema pattern eliminates dual code paths and ensures the entire ES command surface uses consistent routing logic. This is a prerequisite for removing the old `pathParams`/`queryParams`/`body` infrastructure.

**Independent Test**: Can be fully tested by running the existing test suite against the migrated commands and verifying all tests pass with no behavioral changes.

**Acceptance Scenarios**:

1. **given** all existing hand-authored ES commands have been migrated to unified schemas, **when** the full test suite runs, **then** all tests pass with identical behavior
2. **given** the migration is complete, **when** the codebase is inspected, **then** no references to the old `pathParams[]`, `queryParams[]`, or separate `body` field remain in API definitions

---

### Edge Cases

- What happens when a schema field has no `found_in` metadata? (e.g., schemas defined without the new convention)
- What happens when two parameters in the same schema share the same kebab-case CLI flag name after normalization?
- How does the CLI behave when a path template references a parameter not present in the schema?
- What happens when a body parameter is supplied via CLI flag as a primitive, but the schema expects an object?
- How are optional path parameters handled when omitted — are they removed from the URL template or left as literals?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The command factory MUST support a unified Zod schema where path, query, and body parameters coexist as top-level fields, each carrying `found_in` metadata
- **FR-002**: The schema introspection layer MUST read `found_in: "path" | "query" | "body"` from each field's Zod metadata and surface it as part of the derived argument definition
- **FR-003**: When building a request, the CLI MUST route each parameter to the correct location based on its `found_in` value: path parameters are interpolated into the URL template, query parameters are appended to the query string using the schema key (snake_case) as the ES query parameter name, and body parameters are included in the request body
- **FR-004**: All existing hand-authored ES API definitions MUST be migrated from the old `pathParams[]`/`queryParams[]`/`body` structure to unified schemas with `found_in` metadata, and the old param array infrastructure MUST be removed
- **FR-005**: Commands MUST be registerable using Zod schemas imported from `@elastic/zod` namespace-specific modules, paired with a CLI-local definition manifest that supplies endpoint metadata (HTTP method, path template, responseType, name, namespace, description)
- **FR-006**: ~~Help text and JSON Schema output MUST reflect `found_in` routing context for each parameter when metadata is present~~ *(removed — violates Constitution Principle VIII: Transport-Layer Abstraction; `found_in` metadata is an internal routing concern and MUST NOT be surfaced in user-facing output)*
- **FR-007**: The CLI MUST fail fast at command registration time if a schema field has `found_in: "path"` but the command's URL template does not contain a matching placeholder for that parameter name
- **FR-008**: A schema field with no `found_in` metadata MUST be treated as a body parameter by default, preserving backward compatibility with any schemas that predate the `found_in` convention
- **FR-009**: For `found_in: "query"` parameters, the schema key MUST be used as the Elasticsearch query string parameter name (snake_case), and the CLI flag MUST be auto-derived from it via kebab-case conversion

### Key Entities

- **Unified Parameter Schema**: A Zod object schema where every top-level field represents a single API parameter regardless of transport location; fields carry `found_in` metadata
- **Parameter Routing Metadata**: The `found_in` value attached to each schema field via Zod's `.meta(...)`, determining where the parameter is placed in the outgoing HTTP request
- **Namespace Module**: A namespace-specific module within `@elastic/zod` (e.g., `@elastic/zod/indices`) that exports Zod schemas for all operations in that API namespace
- **Local Definition Manifest**: A CLI-side definition that provides endpoint metadata (HTTP method, path template, responseType, name, namespace, description) for each API command; the Zod schema is sourced externally or defined locally, and paired with this manifest at registration time

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing CLI commands continue to pass their tests after the schema-handling layer is updated to support `found_in` metadata and hand-authored commands are migrated
- **SC-002**: A command generated from an `@elastic/zod` schema with path, query, and body parameters produces outbound HTTP requests with each parameter in the correct location, validated by integration tests covering at least 3 distinct routing combinations
- **SC-003**: Command registration time (from import to CLI-ready) does not increase by more than 10% compared to the baseline when consuming schemas from `@elastic/zod`
- ~~**SC-004**: Help output for a generated command correctly labels each parameter's routing location, verifiable without executing an actual API request~~ *(removed -- FR-006 was removed; routing metadata is not exposed in help output)*
- **SC-005**: After migration, no references to the old `pathParams[]`, `queryParams[]`, or separate `body` field structure remain in API definitions

## Assumptions

- The URL template for each generated command is provided by the CLI-local definition manifest, not derived from the schema itself
- `@elastic/zod` exports only Zod schemas (no endpoint metadata); the CLI pairs each schema with a local definition manifest at registration time
- The local definition manifest (endpoint metadata per command) is produced by an external code generator; building this generator is out of scope for the CLI project, but the CLI defines and validates the manifest contract
- The `@elastic/zod` library exports Zod v4-compatible schemas; no version bridging is required
- Schemas from `@elastic/zod` use the same Zod object shape convention (`z.object({ ... })`) as current hand-authored schemas
- The `found_in` metadata key name is stable and agreed upon with the code generator team
- Body parameters from the unified schema continue to be submitted as a single JSON object (not individual form fields or multi-part)
- The external library is a peer/optional dependency; the CLI operates without it if not installed, but commands requiring those schemas become unavailable
