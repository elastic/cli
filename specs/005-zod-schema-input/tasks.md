# Tasks: Schema-Driven Input Validation

**Input**: Design documents from `/specs/005-zod-schema-input/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema-to-cli.md

**Tests**: Required per Constitution Principle V (Test-First Development). All tasks follow TDD: write failing test → implement → green.

**Organization**: Tasks are grouped by user story. US1–US3 are P1 (MVP), US4–US6 are P2 (incremental).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Create new module structure and skeleton files

- [X] T001 Create `src/lib/schema-args.ts` with SPDX header, empty exports, and `SchemaArgDefinition` interface per data-model.md
- [X] T002 [P] Create `test/lib/schema-args.test.ts` with SPDX header and import skeleton

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities that ALL user stories depend on. Must complete before any story phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add failing tests for `toKebabCase()` in `test/lib/schema-args.test.ts` covering snake_case → kebab-case, camelCase → kebab-case, and lowercase passthrough (per contracts/schema-to-cli.md flag naming rules)
- [X] T004 Implement `toKebabCase()` in `src/lib/schema-args.ts` to make T003 tests pass
- [X] T005 Add failing tests for `extractSchemaArgs()` in `test/lib/schema-args.test.ts` covering: extracts top-level keys from `z.object()`, identifies type (string/number/boolean/object/array/enum), extracts `required` status, extracts `defaultValue`, extracts `description`, returns `SchemaArgDefinition[]`
- [X] T006 Implement `extractSchemaArgs()` in `src/lib/schema-args.ts` using Zod v4 introspection (per research.md R1) to make T005 tests pass
- [X] T007 Add failing tests for `buildFlagKeyMap()` in `test/lib/schema-args.test.ts` covering: bidirectional mapping between `cliFlag` ↔ `schemaKey`, round-trip correctness for both snake_case and camelCase keys
- [X] T008 Implement `buildFlagKeyMap()` in `src/lib/schema-args.ts` returning a `FlagKeyMap` (per data-model.md) to make T007 tests pass
- [X] T009 Add failing tests for collision detection in `test/lib/schema-args.test.ts`: reserved flag collision (help, version, format, config, context, file), duplicate kebab-case collision (e.g., `num_shards` and `numShards` both → `num-shards`)
- [X] T010 Implement `validateSchemaArgs()` in `src/lib/schema-args.ts` with reserved flag and duplicate kebab-case checks (per FR-009, FR-012) to make T009 tests pass

**Checkpoint**: All schema introspection utilities are tested and green. Factory integration can begin.

---

## Phase 3: User Story 1 — CLI Arguments from Schema (Priority: P1) 🎯 MVP

**Goal**: Every top-level key in a command's input schema is automatically available as a CLI argument with correct type coercion and kebab-case naming.

**Independent Test**: Define a command with a multi-field Zod schema (string, number, boolean). Invoke it with `--kebab-case` CLI arguments. Verify the handler receives correctly typed and keyed values.

### Tests for US1

- [X] T011 [US1] Add failing test in `test/factory.test.ts`: command with `z.object({ index: z.string() })` input schema accepts `--index my-index` and handler receives `{ index: "my-index" }` in `parsed.input`
- [X] T012 [US1] Add failing test in `test/factory.test.ts`: command with `z.object({ num_shards: z.number() })` accepts `--num-shards 3` and handler receives `{ num_shards: 3 }` (number coercion)
- [X] T013 [US1] Add failing test in `test/factory.test.ts`: command with `z.object({ verbose: z.boolean().default(false) })` accepts `--verbose` (no value) and handler receives `{ verbose: true }` (flag-style boolean)
- [X] T014 [US1] Add failing test in `test/factory.test.ts`: `--verbose false` sets value to `false`
- [X] T015 [US1] Add failing test in `test/factory.test.ts`: camelCase key `refreshInterval` is accessible as `--refresh-interval` and mapped back to `refreshInterval` in input
- [X] T016 [US1] Add failing test in `test/factory.test.ts`: snake_case key `api_key` is accessible as `--api-key` and mapped back to `api_key` in input
- [X] T017 [US1] Add failing test in `test/factory.test.ts`: string field value is passed through as-is without coercion (FR-010), even when value looks numeric
- [X] T018 [US1] Add failing test in `test/factory.test.ts`: schema field with default value receives that default when CLI arg is not provided (FR-014)

### Implementation for US1

- [X] T019 [US1] Modify `defineCommand()` in `src/factory.ts` to call `extractSchemaArgs()` and `buildFlagKeyMap()` when `config.input` is a Zod object schema, and register each `SchemaArgDefinition` as a Commander option with correct type placeholder and coercion
- [X] T020 [US1] Modify the `cmd.action()` handler in `src/factory.ts` to collect schema-derived CLI argument values, map them back to original schema keys using `FlagKeyMap`, coerce types, and pass them to schema validation as input
- [X] T021 [US1] Verify all T011–T018 tests pass after implementation. Refactor under green.

**Checkpoint**: Commands with input schemas accept CLI arguments. `--flag value` works for string, number, and boolean types with correct coercion and key mapping.

---

## Phase 4: User Story 2 — JSON Input with Strict Validation (Priority: P1)

**Goal**: JSON input via `--file` or stdin is validated against the schema in strict mode, rejecting unknown keys.

**Independent Test**: Provide JSON with an unknown key via `--file`. Verify the command fails with a validation error naming the unknown key.

### Tests for US2

- [X] T022 [US2] Add failing test in `test/factory.test.ts`: valid JSON via `--file` is accepted and parsed against the schema (confirm existing behavior still works with new schema-arg registration)
- [X] T023 [US2] Add failing test in `test/factory.test.ts`: JSON with an unknown key (e.g., `{ "index": "foo", "bogus": 1 }`) is rejected with a validation error identifying `bogus` (FR-013)
- [X] T024 [US2] Add failing test in `test/factory.test.ts`: JSON via stdin with unknown keys is rejected identically to `--file`

### Implementation for US2

- [X] T025 [US2] Modify schema validation in `src/factory.ts` to apply strict mode (reject unknown keys) when validating JSON input against the input schema. Use Zod's `.strict()` wrapping or equivalent unknown-key detection (per research.md R8)
- [X] T026 [US2] Verify all T022–T024 tests pass. Refactor under green.

**Checkpoint**: JSON input is validated strictly. Unknown keys produce clear errors.

---

## Phase 5: User Story 3 — Merge JSON and CLI with CLI Precedence (Priority: P1)

**Goal**: When both JSON and CLI arguments are provided, they are merged with CLI taking precedence. The merged result is validated against the schema.

**Independent Test**: Provide JSON via `--file` with `{ "index": "base", "num_shards": 1 }` and CLI arg `--num-shards 5`. Verify handler receives `{ index: "base", num_shards: 5 }`.

### Tests for US3

- [X] T027 [US3] Add failing test in `test/factory.test.ts`: JSON `{ "index": "logs", "num_shards": 1 }` + CLI `--num-shards 5` merges to `{ index: "logs", num_shards: 5 }` (CLI wins)
- [X] T028 [US3] Add failing test in `test/factory.test.ts`: JSON `{ "index": "logs" }` + CLI `--num-shards 2` merges to `{ index: "logs", num_shards: 2 }` (CLI adds new key)
- [X] T029 [US3] Add failing test in `test/factory.test.ts`: JSON only (no CLI args) passes through as-is
- [X] T030 [US3] Add failing test in `test/factory.test.ts`: CLI only (no JSON) passes through as-is
- [X] T031 [US3] Add failing test in `test/factory.test.ts`: merged result with unknown key from CLI is rejected (strict validation applies post-merge)

### Implementation for US3

- [X] T032 [US3] Implement merge logic in `src/factory.ts` within the `cmd.action()` handler: if JSON input exists and CLI args exist, shallow-merge with CLI precedence using `FlagKeyMap` for key resolution (per contracts/schema-to-cli.md merge algorithm)
- [X] T033 [US3] Ensure schema validation (including strict mode) runs on the merged result, and schema defaults are applied to fields missing from both sources (FR-014)
- [X] T034 [US3] Verify all T027–T031 tests pass. Refactor under green.

**Checkpoint**: Full input pipeline works: JSON + CLI → merge → defaults → validate → handler. This completes the P1 MVP.

---

## Phase 6: User Story 4 — Non-Primitive CLI Values as JSON Strings (Priority: P2)

**Goal**: CLI arguments for object or array schema fields accept JSON strings, which are parsed before merge and validation.

**Independent Test**: Provide `--mappings '{"dynamic": false}'` for an object-typed field. Verify the handler receives the parsed object.

### Tests for US4

- [ ] T035 [P] [US4] Add failing test in `test/factory.test.ts`: `--mappings '{"dynamic": false}'` for a `z.object()` field parses to `{ dynamic: false }`
- [ ] T036 [P] [US4] Add failing test in `test/factory.test.ts`: `--tags '["prod", "v2"]'` for a `z.array()` field parses to `["prod", "v2"]`
- [ ] T037 [P] [US4] Add failing test in `test/factory.test.ts`: `--mappings 'not valid json'` for an object field fails with a clear JSON parse error before any operations

### Implementation for US4

- [ ] T038 [US4] In `src/factory.ts`, when registering schema-derived options for object/array types, use a custom parse function that calls `JSON.parse()` and errors on failure (per research.md R5 and contracts type-to-flag mapping)
- [ ] T039 [US4] Verify all T035–T037 tests pass. Refactor under green.

**Checkpoint**: Non-primitive values work via JSON strings. Invalid JSON fails early.

---

## Phase 7: User Story 5 — Validation Error Reporting (Priority: P2)

**Goal**: Validation errors clearly identify which fields failed and why, in both text and JSON formats, matching the error contract.

**Independent Test**: Provide input missing a required field and a field with wrong type. Verify the error message names both fields with specific reasons.

### Tests for US5

- [ ] T040 [P] [US5] Add failing test in `test/factory.test.ts`: missing required field produces error identifying the field name (text format)
- [ ] T041 [P] [US5] Add failing test in `test/factory.test.ts`: wrong type for a field produces error identifying field and type mismatch (text format)
- [ ] T042 [P] [US5] Add failing test in `test/factory.test.ts`: `--format=json` produces structured JSON error with `code`, `message`, and `issues` array (per contracts validation error contract)
- [ ] T043 [P] [US5] Add failing test in `test/factory.test.ts`: merged input (JSON + CLI) that violates schema after merge produces clear error

### Implementation for US5

- [ ] T044 [US5] Review and update validation error formatting in `src/factory.ts` to ensure error messages reference field names using the original schema key (not kebab-case CLI flag names) and match the contracts/schema-to-cli.md error contract format
- [ ] T045 [US5] Verify all T040–T043 tests pass. Refactor under green.

**Checkpoint**: Validation errors are clear and actionable in both text and JSON formats.

---

## Phase 8: User Story 6 — Help Output (Priority: P2)

**Goal**: `--help` output lists all schema-derived arguments with kebab-case names, types, required/optional status, and descriptions.

**Independent Test**: Run `command --help` for a command with a multi-field schema. Verify all schema fields appear with correct metadata.

### Tests for US6

- [ ] T046 [P] [US6] Add failing test in `test/factory.test.ts`: `--help` output includes all schema-derived flags with correct type placeholders (`<string>`, `<number>`, `<json>`)
- [ ] T047 [P] [US6] Add failing test in `test/factory.test.ts`: `--help` output shows `(required)` for required fields and `(default: X)` for fields with defaults
- [ ] T048 [P] [US6] Add failing test in `test/factory.test.ts`: `--help` output shows the `description` from the schema next to each argument
- [ ] T049 [P] [US6] Add failing test in `test/factory.test.ts`: schema-derived arguments appear before framework flags (`--file`, `--format`, `--help`) in help output

### Implementation for US6

- [ ] T050 [US6] Ensure schema-derived options are registered with Commander before framework options (`--file`) in `src/factory.ts` so they appear first in help text. Use description from `SchemaArgDefinition.description`. Add `(required)` suffix for required fields.
- [ ] T051 [US6] Verify all T046–T049 tests pass. Refactor under green.

**Checkpoint**: Help output is complete and self-describing. Agents and users can discover all arguments from `--help` alone.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Edge case hardening, documentation, and cleanup

- [ ] T052 [P] Add test in `test/factory.test.ts`: command with `options` array AND `input` schema registers both manual options and schema-derived options without conflict
- [ ] T053 [P] Add test in `test/factory.test.ts`: command without `input` schema continues to work exactly as before (backward compatibility)
- [ ] T054 [P] Add test in `test/factory.test.ts`: schema key that collides with reserved flag (`help`, `format`, etc.) throws at registration time
- [ ] T055 [P] Add test in `test/factory.test.ts`: two schema keys producing same kebab-case flag (e.g., `num_shards` + `numShards`) throws at registration time (FR-012)
- [ ] T056 [P] Add test in `test/factory.test.ts`: empty JSON input `{}` is accepted if all fields have defaults, rejected if required fields exist
- [ ] T057 [P] Add test in `test/factory.test.ts`: string field receiving a value that looks like JSON (e.g., `--name '{"foo": "bar"}'`) passes through as-is without parsing (FR-010)
- [ ] T058 Implement any edge case fixes needed to pass T052–T057
- [ ] T059 Update JSDoc comments on `CommandConfig`, `defineCommand()`, and new exports in `src/lib/schema-args.ts` to document schema-driven argument behavior
- [ ] T060 Run `quickstart.md` validation: create a test command matching the quickstart example, verify all described invocation patterns work
- [ ] T061 Run full test suite (`npm test`) and confirm all tests pass and lint is clean

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — 🎯 MVP start
- **US2 (Phase 4)**: Depends on Phase 2. Can run in parallel with US1 if different developers.
- **US3 (Phase 5)**: Depends on US1 (Phase 3) and US2 (Phase 4) — merge requires both CLI args and JSON to work
- **US4 (Phase 6)**: Depends on US1 (Phase 3) — extends CLI arg registration with JSON string parsing
- **US5 (Phase 7)**: Depends on US3 (Phase 5) — error formatting needs merged input path
- **US6 (Phase 8)**: Depends on US1 (Phase 3) — help text needs schema-derived options registered
- **Polish (Phase 9)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories.
- **US2 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories.
- **US3 (P1)**: Depends on US1 + US2 (needs both CLI arg collection and JSON input path).
- **US4 (P2)**: Depends on US1 (extends the CLI arg registration for non-primitive types).
- **US5 (P2)**: Depends on US3 (validation errors apply to merged input).
- **US6 (P2)**: Depends on US1 (help text needs schema-derived options registered).

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation makes tests pass
- Refactor under green

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- T011–T018 (US1 tests) can all be written in parallel before implementation
- T022–T024 (US2 tests) can run in parallel with US1 implementation (different concerns)
- T035–T037 (US4 tests) can run in parallel
- T040–T043 (US5 tests) can run in parallel
- T046–T049 (US6 tests) can run in parallel
- T052–T057 (Polish tests) can all run in parallel
- US4 and US6 can run in parallel after US1 completes (no dependency on each other)

---

## Parallel Example: US1

```bash
# Write all US1 tests in parallel (different test cases, same file):
T011: test schema string field → --index
T012: test schema number field → --num-shards (coercion)
T013: test boolean flag-style → --verbose (no value = true)
T014: test boolean explicit false → --verbose false
T015: test camelCase key → --refresh-interval
T016: test snake_case key → --api-key
T017: test string passthrough (no coercion)
T018: test schema default applied

