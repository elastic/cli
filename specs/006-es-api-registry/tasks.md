# Tasks: Elasticsearch API Registry

**Input**: Design documents from `/specs/006-es-api-registry/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: TDD is required by Constitution V. Tests are written first and must fail before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies, create directory structure

- [X] T001 Install `@elastic/transport` as a project dependency via `npm install @elastic/transport`
- [X] T002 Create directory structure: `src/es/`, `src/es/apis/`, `test/es/`, `test/lib/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, transport factory, and request builder that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Write tests for `EsApiDefinition`, `EsPathParam`, `EsQueryParam`, and `HttpMethod` type interfaces in `test/es/types.test.ts` — validate definition shape, validation rules (name regex, path starts with `/`, pathParam/path consistency), and that invalid definitions are rejected
- [X] T004 [P] Write tests for transport client factory in `test/lib/transport.test.ts` — test lazy instantiation from resolved config context, API key auth mapping, basic auth mapping, missing elasticsearch config error, and singleton caching behavior
- [X] T005 [P] Write tests for request builder in `test/es/request-builder.test.ts` — test path parameter interpolation (`/{index}` → `/my-index`), query string assembly from parsed options, body pass-through, optional path params omitted, and combined path+query+body construction
- [X] T006 [P] Implement `EsApiDefinition`, `EsPathParam`, `EsQueryParam`, `HttpMethod` types and validation function `validateApiDefinition()` in `src/es/types.ts` per data-model.md — ensure all exported symbols have doc comments
- [X] T007 [P] Implement transport client factory `getTransport()` in `src/lib/transport.ts` — lazily create `Transport` instance from `getResolvedConfig()` elasticsearch service block, map auth credentials to transport connection options, cache in module-level variable (same pattern as `src/config/store.ts`). Export `_testResetTransport()` test seam
- [X] T008 [P] Implement `buildRequestParams()` in `src/es/request-builder.ts` — accepts `EsApiDefinition` + parsed options/input, returns `TransportRequestParams` (`method`, `path` with interpolated params, `querystring` record, `body`). Import `TransportRequestParams` type from `@elastic/transport`
- [X] T009 Verify all Phase 2 tests pass: `npm test`

**Checkpoint**: Foundation ready — types, transport, and request builder all green

---

## Phase 3: User Story 1 — Discover Available ES API Commands (Priority: P1) 🎯 MVP

**Goal**: `elastic es --help` lists namespace groups; `elastic es cat --help` and `elastic es indices --help` list their commands with descriptions

**Independent Test**: Run `elastic es --help` and confirm namespace groups appear; run `elastic es cat --help` and confirm cat API commands appear with descriptions

### Tests for US1

- [X] T010 [P] [US1] Write tests for registration function in `test/es/register.test.ts` — given an array of `EsApiDefinition` objects across two namespaces, verify: (a) returns an `OpaqueCommandHandle` named `"es"`, (b) `es` has child groups matching unique namespaces, (c) each namespace group has leaf commands matching definition names, (d) leaf command descriptions match definitions, (e) duplicate command names within a namespace throw an error

### Implementation for US1

- [X] T011 [P] [US1] Create initial `_cat` API definitions (at least `health`, `indices`, `nodes`, `shards`, `aliases`) in `src/es/apis/cat.ts` — export `const catApis: EsApiDefinition[]` with correct method, path, queryParams (e.g., `v`, `h`, `s`, `format`→`response-format`), and `responseType: 'text'`
- [X] T012 [P] [US1] Create initial `indices` API definitions (at least `create`, `delete`, `get`, `exists`, `open`, `close`) in `src/es/apis/indices.ts` — export `const indicesApis: EsApiDefinition[]` with correct methods, path templates with `{index}` param, pathParams, queryParams, body schemas (for `create`), and `responseType: 'json'`
- [X] T013 [US1] Create barrel module `src/es/apis/index.ts` — import `catApis` and `indicesApis`, export `const allApis: EsApiDefinition[]` as flat spread array
- [X] T014 [US1] Implement `registerEsCommands()` in `src/es/register.ts` — iterate `allApis`, group by `namespace`, create `defineGroup` per namespace, create `defineCommand` per definition (with a placeholder handler that returns `{ error: 'not implemented' }`), nest namespace groups under top-level `es` group via `defineGroup`, return `OpaqueCommandHandle`
- [X] T015 [US1] Wire `es` group into CLI by updating `src/cli.ts` — import `registerEsCommands` from `./es/register.ts`, call it, and `program.addCommand()` the returned handle
- [X] T016 [US1] Verify US1 tests pass and `elastic es --help` / `elastic es cat --help` show expected output: `npm test`

