# Tasks: JSON Output Format Flag

**Input**: Design documents from `/specs/003-json-output-format/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Included — Constitution §V (Test-First Development) is NON-NEGOTIABLE.

**Organization**: Tasks grouped by user story. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3)
- Exact file paths included in every task description

---

## Phase 1: Setup

**Purpose**: Create the new `internal/output` package and establish the envelope types that all subsequent work depends on.

- [X] T001 [P] Create `internal/output/output.go` with `Envelope`, `Error` structs, `FormatText`/`FormatJSON` constants, and `ValidateFormat()` function
- [X] T002 [P] Create `internal/output/output_test.go` with tests for `Envelope` JSON marshaling (success, error, warnings, null fields, empty warnings as `[]`) and `ValidateFormat` (valid values, invalid values, empty string, case sensitivity)

**Checkpoint**: `go test ./internal/output/...` passes. Envelope types and validation are proven.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire format-aware rendering into `factory.New()` and register the `--format` flag. This changes the core command execution path and MUST be complete before any user story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add `Render(w io.Writer, format string, data any, err error) error` function to `internal/output/output.go` — builds `Envelope` and writes JSON or text based on format
- [X] T004 Add tests for `Render()` in `internal/output/output_test.go` — JSON success output, JSON error output, text success fallback, text error passthrough, warnings embedding, nil data produces `null`
- [X] T005 Change `RunFunc` signature from `func(RunContext) error` to `func(RunContext) (any, error)` in `internal/factory/factory.go`
- [X] T006 Update `factory.New()` RunE wrapper in `internal/factory/factory.go` to: (a) look up `--format` from root persistent flags, (b) validate format via `output.ValidateFormat()`, (c) call handler to get `(data, err)`, (d) call `output.Render()` to write the result
- [X] T007 Update all existing tests in `internal/factory/factory_test.go` to match new `RunFunc` `(any, error)` return signature
- [X] T008 Register `--format` as a `PersistentFlags().StringVar()` on `rootCmd` in `cmd/root.go` (default `"text"`)
- [X] T009 Update the `version` command handler in `cmd/root.go` to return `("elastic version dev", nil)` instead of calling `fmt.Fprintln`
- [X] T010 Add test in `cmd/root_test.go` that `--format` persistent flag is registered on `rootCmd`
- [X] T011 Update existing tests in `cmd/root_test.go` to account for changed `RunFunc` signature and output rendering

**Checkpoint**: `go test ./...` passes. Factory produces JSON envelope when `--format=json` is used, text when default. All existing behavior preserved.

---

## Phase 3: User Story 1 — Machine-readable output for scripting (Priority: P1) 🎯 MVP

**Goal**: A user can pass `--format=json` to any command and receive valid, parseable JSON on stdout that pipes cleanly into `jq`.

**Independent Test**: `elastic version --format=json | jq .` succeeds and returns the expected envelope.

### Tests for US1

> **Write these tests FIRST, ensure they FAIL, then implement.**

- [ ] T012 [P] [US1] Add test in `internal/factory/factory_test.go`: command with `--format=json` produces valid JSON envelope on stdout with `"data"` field matching handler return value
- [ ] T013 [P] [US1] Add test in `internal/factory/factory_test.go`: command with `--format=json` stdout output parses with `json.Valid()` — no preamble, no trailing text
- [ ] T014 [P] [US1] Add test in `internal/factory/factory_test.go`: command without `--format` flag produces unchanged text output (backward compatibility)
- [ ] T015 [P] [US1] Add test in `internal/factory/factory_test.go`: command with `--format=text` produces identical output to no flag (explicit default)

### Implementation for US1

- [ ] T016 [US1] Ensure `output.Render()` with `FormatJSON` writes only `json.Marshal(envelope) + "\n"` to the writer — no extra bytes — in `internal/output/output.go`
- [ ] T017 [US1] Ensure `output.Render()` with `FormatText` writes data via `fmt.Fprintln` (string data) or `fmt.Fprintf("%v")` (other types) — preserving current behavior — in `internal/output/output.go`

**Checkpoint**: T012–T015 all green. `elastic version --format=json` emits pure valid JSON. `elastic version` (no flag) is unchanged.

---

## Phase 4: User Story 2 — Error output does not break JSON pipelines (Priority: P2)

**Goal**: When a command fails with `--format=json`, stdout contains a JSON error envelope with structured `code` + `message` instead of plain text.

**Independent Test**: `elastic version --context=bogus --format=json | jq -r '.error.code'` outputs `context_not_found`.

### Tests for US2

> **Write these tests FIRST, ensure they FAIL, then implement.**

- [ ] T018 [P] [US2] Add test in `internal/factory/factory_test.go`: handler returning error with `--format=json` produces JSON envelope with `"error": {"code": "command_failed", "message": "..."}` and `"data": null` on stdout
- [ ] T019 [P] [US2] Add test in `internal/factory/factory_test.go`: handler returning error with `--format=json` writes nothing to stderr
- [ ] T020 [P] [US2] Add test in `internal/factory/factory_test.go`: handler returning error without `--format=json` writes `Error: <msg>` to stderr (existing behavior preserved)
- [ ] T021 [P] [US2] Add test in `internal/factory/factory_test.go`: config error (e.g., unreadable config file) with `--format=json` produces JSON envelope with `"code": "config_error"`
- [ ] T022 [P] [US2] Add test in `internal/factory/factory_test.go`: `--context=bogus` with `--format=json` produces JSON envelope with `"code": "context_not_found"`
- [ ] T023 [P] [US2] Add test in `internal/factory/factory_test.go`: `--format=xml` (unsupported) produces JSON envelope with `"code": "invalid_argument"` listing supported values
- [ ] T024 [P] [US2] Add test in `cmd/root_test.go`: `Execute()` with `--format=json` and a failing command writes JSON error envelope to stdout instead of plain text to stderr

### Implementation for US2

- [ ] T025 [US2] Define typed error types or error-code extraction logic in `internal/output/output.go` — map known factory errors (context-not-found, config error, input error, validation) to specific error codes
- [ ] T026 [US2] Update `output.Render()` in `internal/output/output.go` to use error-code extraction when building the error envelope — classify errors into `context_not_found`, `config_error`, `input_error`, `invalid_argument`, or fallback `command_failed`
- [ ] T027 [US2] Update `factory.New()` RunE in `internal/factory/factory.go` to intercept format-validation errors and pre-factory errors (config, context, input) and route them through `output.Render()` instead of returning raw errors to Cobra
- [ ] T028 [US2] Update `Execute()` in `cmd/root.go` to check `--format` flag on error path — if `json`, write JSON error envelope to stdout; if `text`, preserve existing stderr behavior

**Checkpoint**: T018–T024 all green. All error paths produce JSON envelopes with appropriate codes. No plain text leaks to stdout in JSON mode.

---

## Phase 5: User Story 3 — Consistent flag across all commands (Priority: P3)

**Goal**: `--format` is recognized by every command, present and future. No command can silently ignore it.

**Independent Test**: `elastic version --help` output includes `--format` in the flags list.

### Tests for US3

> **Write these tests FIRST, ensure they FAIL, then implement.**

- [ ] T029 [P] [US3] Add test in `cmd/root_test.go`: every registered subcommand inherits `--format` persistent flag (iterate `rootCmd.Commands()` and assert `cmd.Root().PersistentFlags().Lookup("format") != nil`)
- [ ] T030 [P] [US3] Add test in `cmd/root_test.go`: `elastic version --help` output contains the string `--format`
- [ ] T031 [P] [US3] Add test in `internal/factory/factory_test.go`: command with `--format=json` returning nil data produces `{"data":null,"error":null,"warnings":[]}` (no-output command still emits valid envelope)

### Implementation for US3

- [ ] T032 [US3] Verify `--format` flag description in `cmd/root.go` is clear and mentions supported values (`"Output format (text|json)"` or similar)
- [ ] T033 [US3] Verify `factory.New()` in `internal/factory/factory.go` handles nil data return from handler gracefully (data field serializes as `null` in JSON, skipped in text)

**Checkpoint**: T029–T031 all green. All commands show `--format` in help. Nil-data commands produce valid envelopes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, documentation, and validation across all stories.

- [ ] T034 [P] Add test in `internal/output/output_test.go`: `Envelope.Warnings` marshals as `[]` (not `null`) when no warnings present
- [ ] T035 [P] Add test in `internal/output/output_test.go`: `Envelope` with warnings marshals as `{"data": ..., "error": null, "warnings": ["msg1", "msg2"]}`
- [ ] T036 [P] Add test in `internal/factory/factory_test.go`: command returning `{"status": "ok"}` as data with no error produces correct envelope for no-output commands (FR-007)
- [ ] T037 Verify all exported symbols in `internal/output/output.go` have Go doc comments per constitution Development Standards
- [ ] T038 Run `go vet ./...` and `go test -race ./...` — fix any issues
- [ ] T039 Run quickstart.md scenarios manually or as a script to validate end-to-end behavior

**Checkpoint**: All tests green, all vet/race checks pass, quickstart scenarios validated.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ──────────────────┐
                                 ▼
Phase 2: Foundational ───────────┤ (BLOCKS all user stories)
                                 ▼
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
Phase 3: US1 (P1) 🎯    Phase 4: US2 (P2)       Phase 5: US3 (P3)
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                       Phase 6: Polish
```

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational (Phase 2) only. No dependency on other stories.
- **US2 (P2)**: Depends on Foundational (Phase 2) only. Builds on same infra as US1 but is independently testable.
- **US3 (P3)**: Depends on Foundational (Phase 2) only. Verifies inheritance — no code changes, just validation.

