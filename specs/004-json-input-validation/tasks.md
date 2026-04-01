# Tasks: JSON Input Schema Validation

**Input**: Design documents from `/specs/004-json-input-validation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required per Constitution Principle V (Test-First Development). All tests follow red/green TDD: write a failing test, then implement.

**Organization**: Tasks are grouped by user story. All source changes are in `src/factory.ts` and `test/factory.test.ts`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new files or dependencies needed. Verify baseline.

- [x] T001 Run existing test suite to confirm green baseline (`npm test`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type system changes that all user stories depend on. These modify the core interfaces that the rest of the feature builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 Write test: `defineCommand` accepts a Zod schema as `input` without throwing in `test/factory.test.ts`
- [x] T003 Update `CommandConfig.input` type — remove `boolean`, add generic type parameter `T extends z.ZodType` so `input` accepts only a Zod schema or `undefined`; handler receives `ParsedResult<z.infer<T>>`
- [x] T004 Update `ParsedResult` interface to accept a generic type parameter `T = unknown`; `input` field carries `T` when a schema is provided, `undefined` when not
- [x] T005 Update `defineCommand` to use `instanceof z.ZodType` for all `input` checks (collision guard, `--file` registration, input-reading block)
- [x] T006 Verify all existing tests still pass (`npm test`) — no regressions from type changes

**Checkpoint**: Foundation ready — `defineCommand` accepts schemas, types compile, existing behavior unchanged.

---

## Phase 3: User Story 1 — Command author defines an input schema (Priority: P1) 🎯 MVP

**Goal**: Command authors can pass a Zod schema as `input` in `CommandConfig`. Invalid values are rejected at definition time.

**Independent Test**: Define a command with `input` set to a Zod schema and confirm it registers successfully. Define a command with an invalid `input` value and confirm it throws.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [US1] Write test: `defineCommand` with `input: z.object(...)` registers `--file` option in `test/factory.test.ts`
- [x] T009 [US1] Write test: `defineCommand` throws when `input` is an invalid value (plain object, string, number) in `test/factory.test.ts`
- [x] T010 [US1] Write test: `defineCommand` throws when `input` is a schema and `options` contains `long: 'file'` (collision check) in `test/factory.test.ts`

### Implementation for User Story 1

- [x] T011 [US1] Add `validateInput` function in `src/factory.ts` — validates that `input` is `undefined` or `instanceof z.ZodType`; throws descriptive error for invalid values (e.g., `command "search": input must be a Zod schema`)
- [x] T012 [US1] Call `validateInput` in `defineCommand` before option registration in `src/factory.ts`
- [x] T013 [US1] Verify the `--file` collision check triggers for `config.input instanceof z.ZodType` in `src/factory.ts`

**Checkpoint**: Commands can be defined with schemas. Invalid configs are caught at definition time. All US1 tests green.

---

## Phase 4: User Story 2 — Valid JSON input passes pre-flight validation (Priority: P1)

**Goal**: When valid JSON is provided to a schema-enabled command, the handler receives the Zod-parsed, strongly-typed output.

**Independent Test**: Run a command with a Zod schema and provide valid JSON via stdin/`--file`. Verify the handler receives the typed, validated object (including defaults and transformations applied by Zod).

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [US2] Write test: handler receives Zod-parsed input when valid JSON is provided via `--file` in `test/factory.test.ts`
- [x] T015 [US2] Write test: handler receives Zod-parsed input when valid JSON is piped via stdin in `test/factory.test.ts`
- [x] T016 [US2] Write test: Zod transformations are applied (e.g., default values fill in missing optional fields) in `test/factory.test.ts`
- [x] T017 [US2] Write test: extra properties in JSON are stripped (Zod default behavior) in `test/factory.test.ts`
- [x] T018 [US2] Write test: when schema is configured but no input is provided (no `--file`, TTY stdin), handler receives `undefined` for `input` in `test/factory.test.ts`

### Implementation for User Story 2

- [x] T019 [US2] Add schema validation step in `defineCommand` action callback in `src/factory.ts` — after `parseJsonContent` succeeds, if `config.input instanceof z.ZodType`, call `schema.safeParse(inputValue)` and assign `result.data` to `inputValue` on success
- [x] T020 [US2] Ensure the validation step is skipped when `inputValue` is `undefined` (no data provided) in `src/factory.ts`

**Checkpoint**: Valid JSON flows through schema validation with typed output. Defaults and transformations apply. No-input case is handled. All US2 tests green.

---

## Phase 5: User Story 3 — Invalid JSON input fails with informative error (Priority: P1)

**Goal**: When invalid JSON is provided to a schema-enabled command, a clear error is printed with all field-level issues, the handler is NOT invoked, and the process exits non-zero.

**Independent Test**: Provide invalid JSON to a schema-enabled command. Verify error output contains field paths and descriptions, handler was not called, and exit code is non-zero.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T021 [US3] Write test: type mismatch error includes field path and expected type in `test/factory.test.ts`
- [x] T022 [US3] Write test: missing required field error identifies the field name in `test/factory.test.ts`
- [x] T023 [US3] Write test: multiple validation errors are all reported (not just the first) in `test/factory.test.ts`
- [x] T024 [US3] Write test: handler is NOT invoked when validation fails in `test/factory.test.ts`
- [x] T025 [US3] Write test: nested schema validation errors include full path (e.g., `address.zipCode`) in `test/factory.test.ts`

### Implementation for User Story 3

- [x] T026 [US3] Add error handling branch in the `safeParse` step in `src/factory.ts` — when `result.success === false`, call `cmd.error()` with `z.prettifyError(result.error)` prefixed by `input validation failed:\n`
- [x] T027 [US3] Verify `cmd.error()` prevents handler execution (Commander exits before `await config.handler(parsed)`) in `src/factory.ts` — confirmed inherent behavior; T024 proves it

**Checkpoint**: Invalid input produces clear, multi-field error messages. Handler never runs on failure. All US3 tests green.

---

## Phase 6: User Story 4 — Commands without input schemas reject JSON input (Priority: P2)

**Goal**: Commands with no `input` configuration do not accept `--file` or read stdin. This is existing behavior — verify it still holds after all changes.

**Independent Test**: Run a command without `input` configured. Verify `--file` is not recognized and stdin data is ignored.

### Tests for User Story 4

- [x] T028 [US4] Write test: command with no `input` does not register `--file` option — covered by existing `'does NOT register --file option when input is omitted'` test
- [x] T029 [US4] Write test: command with `input: false` — throws at definition time (correct post-refactor behavior; `false` is not a valid `ZodType`)

### Implementation for User Story 4

- [x] T030 [US4] Verified: no implementation changes needed; `validateInput` already rejects `false`; existing no-input path unchanged; all US4 tests green

**Checkpoint**: Commands without input reject `--file` and ignore stdin. All US4 tests green.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error formatting for JSON mode, documentation, and final validation.

- [x] T031 Write test: `--format=json` validation failure emits `{"error": {"code": "input_validation_failed", "message": "...", "issues": [...]}}` to stdout — 4 tests in `'JSON format error output'` describe block
- [x] T032 Implement JSON error output: walk cmd tree to root, check `opts().format === 'json'`, emit `JSON.stringify({error:{code,message,issues}})` to stdout, throw to prevent handler
- [x] T033 JSDoc updated on `ParsedResult<T>`, `CommandConfig<T>`, and `defineCommand` — all reflect schema-aware lifecycle
- [x] T034 `npm test`: 193/193 pass; `eslint .`: zero issues
- [x] T035 quickstart.md validated — removed stale `input: true` migration section; replaced with `'Typing the handler with a schema'`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2
- **US2 (Phase 4)**: Depends on Phase 3 (needs schema acceptance before validation can be added)
- **US3 (Phase 5)**: Depends on Phase 4 (needs validation step before error handling can be added)
- **US4 (Phase 6)**: Depends on Phase 2 only (independent of US1–US3)
- **Polish (Phase 7)**: Depends on US1–US3 completion

### User Story Dependencies

- **US1 (P1)**: Foundational only — can start first after Phase 2
- **US2 (P1)**: Depends on US1 (schema must be accepted before it can be used for validation)
- **US3 (P1)**: Depends on US2 (validation must exist before error handling can be tested)
- **US4 (P2)**: Independent of US1–US3 — can run in parallel with any user story after Phase 2

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle V)
- Implementation follows test order
- Story complete when all story tests are green

### Parallel Opportunities

- **US4 can run in parallel** with US1/US2/US3 (different concerns, mostly test-only)
- **Within US1**: T007–T010 tests can be written in parallel (all in same file but independent test cases)
- **Within US2**: T014–T018 tests can be written in parallel
- **Within US3**: T021–T025 tests can be written in parallel
- **Phase 7**: T031 and T033 can run in parallel

---

## Parallel Example: User Story 3

```text
# Write all US3 tests in parallel:
T021: type mismatch error test
T022: missing field error test
T023: multiple errors test
T024: handler not invoked test
T025: nested path test