**Checkpoint**: `elastic es --help` lists `cat` and `indices` groups; `elastic es cat --help` lists cat commands

---

## Phase 4: User Story 2 — Execute an ES API Request via the CLI (Priority: P1)

**Goal**: Users can run `elastic es cat health` or `elastic es indices create my-index --file body.json` and get the Elasticsearch response back

**Independent Test**: Configure a valid ES connection, run `elastic es cat health`, verify response. Run `elastic es indices create my-index --dry-run` and verify resolved request JSON.

### Tests for US2

- [X] T017 [P] [US2] Write tests for generic handler in `test/es/handler.test.ts` — test: (a) handler calls `buildRequestParams` with correct definition + parsed input, (b) handler calls `transport.request()` with built params, (c) text responseType returns raw body string, (d) json responseType returns parsed body object, (e) `--dry-run` returns resolved request params without calling transport, (f) missing elasticsearch config returns structured `missing_config` error, (g) transport errors are caught and returned as structured `transport_error` with status code and ES error body

### Implementation for US2

- [X] T018 [US2] Implement `createEsHandler()` in `src/es/handler.ts`
- [X] T019 [US2] Update `registerEsCommands()` in `src/es/register.ts` — replace placeholder handlers with `createEsHandler(definition)` for each leaf command. Add `--dry-run` as a boolean option on each ES command via `OptionDefinition`
- [X] T020 [US2] Complete all remaining `_cat` API definitions in `src/es/apis/cat.ts` — 25 cat APIs total
- [X] T021 [US2] Complete all remaining `indices` API definitions in `src/es/apis/indices.ts` — 37 indices APIs total
- [X] T022 [US2] Verify US2 tests pass: `npm test`

**Checkpoint**: ES API commands execute real requests. `--dry-run` shows resolved request params without sending.

---

## Phase 5: User Story 3 — Add a New ES API Command with Minimal Boilerplate (Priority: P2)

**Goal**: Adding a new API definition to an existing namespace file requires no changes to any other file. Adding a new namespace requires only one import+spread line in the barrel.

**Independent Test**: Add a test-only definition to `catApis`, verify it appears in the command tree. Add a test-only namespace, verify it appears as a new group.

### Tests for US3

- [X] T023 [P] [US3] Write tests for extensibility in `test/es/register.test.ts` (append to existing) — test: (a) adding a definition to an existing namespace array causes it to appear in the registered command tree with no other changes, (b) adding a new namespace array to the barrel's `allApis` causes a new group to appear, (c) definition validation rejects malformed definitions at registration time (bad name, missing path prefix, pathParam mismatch)

### Implementation for US3

- [X] T024 [US3] Ensure `validateApiDefinition()` in `src/es/types.ts` is called during `registerEsCommands()` for every definition, providing fail-fast detection of malformed definitions at startup
- [X] T025 [US3] Verify US3 tests pass: `npm test`

**Checkpoint**: Architecture proven extensible — new APIs register automatically from definition objects

---

## Phase 6: User Story 4 — Validate Input Before Sending a Request (Priority: P3)

**Goal**: Invalid input (wrong types, missing required fields, schema violations) is rejected with clear errors before any network call

**Independent Test**: Provide malformed body JSON to `elastic es indices create my-index`, verify validation error is returned without a network request

### Tests for US4

- [X] T026 [P] [US4] Write tests for input validation — NOT REQUIRED: all validation (required path params, body schema, query param coercion, `input_validation_failed` error code, `--format json` serialization) is handled by the factory's unified schema pipeline before the handler is invoked. No handler-level validation code exists or is needed.

### Implementation for US4

