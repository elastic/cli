# Tasks: External Zod Schema Integration

**Input**: Design documents from `/specs/007-external-zod-schema-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included per Constitution V (Test-First Development — NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

US1 = Run Any ES API Command (parameter routing via `found_in`)
US2 = Consume Schemas from External `@elastic/zod` Library
US3 = ~~Inspect Parameter Routing via Help Text~~ *(removed — violates Constitution Principle VIII)*
US4 = Migrate Existing Hand-Authored Commands

## Phase 1: Setup

**Purpose**: No new project setup required — this is a refactor of an existing codebase. This phase captures preparatory tasks.

- [X] T001 Verify existing test suite passes (`npm test` exits 0) before any changes

---

## Phase 2: Foundational — `found_in` Metadata Extraction

**Purpose**: Extend `SchemaArgDefinition` with `foundIn` and add the `extractFoundIn` helper. This is the core primitive that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests

- [X] T002 [P] Add test for `extractFoundIn` returning `"path"` when `.meta({found_in: "path"})` is outermost in `test/lib/schema-args.test.ts`
- [X] T003 [P] Add test for `extractFoundIn` returning `"query"` when `.meta()` is inside `.optional()` wrapper (defensive traversal) in `test/lib/schema-args.test.ts`
- [X] T004 [P] Add test for `extractFoundIn` returning `undefined` when no `.meta()` is present in `test/lib/schema-args.test.ts`
- [X] T005 [P] Add test for `extractSchemaArgs` populating `foundIn` field on each `SchemaArgDefinition` in `test/lib/schema-args.test.ts`
- [X] T006 [P] Add test for `extractSchemaArgs` defaulting `foundIn` to `undefined` when `.meta()` is absent in `test/lib/schema-args.test.ts`

### Implementation

- [X] T007 Add `foundIn` optional field (`"path" | "query" | "body" | undefined`) to `SchemaArgDefinition` interface in `src/lib/schema-args.ts`
- [X] T008 Implement `extractFoundIn(field: z.ZodType)` helper in `src/lib/schema-args.ts` — reads `.meta()` from outermost type first, then walks wrapper chain defensively
- [X] T009 Update `extractSchemaArgs` to call `extractFoundIn` for each field and populate `foundIn` on the returned `SchemaArgDefinition` in `src/lib/schema-args.ts`
- [X] T010 Export `extractFoundIn` and the `FoundIn` type from `src/lib/schema-args.ts`
- [X] T011 Verify all new and existing tests pass in `test/lib/schema-args.test.ts`

**Checkpoint**: `SchemaArgDefinition` now carries `foundIn` metadata. All existing tests still pass.

---

## Phase 3: US1 — Run Any ES API Command (Priority: P1) 🎯 MVP

**Goal**: Refactor `EsApiDefinition`, registration, and request builder so that parameter routing is driven entirely by `found_in` metadata from the unified schema.

**Independent Test**: Create a test definition with a unified schema containing path, query, and body params with `.meta({found_in: ...})`; register and invoke it; verify the outbound `TransportRequestParams` places each parameter correctly.

### Tests for US1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Add test for simplified `EsApiDefinition` validation: valid definition with `input` schema passes in `test/es/types.test.ts`
- [X] T013 [P] [US1] Add test for `validateApiDefinition` rejecting a definition where `{param}` token in path has no `found_in: "path"` field in `test/es/types.test.ts`
- [X] T014 [P] [US1] Add test for `validateApiDefinition` rejecting a definition where a required `found_in: "path"` field has no matching `{param}` in path in `test/es/types.test.ts`
- [X] T015 [P] [US1] Add test for `buildRequestParams` routing a `found_in: "path"` param into the URL path in `test/es/request-builder.test.ts`
- [X] T016 [P] [US1] Add test for `buildRequestParams` routing a `found_in: "query"` param into the querystring using the schema key (snake_case) in `test/es/request-builder.test.ts`
- [X] T017 [P] [US1] Add test for `buildRequestParams` routing a `found_in: "body"` param into the request body in `test/es/request-builder.test.ts`
- [X] T018 [P] [US1] Add test for `buildRequestParams` with mixed path + query + body params in a single schema in `test/es/request-builder.test.ts`
- [X] T019 [P] [US1] Add test for `buildRequestParams` defaulting params without `found_in` to body in `test/es/request-builder.test.ts`
- [X] T020 [P] [US1] Add test for `buildRequestParams` stripping optional absent path params from URL in `test/es/request-builder.test.ts`
- [X] T021 [P] [US1] Add test for command registration with a unified schema (flags, help text, validation all work) in `test/es/register.test.ts`

### Implementation for US1

- [X] T022 [US1] Simplify `EsApiDefinition` interface in `src/es/types.ts`: remove `pathParams`, `queryParams`, `body` fields; add optional `input: z.ZodObject<z.ZodRawShape>` field
- [X] T023 [US1] Remove `EsPathParam` and `EsQueryParam` interfaces from `src/es/types.ts`
- [X] T024 [US1] Update `validateApiDefinition` in `src/es/types.ts`: extract `found_in` metadata from schema fields to validate path template consistency (every `{param}` ↔ `found_in: "path"`)
- [X] T025 [US1] Refactor `buildRequestParams` in `src/es/request-builder.ts` to accept `SchemaArgDefinition[]` and route by `foundIn` instead of reading `def.pathParams`/`def.queryParams`/`def.body`
- [X] T026 [US1] Refactor `interpolatePath` in `src/es/request-builder.ts` to iterate `SchemaArgDefinition[]` filtered by `foundIn === "path"`
- [X] T027 [US1] Refactor `buildQuerystring` in `src/es/request-builder.ts` to iterate `SchemaArgDefinition[]` filtered by `foundIn === "query"`, using `schemaKey` as the ES query param name
- [X] T028 [US1] Refactor `collectBody` in `src/es/request-builder.ts` to iterate `SchemaArgDefinition[]` filtered by `foundIn === "body"` (or `foundIn === undefined`)
- [X] T029 [US1] Remove `buildCommandSchema`, `pathParamToZod`, and `queryParamToZod` from `src/es/register.ts`; pass `def.input` directly to `defineCommand` as the `input` schema
- [X] T030 [US1] Update `registerEsCommands` in `src/es/register.ts` to extract `SchemaArgDefinition[]` from the definition's `input` schema and pass it to `createEsHandler` (or store it for the request builder)
- [X] T031 [US1] Update `createEsHandler` in `src/es/handler.ts` to pass `SchemaArgDefinition[]` to `buildRequestParams`
- [X] T032 [US1] Update `EsHandlerDeps` interface in `src/es/handler.ts` to match new `buildRequestParams` signature
- [X] T033 [US1] Verify all US1 tests pass and no regressions in existing tests

**Checkpoint**: The routing infrastructure now works entirely via `found_in` metadata. Any command with a unified schema and `found_in` annotations will route correctly.

---

## Phase 4: US4 — Migrate Existing Hand-Authored Commands (Priority: P1)

**Goal**: Convert all existing `cat.ts` and `indices.ts` definitions from the old `pathParams`/`queryParams`/`body` structure to unified schemas with `.meta({found_in: ...})`.

**Independent Test**: Run the full existing test suite after migration; all tests pass with identical behavior.

### Tests for US4

- [X] T034 [US4] Verify existing `test/es/types.test.ts` tests still pass (or update them for new `EsApiDefinition` shape)
- [X] T035 [US4] Verify existing `test/es/register.test.ts` tests still pass (or update to use unified schemas)
- [X] T036 [US4] Verify existing `test/es/request-builder.test.ts` tests still pass (or update for new signature)
- [X] T037 [US4] Verify existing `test/es/handler.test.ts` tests still pass (or update for new definition shape)

### Implementation for US4

- [X] T038 [P] [US4] Migrate `src/es/apis/cat.ts`: convert `catCommon` shared query params to shared Zod field objects with `.meta({found_in: "query"})`; convert all `catApis` definitions to unified schemas with `.meta({found_in: ...})`; use `z.looseObject()` where needed
- [X] T039 [P] [US4] Migrate `src/es/apis/indices.ts`: convert shared param helpers (`withIndex`, `masterTimeout`, etc.) to Zod field objects; convert all `indicesApis` definitions to unified schemas; apply `.meta({found_in: ...})` to all fields including existing body schemas
- [X] T040 [US4] Update barrel `src/es/apis/index.ts` if needed
- [X] T041 [US4] Remove all residual references to old `EsPathParam`, `EsQueryParam` types across the codebase
- [X] T042 [US4] Run full test suite (`npm test`); confirm zero failures and identical behavior

**Checkpoint**: All hand-authored commands use unified schemas. No references to `pathParams[]`, `queryParams[]`, or separate `body` field remain.

---

## Phase 5: US2 — Consume Schemas from External `@elastic/zod` (Priority: P1)

**Goal**: Verify that externally defined Zod schemas (simulating `@elastic/zod`) work seamlessly with the refactored registration and routing infrastructure.

**Independent Test**: Create a test that imports a schema defined in a separate module (simulating `@elastic/zod/indices`), pairs it with a local definition manifest, registers the command, and verifies flag registration + request routing.

### Tests for US2

- [X] T043 [P] [US2] Add test in `test/es/register.test.ts` that defines a schema in a separate object (simulating external import), pairs it with a manifest, and verifies command registration succeeds
- [X] T044 [P] [US2] Add test in `test/es/request-builder.test.ts` verifying an externally defined schema with `found_in` metadata routes correctly

### Implementation for US2

- [X] T045 [US2] Verify that `EsApiDefinition` contract (per `specs/007-external-zod-schema-integration/contracts/es-api-definition.md`) is fully satisfied by the current `EsApiDefinition` interface in `src/es/types.ts`
- [X] T046 [US2] Verify that `validateApiDefinition` correctly validates an externally sourced schema paired with a local manifest
- [X] T047 [US2] Run all US2 tests and confirm pass

**Checkpoint**: External schemas from `@elastic/zod` (or any conforming module) can be consumed by the CLI without modification.

---

## Phase 6: US3 — ~~Inspect Parameter Routing via Help Text~~ *(REMOVED)*

> **Rationale**: Surfacing `[path]`, `[query]`, `[body]` labels in help text or JSON
> Schema output exposes HTTP transport implementation details to CLI consumers.
> This violates Constitution Principle VIII (Transport-Layer Abstraction), which
> mandates that routing metadata remains an internal concern invisible to users.
> Phase 6 is permanently cancelled; T048–T052 will not be implemented.

~~T048~~ ~~T049~~ ~~T050~~ ~~T051~~ ~~T052~~ — all cancelled.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and documentation.

- [X] T053 Run full test suite (`npm test`) and confirm zero failures
- [X] T054 Run lint checks (`npm run lint` or equivalent) and fix any violations
- [X] T055 [P] Verify all doc comments on modified/new exported symbols are complete in `src/lib/schema-args.ts`, `src/es/types.ts`, `src/es/register.ts`, `src/es/request-builder.ts`
- [X] T056 [P] Run quickstart.md examples mentally against the implementation to confirm before/after patterns are accurate
- [X] T057 Verify no references to removed types (`EsPathParam`, `EsQueryParam`, old `pathParams`/`queryParams`/`body` fields) remain anywhere in `src/` or `test/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core routing refactor
- **US4 (Phase 4)**: Depends on Phase 3 — migrates existing commands to the new infrastructure
- **US2 (Phase 5)**: Depends on Phase 3 — verifies external schema consumption
- **US2 (Phase 5)**: Depends on Phase 3 — verifies external schema consumption
- ~~**US3 (Phase 6)**~~: Removed — see Phase 6 note above
- **Polish (Phase 7)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational (Phase 2) — must complete first (defines the routing infrastructure)
- **US4 (P1)**: Depends on US1 — cannot migrate commands until the new infrastructure exists
- **US2 (P1)**: Depends on US1 — can run in parallel with US4
- **US2 (P1)**: Depends on US1 — can run in parallel with US4

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Type/interface changes before function implementations
- Validation before routing logic
- Core implementation before integration
- Story complete before moving to dependent stories

