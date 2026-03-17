---
description: "Task list for Core Utilities — Constitutional Foundations"
---

# Tasks: Core Utilities — Constitutional Foundations

**Input**: Design documents from `/specs/002-core-utils-constitution/`
**Branch**: `002-core-utils-constitution`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**TDD note**: All implementation tasks are preceded by a failing-test task. Tests MUST be written and confirmed failing before any implementation code is written (Constitution Principle V). This is an internal agent discipline — proceed through the full red/green/refactor cycle autonomously without stopping for human approval between test and implementation.

---

## Phase 1: Setup

**Purpose**: Create the `internal/cmdutil` package skeleton so all subsequent tasks have a home.

- [ ] T001 Create package directory and blank files: `internal/cmdutil/errors.go`, `internal/cmdutil/context.go`, `internal/cmdutil/dryrun.go`, `internal/cmdutil/render.go`

---

## Phase 2: Foundational — StructuredError (US1, blocks everything)

**Purpose**: The `StructuredError` type is the lowest-level primitive. Every other utility and the `es` refactor depends on it. Complete and green before proceeding.

**Goal**: `internal/cmdutil` exports `StructuredError`, four `ErrCode*` constants, `New`, and `Wrap`. Implements `error`. Marshals to `{"error":{"code":"…","message":"…"}}`.

**Independent Test**: `go test ./internal/cmdutil/... -run TestStructuredError` — all assertions green; `Wrap` idempotency confirmed; JSON shape validated.

- [ ] T002 [US1] Write failing tests for `StructuredError`, `New`, `Wrap`, and JSON marshal in `internal/cmdutil/errors_test.go`
- [ ] T003 [US1] Implement `StructuredError` type, `ErrCode*` constants, `New`, and `Wrap` in `internal/cmdutil/errors.go`
- [ ] T003a [US1] Write failing tests for `RenderError` in `internal/cmdutil/render_test.go` covering: JSON format output, table/plain text output, plain Go error fallback (non-`StructuredError`)
- [ ] T003b [US1] Implement `RenderError` in `internal/cmdutil/render.go`

**Checkpoint**: `go test ./internal/cmdutil/... -run TestStructuredError` passes. All four error code constants exist and are used in tests.

---

## Phase 3: User Story 2 — Context Resolution Utility (P1)

**Goal**: `cmdutil.ResolveContext(contextFlag string) (config.Context, error)` replaces the duplicated 10-line context-resolution block found in `get_run.go` and `api.go`.

**Independent Test**: `go test ./internal/cmdutil/... -run TestResolveContext` — all table-driven cases pass with a temporary config file; no Elasticsearch connection required.

- [ ] T004 [P] [US2] Write failing unit tests for `ResolveContext` covering: valid context, `--context` override, missing config file (`ErrCodeConfigNotFound`), missing context (`ErrCodeContextNotFound`), empty current-context (`ErrCodeContextNotFound`) in `internal/cmdutil/context_test.go`
- [ ] T005 [US2] Implement `ResolveContext` in `internal/cmdutil/context.go`

**Checkpoint**: `go test ./internal/cmdutil/... -run TestResolveContext` passes with ≥80% coverage.

---

## Phase 4: User Story 3 — Dry-Run Utility (P2)

**Goal**: `cmdutil.HandleDryRun(cmd *cobra.Command, format string) (bool, error)` implements dry-run detection, payload printing, and the `dry_run_not_supported` error for commands that don't register the flag.

**Independent Test**: `go test ./internal/cmdutil/... -run TestHandleDryRun` — flag-not-registered, flag-not-set, flag-set-table-output, flag-set-json-output cases all pass.

- [ ] T006 [P] [US3] Write failing unit tests for `HandleDryRun` in `internal/cmdutil/dryrun_test.go` covering: flag not registered → `ErrCodeDryRunNotSupported`; flag registered but not set → `(false, nil)`; flag set with table format → prints payload, returns `(true, nil)`; flag set with JSON format → JSON payload
- [ ] T007 [US3] Implement `HandleDryRun` in `internal/cmdutil/dryrun.go`

**Checkpoint**: `go test ./internal/cmdutil/... -run TestHandleDryRun` passes. `go test ./internal/cmdutil/... -cover` reports ≥80% statement coverage.

---

## Phase 5: User Story 4 — Refactor `es` Family to Use All Utilities (P2)

**Goal**: All five `es` subcommand entry points use `cmdutil.ResolveContext`, emit `*StructuredError` on failure, and register/support `--dry-run` via `cmdutil.HandleDryRun`. No duplicated context-resolution blocks remain. Existing behaviour is preserved.

**Independent Test**: `go test ./cmd/... -run TestES` passes with no regression; new tests cover error paths and dry-run paths; `go test ./... -race` is clean.

### 5a — `get_run.go` (handles `es indices list`, `es data-streams list`, `es remote-clusters list`, `es cluster health`)