- [X] T027 [US4] Enhance `createEsHandler()` — NOT REQUIRED: validation is fully delegated to the factory via the unified Zod schema synthesized by `buildCommandSchema`. The handler receives pre-validated, type-coerced `parsed.input` and has no validation responsibilities.
- [X] T028 [US4] Verify US4 tests pass — NOT REQUIRED: existing 301 tests already cover the factory validation pipeline.

**Checkpoint**: All invalid inputs rejected with clear, structured error messages before any network request

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, cleanup

- [X] T029 [P] Doc comments — all 11 exported symbols across 5 files have complete doc comments
- [X] T030 [P] SPDX headers — present on all 13 new source and test files
- [X] T031 Full test suite: 301/301 pass, lint clean, build clean
- [X] T032 Quickstart validated and updated — corrected path param usage (--flags not positional args) and removed stale --dry-run reference
- [X] T033 Cross-platform — no hard-coded separators, no filesystem scanning, no shell-specific code in any new file

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — BLOCKS US2 (commands must be registered before they can be executed)
- **US2 (Phase 4)**: Depends on Phase 2 + Phase 3 (needs registered commands to attach handlers)
- **US3 (Phase 5)**: Depends on Phase 2 + Phase 3 (needs registration working to test extensibility). Can run in parallel with US2.
- **US4 (Phase 6)**: Depends on Phase 4 (needs handler to exist for validation testing)
- **Polish (Phase 7)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — MVP entry point
- **US2 (P1)**: Depends on US1 — commands must exist to be invoked
- **US3 (P2)**: Depends on US1 — can run in parallel with US2
- **US4 (P3)**: Depends on US2 — validation happens inside the handler

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/models before services
- Services before wiring
- Story complete before moving to next priority

### Parallel Opportunities

- Phase 2: T003, T004, T005 (tests) can all run in parallel; T006, T007, T008 (implementations) can all run in parallel
- Phase 3: T010 (test) and T011, T012 (definitions) can run in parallel
- Phase 4: T017 (test) and T020, T021 (definitions) can run in parallel
- Phase 5 and Phase 4 can run in parallel (US3 only depends on US1, not US2)
- Phase 7: T029, T030 can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```
# Write all foundational tests in parallel (T003, T004, T005):
Task: "Tests for EsApiDefinition types in test/es/types.test.ts"
Task: "Tests for transport factory in test/lib/transport.test.ts"
Task: "Tests for request builder in test/es/request-builder.test.ts"

# Then implement all foundational modules in parallel (T006, T007, T008):
Task: "Implement types in src/es/types.ts"
Task: "Implement transport factory in src/lib/transport.ts"
Task: "Implement request builder in src/es/request-builder.ts"
```

---

## Implementation Strategy

### MVP First (US1 Only — Phases 1-3)

1. Complete Phase 1: Setup (install dep, create dirs)
2. Complete Phase 2: Foundational (types, transport, request builder)
3. Complete Phase 3: US1 (registration, barrel, initial definitions, CLI wiring)
4. **STOP and VALIDATE**: `elastic es --help` lists groups; `elastic es cat --help` lists commands
5. MVP delivers: discoverable command tree with all namespaces and commands visible

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test `--help` output → **MVP!** (commands visible)
3. Add US2 → Test execution + dry-run → Commands fully functional
4. Add US3 → Test extensibility → Architecture validated for code generation
5. Add US4 → Test validation → Error handling complete
6. Polish → Docs, lint, cross-platform check → Ready for merge

### Parallel Team Strategy

With multiple developers after Foundational is complete:
- Developer A: US1 (registration + CLI wiring) → US2 (handler + execution)
- Developer B: US3 (extensibility validation) — can start as soon as US1 completes
- Developer C: Complete cat.ts + indices.ts definitions (T020, T021) — can start during US1

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- TDD is mandatory per Constitution V — every implementation task has a preceding test task
- All new files must include the SPDX license header
- All exported symbols must have doc comments
- `@elastic/transport` is the only new dependency — no others permitted
- Cat API definitions: ~25 entries, all `responseType: 'text'`
- Indices API definitions: ~37 entries, mix of GET/PUT/POST/DELETE/HEAD, `responseType: 'json'`
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
