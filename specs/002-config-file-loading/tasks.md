# Tasks: Configuration File Loading

**Input**: Design documents from `/specs/002-config-file-loading/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/config-schema.md

**Tests**: Included — Constitution Principle V (Test-First Development) requires TDD for all code changes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create directory structure and placeholder files for the config module

- [X] T001 Create config module directory structure: `src/config/` and `test/config/`
- [X] T002 [P] Create `src/config/types.ts` with Apache 2.0 header and placeholder exports
- [X] T003 [P] Create `src/config/schema.ts` with Apache 2.0 header and placeholder exports
- [X] T004 [P] Create `src/config/loader.ts` with Apache 2.0 header and placeholder exports

**Checkpoint**: Directory structure exists, `npm run build` passes with empty modules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define Zod schemas and TypeScript types that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Write failing tests for Auth discriminated union schema (apiKey and basic variants) in `test/config/schema.test.ts`
- [X] T006 Implement Auth Zod schemas (`ApiKeyAuthSchema`, `BasicAuthSchema`, `AuthSchema` discriminated union) in `src/config/schema.ts`
- [X] T007 Write failing tests for ServiceBlock schema (url + auth) in `test/config/schema.test.ts`
- [X] T008 Implement ServiceBlock Zod schema in `src/config/schema.ts`
- [X] T009 Write failing tests for Context schema (name + at least one service block from elasticsearch/kibana/cloud) in `test/config/schema.test.ts`
- [X] T010 Implement Context Zod schema with `.passthrough()` and at-least-one-service refinement in `src/config/schema.ts`
- [X] T011 Write failing tests for ConfigFile root schema (current-context + contexts map with at least one entry) in `test/config/schema.test.ts`
- [X] T012 Implement ConfigFile root Zod schema using `z.record()` for the contexts map in `src/config/schema.ts`
- [X] T013 Export inferred TypeScript types (`Auth`, `ServiceBlock`, `Context`, `ConfigFile`, `ResolvedConfig`, `ResolvedContext`) from `src/config/types.ts` using `z.infer<>`

**Checkpoint**: All schema tests pass. Zod schemas validate valid configs and reject invalid ones. Types are exported and usable.

---

## Phase 3: User Story 1 - Load configuration and resolve the active context (Priority: P1) 🎯 MVP

**Goal**: A command can discover, load, validate, and resolve a config file, passing a typed `ResolvedConfig` to the handler

**Independent Test**: Create a valid `.elasticrc.yml` in a temp directory, invoke the loader, and verify the handler receives the correct context's service blocks

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T014 P1 cosmiconfig explorer creation and config file discovery (search and load-by-path) in `test/config/loader.test.ts`
- [X] T015 P1 context resolution: given a validated config and a context name, return `ResolvedConfig` with only that context's service blocks in `test/config/loader.test.ts`
- [X] T016 P1 the full `loadConfig` pipeline (discover → validate → resolve) with default `current-context` in `test/config/loader.test.ts`
- [X] T017 P1 `--context` override: `loadConfig` with explicit context name overrides `current-context` in `test/config/loader.test.ts`
- [X] T018 P1 `--config` override: `loadConfig` with explicit file path bypasses discovery in `test/config/loader.test.ts`

### Implementation for User Story 1

- [X] T019 [US1] Implement cosmiconfig explorer factory (`createExplorer`) with ID `elastic` in `src/config/loader.ts`
- [X] T020 [US1] Implement `resolveContext` function: look up context key in validated config, return `ResolvedContext` in `src/config/loader.ts`
- [X] T021 [US1] Implement `loadConfig` pipeline function (discover/load → Zod parse → resolve context) accepting optional `configPath` and `contextName` overrides in `src/config/loader.ts`
- [X] T022 [US1] Register global `--config <path>` and `--context <name>` options on the root Commander program in `src/cli.ts`
- [X] T023 [US1] Extend `ParsedResult` interface to include optional `config: ResolvedConfig` field in `src/factory.ts`
- [X] T024 [US1] Add `preAction` hook on the root Commander program to call `loadConfig` and inject `ResolvedConfig` into `ParsedResult` in `src/cli.ts`
- [X] T025 [US1] Update existing `ping` command handler to accept and use `ResolvedConfig` (or gracefully handle its absence) in `src/cli.ts`

**Checkpoint**: Full config load pipeline works end-to-end. A command receives a typed `ResolvedConfig` with the active context's service blocks. `--config` and `--context` flags work.

---

## Phase 4: User Story 2 - Validate and reject an invalid configuration file (Priority: P1)

**Goal**: Invalid config files produce clear, actionable error messages with field paths and expected types

**Independent Test**: Provide config files with missing fields, wrong types, and invalid context references, and verify each produces a specific error message

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T026 [P] [US2] Write failing tests for missing required fields error messages (missing `current-context`, missing `contexts`) in `test/config/loader.test.ts`
- [ ] T027 [P] [US2] Write failing tests for type mismatch error messages (wrong field types) in `test/config/loader.test.ts`
- [ ] T028 [P] [US2] Write failing tests for invalid context reference (current-context or --context names a nonexistent context) in `test/config/loader.test.ts`
- [ ] T029 [P] [US2] Write failing tests for context with zero service blocks in `test/config/loader.test.ts`
- [ ] T030 [P] [US2] Write failing tests for invalid auth blocks (missing type, wrong type discriminator, missing fields per variant) in `test/config/schema.test.ts`

### Implementation for User Story 2

- [ ] T031 [US2] Implement error formatting: transform Zod validation errors into clear, actionable messages with field paths in `src/config/loader.ts`
- [ ] T032 [US2] Implement context-not-found error with message listing available context names in `src/config/loader.ts`
- [ ] T033 [US2] Ensure all validation errors exit with structured error payload (code + message) per Constitution Development Standards in `src/config/loader.ts`

**Checkpoint**: All invalid config scenarios produce clear error messages. No invalid config reaches the command handler.

---

## Phase 5: User Story 3 - Handle missing configuration gracefully (Priority: P2)

**Goal**: When no config file is found, the user sees a clear message listing searched locations and where to create one

**Independent Test**: Ensure no config file exists in any searched location, invoke the loader, and verify the error names the expected file locations

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T034 [US3] Write failing tests for missing config file: `loadConfig` with no config file in any location returns an error listing searched paths in `test/config/loader.test.ts`

### Implementation for User Story 3

- [ ] T035 [US3] Implement missing-config error handling in `loadConfig`: detect cosmiconfig returning null/undefined and produce an error message listing searched locations and suggesting where to create the file in `src/config/loader.ts`

**Checkpoint**: Running a command with no config file produces a helpful error naming searched locations.

---

## Phase 6: User Story 4 - Computed and coerced configuration values (Priority: P2)

**Goal**: The config loader coerces values to target types and computes derived values before passing to the handler

**Independent Test**: Provide a config with string-encoded numbers and verify the handler receives correctly typed values; verify the resolved context is a flat object with no reference to other contexts

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T036 [P] [US4] Write failing tests for type coercion: numeric strings coerced to numbers by Zod schema in `test/config/schema.test.ts`
- [ ] T037 [P] [US4] Write failing tests for computed context resolution: verify `ResolvedConfig.context` contains only the selected context's service blocks with no other contexts in `test/config/loader.test.ts`

### Implementation for User Story 4

- [ ] T038 [US4] Add `z.coerce` to appropriate schema fields (e.g., port numbers if added) in `src/config/schema.ts`
- [ ] T039 [US4] Verify `resolveContext` excludes unconfigured service blocks from the resolved output in `src/config/loader.ts`

**Checkpoint**: Coerced and computed values are correct. Handler receives clean, typed `ResolvedConfig` with no raw data leaking through.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge case coverage, documentation, and cleanup

- [ ] T040 [P] Write tests for edge cases: empty config file, invalid YAML syntax, unreadable file (permissions) in `test/config/loader.test.ts`
- [ ] T041 [P] Write tests for unknown/extra fields being silently ignored at all schema levels in `test/config/schema.test.ts`
- [ ] T042 Verify all exported symbols in `src/config/` have complete JSDoc comments per Constitution Development Standards
- [ ] T043 Run `npm test` and confirm all tests pass across the full suite
- [ ] T044 Run quickstart.md validation: manually verify the example config and commands from `specs/002-config-file-loading/quickstart.md` work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — core pipeline, MVP
- **US2 (Phase 4)**: Depends on Foundational — can start in parallel with US1 (schema error tests don't need loader), but loader error tests need US1's loader
- **US3 (Phase 5)**: Depends on US1 (needs loader infrastructure)
- **US4 (Phase 6)**: Depends on Foundational (schema coercion) and US1 (resolver)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational — no other story dependencies. **MVP target.**
- **US2 (P1)**: Schema validation tests can run after Foundational; loader error tests need US1's `loadConfig` function
- **US3 (P2)**: Needs US1's `loadConfig` to add the missing-file error path
- **US4 (P2)**: Schema coercion can start after Foundational; resolver tests need US1's `resolveContext`

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution V)
- Schema tasks before loader tasks
- Loader tasks before CLI integration tasks
- Core implementation before integration with factory/CLI

### Parallel Opportunities

- T002, T003, T004 can run in parallel (different files)
- US2 test tasks T026–T030 can all run in parallel (different test cases, same file but independent)
- US4 test tasks T036–T037 can run in parallel
- T040, T041 can run in parallel (different test files)

---

## Parallel Example: User Story 1

```text
# After Foundational phase completes, launch US1 tests in sequence:
T014: Test config discovery in test/config/loader.test.ts
T015: Test context resolution in test/config/loader.test.ts
T016: Test full loadConfig pipeline in test/config/loader.test.ts
T017: Test --context override in test/config/loader.test.ts
T018: Test --config override in test/config/loader.test.ts

