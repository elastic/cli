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

- [x] T001 Create package directory and blank files: `internal/cmdutil/errors.go`, `internal/cmdutil/context.go`, `internal/cmdutil/dryrun.go`, `internal/cmdutil/render.go`

---

## Phase 2: Foundational — StructuredError (US1, blocks everything)

**Purpose**: The `StructuredError` type is the lowest-level primitive. Every other utility and the `es` refactor depends on it. Complete and green before proceeding.

**Goal**: `internal/cmdutil` exports `StructuredError`, `ErrCode*` constants, `NewStructuredError`, `WrapError`, and `RenderError`. Implements `error`. Marshals to `{"error":{"code":"…","message":"…"}}`.

**Independent Test**: `go test ./internal/cmdutil/... -run TestStructuredError` — all assertions green; `WrapError` idempotency confirmed; JSON shape validated.

- [x] T002 [US1] Write failing tests for `StructuredError`, `NewStructuredError`, `WrapError`, and JSON marshal in `internal/cmdutil/errors_test.go`
- [x] T003 [US1] Implement `StructuredError` type, `ErrCode*` constants, `NewStructuredError`, and `WrapError` in `internal/cmdutil/errors.go`
- [x] T003a [P] [US1] Write failing tests for `RenderError` in `internal/cmdutil/render_test.go` covering: JSON format output, table/plain text output, plain Go error fallback (non-`StructuredError`)
- [x] T003b [US1] Implement `RenderError` in `internal/cmdutil/render.go`

**Checkpoint**: `go test ./internal/cmdutil/... -run TestStructuredError` passes. All `ErrCode*` constants exist and are used in tests.

---

## Phase 3: User Story 2 — Context Resolution Utility (P1)

**Goal**: `cmdutil.ResolveContext(cfgPath, ctxFlag string) (config.Context, error)` replaces the duplicated context-resolution block found in `cmd/get_run.go`, `cmd/api.go`, and `cmd/esql.go`.

**Independent Test**: `go test ./internal/cmdutil/... -run TestResolveContext` — all table-driven cases pass with a temporary config file; no Elasticsearch connection required.

- [x] T004 [P] [US2] Write failing unit tests for `ResolveContext` covering: valid context, `--context` override, missing config file (`ErrCodeConfigNotFound`), missing context (`ErrCodeContextNotFound`), empty current-context (`ErrCodeNoContextSelected`) in `internal/cmdutil/context_test.go`
- [x] T005 [US2] Implement `ResolveContext` in `internal/cmdutil/context.go`

**Checkpoint**: `go test ./internal/cmdutil/... -run TestResolveContext` passes with ≥80% coverage.

---

## Phase 4: User Story 3 — Dry-Run Utility (P2)

**Goal**: `cmdutil.HandleDryRun(cmd *cobra.Command, format string, args []string) (bool, error)` implements dry-run detection, payload printing, and the `dry_run_not_supported` error for commands that don't register the flag.

**Independent Test**: `go test ./internal/cmdutil/... -run TestHandleDryRun` — flag-not-registered, flag-not-set, flag-set-table-output, flag-set-json-output cases all pass.

- [x] T006 [P] [US3] Write failing unit tests for `HandleDryRun` in `internal/cmdutil/dryrun_test.go` covering: flag not registered → `ErrCodeDryRunNotSupported`; flag registered but not set → `(false, nil)`; flag set with table format → prints payload, returns `(true, nil)`; flag set with JSON format → JSON payload
- [x] T007 [US3] Implement `HandleDryRun` in `internal/cmdutil/dryrun.go`

**Checkpoint**: `go test ./internal/cmdutil/... -run TestHandleDryRun` passes. `go test ./internal/cmdutil/... -cover` reports ≥80% statement coverage.

---

## Phase 5: User Story 4 — Refactor `es` Family to Use All Utilities (P2)

**Goal**: All six `es` subcommand entry points use `cmdutil.ResolveContext`, emit `*StructuredError` on failure, and register/support `--dry-run` via `cmdutil.HandleDryRun`. No duplicated context-resolution blocks remain. Existing behaviour is preserved.

**Independent Test**: `go test ./cmd/... ./internal/cmdutil/... -run TestES` passes with no regression; new tests cover error paths and dry-run paths; `go test ./... -race` is clean.

### 5a — `get_run.go` (`es indices list`, `es data-streams list`, `es remote-clusters list`, `es cluster health`)

- [x] T008 [P] [US4] Write failing tests for refactored `runGet` in `cmd/es_resources_test.go`: `ResolveContext` error propagation (mock config path), dry-run path for each list command (valid + invalid inputs)
- [x] T009 [US4] Refactor `runGet` in `cmd/get_run.go` to call `cmdutil.ResolveContext(cfgPath, rootContext)` in place of the inline config-load-and-resolve block; P3
- [x] T010 [US4] Register `--dry-run` on `esIndicesListCmd`, `esDataStreamsListCmd`, `esRemoteClustersListCmd`, and `esClusterHealthCmd` in `cmd/es_resources.go`; add `cmdutil.HandleDryRun` call at the start of each `RunE`

### 5b — `api.go` (`es raw`)

