# Tasks: Shared Command Builder

**Input**: Design documents from `/specs/001-shared-command-builder/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/factory-api.md

**Tests**: TDD is mandated by the project constitution (Principle V). All implementation tasks follow the red/green cycle: write failing test first, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Source**: `src/` at repository root
- **Tests**: `test/` at repository root
- Factory module: `src/factory.ts`
- Factory tests: `test/factory.test.ts`

---

## Phase 1: Setup

**Purpose**: Project structure and shared type definitions

- [X] T001 Define TypeScript types for CommandConfig, GroupConfig, OptionDefinition, and ParsedResult in `src/factory.ts` (export types only, no implementation yet)
- [X] T002 Create test file `test/factory.test.ts` with SPDX header and initial test structure importing from `src/factory.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core factory infrastructure that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Implement `defineCommand` skeleton in `src/factory.ts` — accepts CommandConfig, creates and returns a Commander Command instance (opaque handle). No argument/option registration yet, just name and description.
- [X] T004 Implement `defineGroup` skeleton in `src/factory.ts` — accepts GroupConfig and child command handles, creates a Commander Command with `.addCommand()` for each child, returns opaque handle.
- [X] T005 Wire up factory exports in `src/factory.ts` — ensure `defineCommand` and `defineGroup` are named exports. Verify `src/cli.ts` can import and register a command handle via `.addCommand()`.

**Checkpoint**: Factory exports are importable and produce valid Commander Command instances that can be registered with the program.

---

## Phase 3: User Story 1 - Define a new subcommand using the shared builder (Priority: P1) 🎯 MVP

**Goal**: Developers can define a leaf command with named options/flags and a handler via `defineCommand`. The factory parses options, coerces types, and invokes the handler with a typed `ParsedResult`.

**Independent Test**: Define a command with required and optional string/number/boolean options and a handler. Invoke it programmatically with valid and invalid input. Verify the handler receives correctly typed values and that missing required options produce errors.

### Implementation for User Story 1

- [X] T006 [US1] ~~Write failing tests for positional argument registration and parsing~~ — superseded by design change; positional arguments removed in favour of named options only
- [X] T007 [US1] ~~Implement positional argument registration in `defineCommand`~~ — superseded by design change; action handler wired directly in `defineCommand`, no positional arg registration
- [~] T008 [US1] ~~Write failing tests for type coercion of positional arguments~~ — removed; type coercion for options is covered in US2 (T019)
- [~] T009 [US1] ~~Implement Zod-based type coercion for positional arguments~~ — removed; Zod coercion for options is covered in US2 (T020)
- [~] T010 [US1] ~~Write failing tests for required argument validation~~ — removed; required option validation is covered in US2 (T021)
- [~] T011 [US1] ~~Implement required argument error handling~~ — removed; required option validation is covered in US2 (T022)
- [~] T012 [US1] ~~Write failing tests for default argument values~~ — removed; default value behaviour for options is covered in US2 (T017)
- [~] T013 [US1] ~~Implement default value support for positional arguments~~ — removed; default values for options are covered in US2 (T018)
- [X] T014 [US1] Write failing test verifying no Commander API leaks in `test/factory.test.ts` — confirm that command authors only import from `src/factory.ts`, not from `commander`

**Checkpoint**: A developer can define a command with named options/flags via `defineCommand`, invoke it, and receive a correctly typed `ParsedResult` in the handler. No Commander API is exposed to command authors.

---

## Phase 4: User Story 2 - Define subcommand options and flags (Priority: P1)

**Goal**: Developers can define boolean flags and string/number options with short/long names, defaults, and descriptions.

**Independent Test**: Define a command with `--verbose` (boolean), `--output <path>` (string with default), and `--count <n>` (number). Verify correct parsing, default values, type coercion, and help text listing.

### Implementation for User Story 2

