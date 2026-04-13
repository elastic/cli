# Tasks: JSON Input Support

**Input**: Design documents from `/specs/003-json-input-support/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required per Constitution Principle V (Test-First Development, NON-NEGOTIABLE). All tasks follow red/green TDD cycle.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Interface Changes)

**Purpose**: Extend `CommandConfig` and `ParsedResult` interfaces — all user stories depend on these changes.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Add `input?: boolean` field to `CommandConfig` interface in `src/factory.ts`
- [x] T002 Add `input?: unknown` field to `ParsedResult` interface in `src/factory.ts`

**Checkpoint**: Interfaces updated. Existing tests must still pass (`npm test`). No behavioral changes yet.

---

## Phase 2: User Story 3 - Factory Automatically Wires JSON Input (Priority: P1) 🎯 MVP

**Goal**: When `input: true` is set in `CommandConfig`, the factory automatically registers `--file <path>` and validates against option name collisions. This is the foundation that US1 and US2 build upon.

**Independent Test**: Define a command with `input: true` and verify `--file` appears in help output; define one with `input: false` and verify it does not.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T003 [US3] Test that `defineCommand` with `input: true` adds `--file <path>` option to the command in `test/factory.test.ts`
- [x] T004 [US3] Test that `defineCommand` with `input: false` (or omitted) does NOT add `--file` option in `test/factory.test.ts`
- [x] T005 [US3] Test that `defineCommand` with `input: true` throws at definition time if `options` contains an entry with `long === 'file'` in `test/factory.test.ts`

### Implementation for User Story 3

- [x] T006 [US3] Add `--file` collision detection in `defineCommand` when `config.input === true` in `src/factory.ts`
- [x] T007 [US3] Register `--file <path>` string option via Commander.js when `config.input === true` in `src/factory.ts`

**Checkpoint**: Commands with `input: true` show `--file` in help. Collision detection works. No file/stdin reading yet.

---

## Phase 3: User Story 1 - JSON Input via File Argument (Priority: P1)

**Goal**: When `--file path/to/file.json` is provided, the factory reads the file, parses JSON, and passes the result as `parsed.input` to the handler.

**Independent Test**: Invoke a command with `--file` pointing to a valid JSON file and verify the handler receives the parsed content.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T008 [US1] Test that handler receives parsed JSON object in `parsed.input` when `--file` points to a valid JSON file in `test/factory.test.ts`
- [x] T009 [US1] Test that command errors with descriptive message when `--file` points to a nonexistent file in `test/factory.test.ts`
- [x] T010 [US1] Test that command errors with descriptive message when `--file` points to a file with malformed JSON in `test/factory.test.ts`
- [x] T011 [US1] Test that command errors with "empty content" message when `--file` points to an empty (0-byte) file in `test/factory.test.ts`
- [x] T012 [US1] Test that `parsed.input` is `undefined` when `input: true` but no `--file` is provided and stdin is a TTY in `test/factory.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Implement file reading logic in `defineCommand` action handler: read `--file` value, call `fs.readFileSync`, handle file-not-found error via `cmd.error()` in `src/factory.ts`
- [x] T014 [US1] Implement JSON parsing logic: empty content check, `JSON.parse` with try/catch, assign to `parsed.input` in `src/factory.ts`

**Checkpoint**: `--file` path works end-to-end. All file-based error cases produce clear messages. `npm test` passes.

---

## Phase 4: User Story 2 - JSON Input via Stdin (Priority: P1)

**Goal**: When JSON is piped to stdin, the factory reads it, parses it, and passes the result as `parsed.input` to the handler.

**Independent Test**: Pipe valid JSON to stdin and verify the handler receives the parsed content.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T015 [US2] Test that handler receives parsed JSON object in `parsed.input` when valid JSON is piped to stdin in `test/factory.test.ts`
- [x] T016 [US2] Test that command errors with descriptive message when malformed JSON is piped to stdin in `test/factory.test.ts`
- [x] T017 [US2] Test that command errors with "empty content" message when empty data is piped to stdin in `test/factory.test.ts`