### Within Each User Story

1. Write tests FIRST → confirm they FAIL
2. Implement minimum code to make tests PASS
3. Refactor under green

### Parallel Opportunities

- **Phase 1**: T001, T002 can run in parallel (separate files)
- **Phase 2**: T003–T004 (output pkg) can parallel with T008, T010 (root.go) initially, but T005–T007 and T009, T011 are sequential
- **Phase 3–5**: All user stories can start in parallel after Phase 2 completes
- **Within stories**: All test tasks marked [P] can run in parallel
- **Phase 6**: T034, T035, T036 can run in parallel

---

## Parallel Example: User Story 2

```bash
# Launch all US2 tests together (they target different scenarios, same file):
T018: JSON error envelope structure test
T019: JSON error stderr-silence test
T020: Text error backward-compat test
T021: Config error code classification test
T022: Context-not-found error code test
T023: Unsupported format error code test
T024: Execute() JSON error path test (different file: cmd/root_test.go)

# Then implement sequentially:
T025 → T026 → T027 → T028
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T003–T011)
3. Complete Phase 3: US1 (T012–T017)
4. **STOP and VALIDATE**: `elastic version --format=json | jq .` works
5. This is a usable, shippable increment

### Incremental Delivery

1. Setup + Foundational → Core infrastructure ready
2. Add US1 → JSON output works for success path → **MVP** 🎯
3. Add US2 → Errors also produce JSON → Pipelines fully reliable
4. Add US3 → Flag consistency verified → Full feature complete
5. Polish → Edge cases, docs, race checks

### Single Developer Strategy (Recommended)

Execute phases sequentially in priority order:
Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6

Each phase is a natural commit boundary.

---

## Notes

- Constitution §V mandates TDD — all test tasks must FAIL before implementation
- [P] tasks target different files or independent scenarios
- [Story] label traces every task to its user story
- Commit after each phase or logical group of tasks
- Stop at any checkpoint to validate independently
- The `version` command is the only existing command — it serves as the integration test target for all stories