- [X] T015 [P] [US2] Write failing tests for boolean flag parsing in `test/factory.test.ts` — test `--verbose` / `-v` flag sets option to true, absent flag defaults to false
- [X] T016 [US2] Implement boolean flag registration in `defineCommand` in `src/factory.ts` — register Commander options for boolean type definitions
- [X] T017 [P] [US2] Write failing tests for string option parsing in `test/factory.test.ts` — test `--output <path>` with and without a value, including default value behavior
- [X] T018 [US2] Implement string option registration in `defineCommand` in `src/factory.ts`
- [X] T019 [P] [US2] Write failing tests for numeric option parsing and coercion in `test/factory.test.ts` — test `--count 5` coerces to number, `--count abc` produces type error
- [X] T020 [US2] Implement numeric option registration and Zod coercion for options in `src/factory.ts` — extend the Zod schema to cover all option types
- [X] T021 [US2] Write failing tests for required options in `test/factory.test.ts` — test that a required option missing from input produces a clear error
- [X] T022 [US2] Implement required option validation in `src/factory.ts`
- [X] T023 [US2] Write failing test that options appear in help text in `test/factory.test.ts` — invoke `--help` and verify all options listed with descriptions, types, and defaults
- [X] T024 [US2] Ensure help text includes option type and default info in `src/factory.ts`

**Checkpoint**: Commands support boolean flags, string options, and numeric options with full type coercion, defaults, and help text integration.

---

## Phase 5: User Story 3 - Define nested subcommands / command groups (Priority: P2)

**Goal**: Developers can organize commands into hierarchical groups (e.g., `elastic cluster health`). Groups display sub-command listings when invoked without a leaf command.

**Independent Test**: Define a group `cluster` with leaf commands `health` and `stats`. Invoke `elastic cluster health` and verify correct handler dispatch. Invoke `elastic cluster` alone and verify sub-command listing.

### Implementation for User Story 3

- [X] T025 [P] [US3] Write failing tests for command group creation and sub-command dispatch in `test/factory.test.ts` — define a group with two leaf commands, verify correct handler is invoked for each
- [X] T026 [US3] Implement full `defineGroup` logic in `src/factory.ts` — ensure child commands are properly attached and dispatch works through Commander's nested command support
- [X] T027 [P] [US3] Write failing tests for group help display in `test/factory.test.ts` — invoke the group without a sub-command and verify it displays available sub-commands
- [X] T028 [US3] Implement group-level help behavior in `src/factory.ts` — when a group is invoked without a sub-command, output help listing all child commands
- [X] T029 [US3] Write failing test for leaf command help within a group in `test/factory.test.ts` — invoke `elastic cluster health --help` and verify command-specific help
- [X] T030 [US3] Write failing test for unknown sub-command error in `test/factory.test.ts` — invoke `elastic cluster nonexistent` and verify clear error message
- [X] T031 [US3] Implement unknown sub-command error handling in `src/factory.ts`

**Checkpoint**: Commands can be organized into groups, dispatch works correctly, and group/leaf help text is properly displayed.

---

## Phase 6: User Story 4 - Consistent help text generation (Priority: P2)

**Goal**: All commands defined via the factory produce consistently formatted help text and error messages.

**Independent Test**: Define two different commands with different option shapes. Verify help output follows the same format. Verify error messages for unrecognized options follow a consistent structure.

### Implementation for User Story 4

- [X] T032 [P] [US4] Write failing tests for help text format consistency across commands in `test/factory.test.ts` — define two commands, invoke `--help` on each, verify structural consistency (same sections, same ordering)
- [X] T033 [US4] Implement consistent help text formatting in `src/factory.ts` — configure Commander's help output to ensure uniform structure across all commands built by the factory
- [X] T034 [P] [US4] Write failing tests for error message consistency in `test/factory.test.ts` — invoke commands with unrecognized options, verify error format matches the error contract
- [X] T035 [US4] Implement consistent error message formatting in `src/factory.ts` — override Commander's default error output to match the error contract from `contracts/factory-api.md`