- [x] T011 P2 `newRawCmd("es")` in `cmd/api_test.go`: P3 with valid flags, dry-run with `--format=json`
- [x] T012 [US4] Refactor the context-resolution block in `newRawCmd` in `cmd/api.go` to call `cmdutil.ResolveContext(cfgPath, rootContext)`; P3
- [x] T013 [US4] Register `--dry-run` on `esRawCmd` in `cmd/api.go`; add `cmdutil.HandleDryRun` call at the start of `RunE`

### 5c — `esql.go` (`es query`)

- [x] T014 [P] [US4] Write failing tests for refactored `esql.go` `RunE` in `cmd/esql_test.go`: `ResolveContext` error propagation (mock config path), dry-run with valid flags, dry-run with `--format=json`
- [x] T015 [US4] Refactor the context-resolution block in `cmd/esql.go` `RunE` to call `cmdutil.ResolveContext(cfgPath, rootContext)`; P3
- [x] T016 [US4] Register `--dry-run` on `esqlCmd` in `cmd/esql.go`; add `cmdutil.HandleDryRun` call at the start of `RunE`

**Checkpoint**: `go test ./cmd/... ./internal/cmdutil/...` passes with no regression. `go test ./... -race` is clean. No inline context-resolution block remains in `cmd/get_run.go`, `cmd/api.go`, or `cmd/esql.go`.

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: Doc comments, coverage gate, final suite validation.

- [x] T017 [P] Add Go doc comments to all exported symbols in `internal/cmdutil/errors.go`, `internal/cmdutil/context.go`, `internal/cmdutil/dryrun.go`, `internal/cmdutil/render.go`
- [x] T018 [P] Verify `go test ./internal/cmdutil/... -cover` reports ≥80% statement coverage; add targeted tests to `internal/cmdutil/` if needed
- [x] T019 Run `go test ./... -race` and confirm clean
- [x] T020 Run `go vet ./...` and `golangci-lint run` (if configured) and fix any findings
- [x] T021 [P] Validate `quickstart.md` scenarios manually against the built binary

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start now
- **Phase 2 (StructuredError + RenderError)**: Depends on Phase 1 — **BLOCKS** all subsequent phases
- **Phase 3 (Context Resolution)**: Depends on Phase 2 (uses `*StructuredError`)
- **Phase 4 (Dry-Run)**: Depends on Phase 2 (uses `*StructuredError`); Phases 3 and 4 can run in parallel after Phase 2
- **Phase 5 (es refactor)**: Depends on Phases 2, 3, and 4 all complete
- **Phase 6 (Polish)**: Depends on Phase 5

### User Story Dependencies

- **US1 (Phase 2)**: No story dependencies — foundational, blocks all others
- **US2 (Phase 3)**: Depends on US1 only
- **US3 (Phase 4)**: Depends on US1 only; can run in parallel with US2
- **US4 (Phase 5)**: Depends on US1 + US2 + US3 all complete

### Parallel Opportunities

- T003a (render tests) can be written alongside T003 (errors impl) — different files
- T004 (context tests) and T006 (dry-run tests) can be written in parallel after Phase 2 completes
- T005 (context impl) and T007 (dry-run impl) can run in parallel
- T008+T009+T010 (get_run refactor), T011+T012+T013 (api.go refactor), and T014+T015+T016 (esql.go refactor) can run in parallel
- T017 and T018 (polish) can run in parallel

### Parallel Example: Phases 3 + 4

```
After T003b merges:
  Task A: T004 → T005  (context resolution utility)
  Task B: T006 → T007  (dry-run utility)
Both can proceed concurrently.
```

### Parallel Example: Phase 5 sub-groups

```
After T007 merges:
  Task A: T008 → T009 → T010  (get_run.go — four list commands)
  Task B: T011 → T012 → T013  (api.go — es raw)
  Task C: T014 → T015 → T016  (esql.go — es query)
All three can proceed concurrently.
```

---

## Implementation Strategy

### MVP (US1 + US2 first)

1. Phase 1: Setup (T001) ✅
2. Phase 2: StructuredError + RenderError (T002 → T003b) ✅
3. Phase 3: Context Resolution (T004 → T005) ✅
4. **Validate independently**: `go test ./internal/cmdutil/...`

### Full Delivery

5. Phase 4: Dry-Run (T006 → T007)
6. Phase 5a+b+c: es command refactors (T008–T016, parallelizable)
7. Phase 6: Polish (T017–T021)

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 21 |
| Completed | 9 (T001–T007, T003a, T003b) |
| Remaining | 12 (T008–T021) |
| Phase 2 (US1 — StructuredError + RenderError) | 4 tasks ✅ |
| Phase 3 (US2 — Context Resolution) | 2 tasks ✅ |
| Phase 4 (US3 — Dry-Run) | 2 tasks ✅ |
| Phase 5 (US4 — es refactor, 3 sub-groups) | 9 tasks |
| Phase 6 (Polish) | 5 tasks |
| Parallelizable [P] tasks | 9 |
| MVP scope | Phases 1–3 (T001–T005) |

**Format validation**: All tasks follow `- [ ] T### [P?] [US?] Description with file path` ✅