- [ ] T008 [US4] Write failing tests for refactored `runGet` in `cmd/es_resources_test.go`: `ResolveContext` error propagation (mock config), dry-run path for list commands (valid + invalid inputs)
- [ ] T009 [US4] Refactor `runGet` in `cmd/get_run.go` to call `cmdutil.ResolveContext(rootContext)` in place of the inline config-load-and-resolve block
- [ ] T010 [US4] Register `--dry-run` on `esIndicesListCmd`, `esDataStreamsListCmd`, `esRemoteClustersListCmd`, and `esClusterHealthCmd` in `cmd/es_resources.go` and add `cmdutil.HandleDryRun` call at the start of each `RunE`

### 5b — `api.go` (handles `es raw`)

- [ ] T011 [US4] Write failing tests for refactored `newRawCmd("es")` in `cmd/api_test.go`: `ResolveContext` error propagation, dry-run with valid flags, dry-run with JSON format
- [ ] T012 [US4] Refactor the context-resolution block in `newRawCmd` in `cmd/api.go` to call `cmdutil.ResolveContext(rootContext)`
- [ ] T013 [US4] Register `--dry-run` on `esRawCmd` in `cmd/api.go` and add `cmdutil.HandleDryRun` call

### 5c — `esql.go` (handles `es query`)

- [ ] T013a [US4] Write failing tests for refactored `esql.go` `RunE` in `cmd/esql_test.go`: `ResolveContext` error propagation (mock config), dry-run with valid flags, dry-run with `--format=json`
- [ ] T013b [US4] Refactor the context-resolution block in `esql.go` `RunE` to call `cmdutil.ResolveContext(rootContext)`
- [ ] T013c [US4] Register `--dry-run` on `esqlCmd` in `cmd/esql.go` and add `cmdutil.HandleDryRun` call at the start of `RunE`

**Checkpoint**: `go test ./cmd/... ./internal/cmdutil/...` passes with no regression. `go test ./... -race` is clean. No inline context-resolution block remains in `get_run.go`, `api.go`, or `esql.go`.

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: Doc comments, coverage gate, final suite validation.

- [ ] T014 [P] Add Go doc comments to all exported symbols in `internal/cmdutil/errors.go`, `internal/cmdutil/context.go`, `internal/cmdutil/dryrun.go`, `internal/cmdutil/render.go`
- [ ] T015 [P] Verify `go test ./internal/cmdutil/... -cover` reports ≥80% statement coverage; add targeted tests if needed
- [ ] T016 Run `go test ./... -race` and confirm clean
- [ ] T017 Run `go vet ./...` and `golangci-lint run` (if configured) and fix any findings
- [ ] T018 [P] Validate quickstart.md scenarios manually against the built binary

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (StructuredError)**: Depends on Phase 1 — **BLOCKS** all subsequent phases
- **Phase 3 (Context Resolution)**: Depends on Phase 2 (uses `*StructuredError`)
- **Phase 4 (Dry-Run)**: Depends on Phase 2 (uses `*StructuredError`); Phases 3 and 4 can run in parallel
- **Phase 5 (es refactor)**: Depends on Phases 2, 3, and 4 all complete
- **Phase 6 (Polish)**: Depends on Phase 5

### Parallel Opportunities

- T004 (context tests) and T006 (dry-run tests) can be written in parallel after T002/T003 complete
- T005 (context impl) and T007 (dry-run impl) can run in parallel
- T008+T009+T010 (get_run refactor) and T011+T012+T013 (api.go refactor) can run in parallel
- T014 and T015 (polish) can run in parallel

### Parallel Example: Phase 3 + 4

```
After T003 merges:
  Task A: T004 → T005  (context utility)
  Task B: T006 → T007  (dry-run utility)
Both can proceed concurrently.
```

---

## Implementation Strategy

### MVP (US1 + US2 first)

1. Phase 1: Setup (T001)
2. Phase 2: StructuredError (T002 → T003) ← **STOP, confirm tests green**
3. Phase 3: Context Resolution (T004 → T005) ← **STOP, confirm tests green**
4. **Validate independently**: `go test ./internal/cmdutil/...`

### Full Delivery

5. Phase 4: Dry-Run (T006 → T007)
6. Phase 5a: es list commands refactor (T008 → T009 → T010)
7. Phase 5b: es raw refactor (T011 → T012 → T013)
8. Phase 6: Polish (T014 → T018)

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 23 |
| Phase 2 (US1 — StructuredError + RenderError) | 4 tasks (T002, T003, T003a, T003b) |
| Phase 3 (US2 — Context Resolution) | 2 tasks |
| Phase 4 (US3 — Dry-Run) | 2 tasks |
| Phase 5 (US4 — es refactor) | 9 tasks (5a: T008–T010, 5b: T011–T013, 5c: T013a–T013c) |
| Phase 6 (Polish) | 5 tasks |
| Parallelizable [P] tasks | 7 |
| MVP scope | Phases 1–3 (T001–T005) |

**Format validation**: All tasks follow `- [ ] TXXX [P?] [US?] Description with file path` format. ✅