### Parallel Opportunities

- Phase 2: T002–T006 (all test tasks) can run in parallel
- Phase 3: T012–T021 (all test tasks) can run in parallel
- Phase 4: T038 and T039 (cat.ts and indices.ts migration) can run in parallel
- Phase 5: T043 and T044 can run in parallel
- Phase 5: T043 and T044 can run in parallel
- ~~Phase 6~~: cancelled
- After US1 completes: US2 and US4 can begin (both depend on US1; they are independent of each other)

---

## Parallel Example: US1 Tests

```bash
# Launch all US1 tests together (they target different test files / test cases):
T012: test/es/types.test.ts — simplified EsApiDefinition validation
T015: test/es/request-builder.test.ts — path routing
T016: test/es/request-builder.test.ts — query routing
T017: test/es/request-builder.test.ts — body routing
T021: test/es/register.test.ts — registration with unified schema
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (verify green baseline)
2. Complete Phase 2: Foundational (`foundIn` extraction)
3. Complete Phase 3: US1 (routing infrastructure)
4. **STOP and VALIDATE**: Test US1 independently with a synthetic definition
5. Proceed to US4 (migration) to validate with real commands

### Incremental Delivery

1. Setup + Foundational → `foundIn` extraction works
2. US1 → Routing infrastructure works with test definitions (MVP!)
3. US4 → All existing commands migrated, full test suite green
4. US2 → External schema consumption verified
4. US2 → External schema consumption verified
5. ~~US3~~: cancelled (Constitution Principle VIII)
6. Polish → Final cleanup and validation
6. Polish → Final cleanup and validation

### Sequential Execution (Single Developer)

Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US4) → Phase 5 (US2) → Phase 7 (Polish)

---

## Notes

- [P] tasks target different files with no dependencies
- [Story] label maps task to specific user story for traceability
- US1 is the critical path — all other stories depend on it
- US4 migration is mechanical but must be verified per-command against existing tests
- US2 is primarily a verification/contract task — the infrastructure from US1 does the heavy lifting
- Constitution V mandates TDD — all test tasks must run and fail before corresponding implementation
- US3 is permanently removed — Constitution Principle VIII forbids exposing HTTP transport routing details (`found_in` labels) in user-facing help text or schema output