### Implementation for User Story 2

- [x] T018 [US2] Implement stdin detection (`!process.stdin.isTTY`) and reading via `fs.readFileSync(0, 'utf-8')` in `defineCommand` action handler in `src/factory.ts`
- [x] T019 [US2] Wire stdin content through the existing JSON parsing logic (empty check + `JSON.parse`) in `src/factory.ts`

**Checkpoint**: Stdin piping works end-to-end. All stdin error cases produce clear messages. `npm test` passes.

---

## Phase 5: User Story 4 - Conflict Resolution (Priority: P2)

**Goal**: When both `--file` and stdin are provided simultaneously, the factory exits with a clear error before invoking the handler.

**Independent Test**: Pipe JSON to stdin while also passing `--file` and verify the CLI produces the conflict error.

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T020 [US4] Test that command errors with conflict message when both `--file` and stdin are provided in `test/factory.test.ts`

### Implementation for User Story 4

- [x] T021 [US4] Add conflict detection: if `--file` is provided AND `!process.stdin.isTTY`, call `cmd.error()` with dual-input message before reading either source in `src/factory.ts`

**Checkpoint**: Dual-input conflict produces clear error. All previous tests still pass. `npm test` passes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup.

- [x] T022 Run full test suite (`npm test`) and verify all tests pass
- [x] T023 Run quickstart.md scenarios manually to validate documented examples in `specs/003-json-input-support/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **US3 (Phase 2)**: Depends on Phase 1 (interface changes)
- **US1 (Phase 3)**: Depends on Phase 2 (--file option registration)
- **US2 (Phase 4)**: Depends on Phase 2 (--file option registration). Can run in parallel with US1 since stdin logic is independent, but both modify the same action handler in `src/factory.ts`, so sequential execution is safer.
- **US4 (Phase 5)**: Depends on both Phase 3 and Phase 4 (needs both input paths wired to test conflict)
- **Polish (Phase 6)**: Depends on all story phases

### User Story Dependencies

- **US3 (P1)**: Foundation — must complete first. All other stories depend on this.
- **US1 (P1)**: Depends on US3. Independent of US2.
- **US2 (P1)**: Depends on US3. Independent of US1.
- **US4 (P2)**: Depends on US1 AND US2 (both paths must exist to conflict).

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle V)
- Implementation makes tests pass
- All existing tests must remain green after each task

### Parallel Opportunities

- T001 and T002 can run in parallel (different interfaces, same file — low risk)
- Within US3: T003, T004, T005 can be written in parallel (independent test cases)
- US1 and US2 could theoretically run in parallel but share the same action handler code path in `src/factory.ts` — sequential is recommended

---

## Implementation Strategy

### MVP First (US3 + US1)

1. Complete Phase 1: Interface changes
2. Complete Phase 2: US3 (factory wiring + collision detection)
3. Complete Phase 3: US1 (file input)
4. **STOP and VALIDATE**: `--file` works end-to-end with valid JSON, errors, and edge cases
5. This alone delivers meaningful value — users can pass JSON via files

### Incremental Delivery

1. Interface changes → Foundation ready
2. Add US3 → Factory config works, `--file` registered → Checkpoint
3. Add US1 → File input works → MVP deliverable
4. Add US2 → Stdin input works → Full P1 coverage
5. Add US4 → Conflict handling → Complete feature
6. Each story adds value without breaking previous stories

---

## Notes

- All changes are in two files: `src/factory.ts` and `test/factory.test.ts`
- No new files or dependencies needed
- TDD is mandatory per Constitution Principle V
- Error messages follow the format defined in plan.md (e.g., `"--file: file not found: {path}"`)
- `parsed.input` is typed as `unknown` — handlers narrow the type themselves
- Commit after each completed user story phase for clean git history