**Checkpoint**: All commands produce uniform help text and error messages regardless of their specific argument/option definitions.

---

## Phase 7: User Story 5 - Extensibility for future shared features (Priority: P3)

**Goal**: The factory's design supports adding cross-cutting features without changing existing command definitions.

**Independent Test**: Verify that the factory's config types allow new optional fields and that the factory's internal pipeline can be extended without modifying `CommandConfig`.

### Implementation for User Story 5

- [X] T036 [US5] Write test demonstrating forward-compatibility in `test/factory.test.ts` — define a command with only current fields, then verify the factory still works if new optional fields are added to the config type (TypeScript compilation check)
- [X] T037 [US5] Review and document extension points in `src/factory.ts` — add JSDoc comments identifying where future cross-cutting concerns (output formatting, auth, dry-run, JSON Schema) will hook in, without implementing them

**Checkpoint**: Factory design is validated as extensible. Future features can be added to the factory internals without breaking existing command definitions.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validation, cleanup, and integration

- [X] T038 [P] Add comprehensive JSDoc comments to all exported types and functions in `src/factory.ts`
- [X] T039 [P] Write tests for config validation rules in `test/factory.test.ts` — invalid name, duplicate options, short alias too long
- [X] T040 Implement config validation at definition time in `src/factory.ts` — add runtime checks for validation rules from data-model.md (name format, short alias length, duplicate option names)
- [X] T041 Update `src/cli.ts` to remove direct Commander usage for command registration, use factory imports instead (integration point)
- [X] T042 Run full test suite across Node 20/22/24/25 and verify pass
- [X] T043 Run quickstart.md scenarios manually to validate examples work end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2. No dependencies on other stories.
- **US2 (Phase 4)**: Depends on Phase 2. Can run in parallel with US1 but shares `src/factory.ts`, so sequential recommended.
- **US3 (Phase 5)**: Depends on Phase 2. Independent of US1/US2 but builds on the same factory file.
- **US4 (Phase 6)**: Depends on US2 (needs commands with options to test format consistency).
- **US5 (Phase 7)**: Depends on US1 (needs a working factory to validate extensibility).
- **Polish (Phase 8)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational → **MVP milestone**
- **US2 (P1)**: Can start after Foundational, recommended after US1 (shared file)
- **US3 (P2)**: Can start after Foundational, recommended after US1/US2
- **US4 (P2)**: Requires US1 + US2 complete (needs multiple commands to test consistency)
- **US5 (P3)**: Requires US1 complete (needs working factory)

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution Principle V)
- Follow red/green cycle per task pair (test task → implementation task)

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- Within US2: T015, T017, T019 can run in parallel (independent test groups)
- Within US3: T025 and T027 can run in parallel (independent test groups)
- Within US4: T032 and T034 can run in parallel (independent test groups)
- T038 and T039 can run in parallel (different concerns in same file but independent)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T005)
3. Complete Phase 3: US1 — options + handler wiring + no-leak test (T014)
4. **STOP and VALIDATE**: A command can be defined with a handler and wired action — options registration covered in US2
5. This is the minimum useful factory

### Incremental Delivery

1. Setup + Foundational → Factory skeleton ready
2. Add US1 → Action handler wiring + no-leak test → **MVP** ✅
3. Add US2 → Options + flags → Full argument parsing ✅
4. Add US3 → Nested commands → Command organization ✅
5. Add US4 → Consistent formatting → Polish ✅
6. Add US5 → Extensibility validation → Future-proofing ✅
7. Polish → JSDoc, config validation, integration → Production-ready ✅

---

## Notes

- All source code lives in a single file (`src/factory.ts`) per user direction
- All tests live in a single file (`test/factory.test.ts`) for this feature
- Constitution Principle V mandates TDD — every implementation task has a preceding test task
- Commander.js is the internal engine but MUST NOT be exposed to command authors
- Zod handles type coercion/validation, producing structured errors
- The factory returns Commander `Command` instances typed as opaque handles