# Then implement sequentially:
T026: error handling branch (makes T021–T025 pass)
T027: verify cmd.error() blocks handler
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T006)
3. Complete Phase 3: US1 (T007–T013)
4. **STOP and VALIDATE**: `defineCommand` accepts schemas, rejects invalid configs
5. This is a meaningful increment even without validation — schemas are declared

### Incremental Delivery

1. Setup + Foundational → Types compile, existing behavior preserved
2. Add US1 → Commands can declare schemas (MVP!)
3. Add US2 → Valid input is validated and typed
4. Add US3 → Invalid input gets clear errors — **core feature complete**
5. Add US4 → Regression verification for no-input commands
6. Polish → JSON error format, docs, final validation

### Sequential Execution (recommended for single developer)

All work is in two files (`src/factory.ts` + `test/factory.test.ts`), so sequential execution through T001→T035 is the natural workflow. The TDD cycle within each story provides continuous feedback.

---

## Notes

- All changes are in `src/factory.ts` (implementation) and `test/factory.test.ts` (tests)
- No new files, no new dependencies
- `input` accepts only a Zod schema or `undefined`; the `boolean` form has been removed
- `--format=json` support (T031–T032) depends on whether the global format flag already exists; if not, those tasks may need to create it or defer to a separate feature
- Each story checkpoint: run `npm test` to verify green