# Then implement:
T019: register schema-derived options in defineCommand()
T020: collect + map CLI values in action handler
T021: verify all green, refactor
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 = P1 stories)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T010)
3. Complete Phase 3: US1 — CLI arguments from schema (T011–T021)
4. Complete Phase 4: US2 — Strict JSON validation (T022–T026)
5. Complete Phase 5: US3 — Merge logic (T027–T034)
6. **STOP and VALIDATE**: Full input pipeline works end-to-end. MVP is functional.

### Incremental Delivery

1. Setup + Foundational → Schema introspection utilities ready
2. US1 → CLI arguments work → Test independently → Partial value
3. US1 + US2 → JSON strict validation works → Test independently
4. US1 + US2 + US3 → Merge works → **MVP complete** 🎯
5. US4 → Non-primitive CLI values → Incremental improvement
6. US5 → Better error messages → Incremental improvement
7. US6 → Auto-generated help → Incremental improvement
8. Polish → Edge cases, docs, cleanup → Release ready

---

## Notes

- [P] tasks = different files or independent test cases, no dependencies
- [Story] label maps task to specific user story for traceability
- Constitution Principle V requires TDD: every implementation task has preceding test tasks
- Existing `test/factory.test.ts` patterns should be followed for new tests (Commander parseAsync, output capture, etc.)
- The existing `--file` and stdin JSON reading in `factory.ts` is preserved — this feature extends it with schema-driven CLI args and merge
- Total: 61 tasks across 9 phases