# Then implement (some parallelizable across files):
T019: cosmiconfig explorer in src/config/loader.ts
T020: resolveContext in src/config/loader.ts
T021: loadConfig pipeline in src/config/loader.ts
T022: Global CLI flags in src/cli.ts (different file, can parallel with T019-T021)
T023: Extend ParsedResult in src/factory.ts (different file, can parallel)
T024: preAction hook in src/cli.ts (depends on T021, T022, T023)
T025: Update ping command in src/cli.ts (depends on T024)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (schemas + types)
3. Complete Phase 3: User Story 1 (load + resolve + CLI integration)
4. **STOP and VALIDATE**: Test US1 independently — a command receives typed config
5. This is a usable MVP: config loading works for the happy path

### Incremental Delivery

1. Setup + Foundational → Schemas and types ready
2. Add US1 → Test independently → **MVP: Config loads and resolves** ✅
3. Add US2 → Test independently → **Validation errors are clear** ✅
4. Add US3 → Test independently → **Missing config handled** ✅
5. Add US4 → Test independently → **Coercion and computed values correct** ✅
6. Polish → Edge cases, docs, final validation
7. Each story adds robustness without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- TDD is mandatory per Constitution Principle V: write failing tests first
- All files must have Apache 2.0 SPDX header comment
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
