# Tasks: JSON Input via Stdin and --file Flag

**Branch**: `002-json-stdin-flag-input`
**Input**: `specs/002-json-stdin-flag-input/spec.md`
**Codebase**: Go 1.25.3 · Cobra · `go test` · single-project layout

**TDD is mandatory** per the project constitution. Every implementation task has a
preceding test task. Confirm the test **fails** before writing implementation code.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (independent file, no incomplete dependencies)
- **[Story]**: maps to user story in spec.md (US1 = stdin, US2 = --file, US3 = conflict)

---

## Phase 1: Setup

No scaffolding required — this is a pure additive change to an existing Go package.

---

## Phase 2: Foundational — Extend RunContext

**Purpose**: Add the `Body []byte` field to `RunContext`. All three user stories
depend on this field existing before any input-reading logic can be implemented or tested.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T001 Write a failing test asserting that `RunContext` exposes a `Body []byte` field and that it is nil when the handler is invoked with no input configured, in `internal/factory/factory_test.go`
- [x] T002 Add `Body []byte` field to the `RunContext` struct in `internal/factory/factory.go` — confirm T001 is now green

**Checkpoint**: `go test ./internal/factory/...` passes. `RunContext.Body` exists and is nil by default.

---

## Phase 3: User Story 1 — Pipe JSON from stdin (Priority: P1) 🎯 MVP

**Goal**: When a user pipes data into a factory-created command, the handler receives
the payload as `Body []byte`. When stdin is an interactive TTY or empty, `Body` is nil
and the command succeeds.

**Independent Test**: `echo '{"x":1}' | go run . version` — handler receives non-nil `Body`.

### Tests for User Story 1

> **Write these tests first. Confirm they FAIL before T004.**

- [x] T003 [US1] Write failing tests for stdin body population in `internal/factory/factory_test.go`:
  - given a reader with JSON bytes injected as stdin, handler receives non-nil `Body` equal to those bytes
  - given stdin is a TTY (no injected reader), `Body` is nil and command succeeds
  - given an injected reader with zero bytes, `Body` is nil and command succeeds
  - Note: use `cmd.SetIn(r)` to inject a `bytes.Buffer` or `strings.NewReader`; implement TTY detection in `New()` by checking whether the reader is an `*os.File` with `ModeCharDevice` set — any non-`*os.File` reader (e.g. a buffer) is treated as a pipe

### Implementation for User Story 1

- [x] T004 [US1] Implement stdin detection and reading in `New()` in `internal/factory/factory.go`:
  - call `cmd.InOrStdin()` to get the active reader (supports test injection via `cmd.SetIn`)
  - if the reader is an `*os.File`, use `file.Stat()` to check `os.ModeCharDevice`; if set, treat as TTY (skip reading)
  - if the reader is any other type, treat as a pipe and read all bytes with `io.ReadAll`
  - if the result is zero bytes, set `ctx.Body = nil`; otherwise set `ctx.Body` to the bytes read
  - confirm T003 tests are now green

**Checkpoint**: `go test ./internal/factory/...` passes. Stdin piping works end-to-end.

---

## Phase 4: User Story 2 — Pass JSON via --file flag (Priority: P2)

**Goal**: When `--file <path>` is provided, the handler receives the file's contents
as `Body []byte`. Missing or unreadable files produce an error before the handler runs.
An empty file yields nil body with no error.

**Independent Test**: `go run . version --file ./testdata/payload.json` — handler receives file bytes.

### Tests for User Story 2

> **Write these tests first. Confirm they FAIL before T006.**

- [x] T005 [US2] Write failing tests for `--file` flag behaviour in `internal/factory/factory_test.go`:
  - given `--file` pointing to a file with content, `Body` equals the file bytes
  - given `--file` pointing to a non-existent path, command returns an error and handler is not called
  - given `--file` pointing to a file with no read permission, command returns an error and handler is not called
  - given `--file` pointing to a zero-byte file, `Body` is nil and command succeeds

### Implementation for User Story 2

- [x] T006 [US2] Register the `--file` flag and implement file reading in `New()` in `internal/factory/factory.go`:
  - register `cmd.Flags().String("file", "", "Path to a JSON file to use as request body")` so every factory-created command has it automatically
  - in `RunE`, if the flag value is non-empty: call `os.ReadFile(path)`; on error return it immediately (before handler); if result is zero bytes set `Body = nil`; otherwise set `Body` to the bytes read
  - confirm T005 tests are now green

**Checkpoint**: `go test ./internal/factory/...` passes. `--file` flag works end-to-end.

---

## Phase 5: User Story 3 — Error when both sources are provided (Priority: P3)

**Goal**: When both piped stdin and `--file` provide data simultaneously, the command
returns a clear error before invoking the handler.

**Independent Test**: `echo '{}' | go run . version --file payload.json` — exits non-zero with message about single input source.

### Tests for User Story 3

> **Write this test first. Confirm it FAILS before T008.**

- [x] T007 [US3] Write a failing test for the dual-source conflict in `internal/factory/factory_test.go`:
  - given both an injected non-empty stdin reader and `--file` pointing to a non-empty file, command returns an error and handler is not called
  - error message must indicate that only one input source may be used at a time

### Implementation for User Story 3

- [x] T008 [US3] Implement conflict detection in `New()` in `internal/factory/factory.go`:
  - after reading both sources (or determining which are active), if stdin is a non-TTY pipe with bytes AND `--file` is also set with bytes, return an error: `"cannot use both stdin and --file as input; provide only one"`
  - error is returned before the handler is invoked
  - confirm T007 test is now green

**Checkpoint**: `go test ./internal/factory/...` passes. All three user stories are independently functional.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T009 [P] Update exported godoc on `RunContext.Body` and the updated `New()` function signature comment in `internal/factory/factory.go`
- [x] T010 [P] Review `internal/factory/factorytest/helpers.go` — update any helpers or add new ones if tests in T003/T005/T007 introduced patterns worth sharing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start here
- **US1 (Phase 3)**: Depends on Phase 2 (`RunContext.Body` must exist)
- **US2 (Phase 4)**: Depends on Phase 2; independent of US1
- **US3 (Phase 5)**: Depends on Phase 2; requires US1 stdin detection and US2 `--file` flag to both be present (implement after Phase 3 and 4)
- **Polish (Final)**: Depends on all story phases being green

### User Story Dependencies

- **US1**: can start immediately after Foundational
- **US2**: can start immediately after Foundational; independent of US1
- **US3**: depends on US1 and US2 (conflict detection requires both input paths to exist)

### Within Each User Story

- Test task MUST be written and confirmed failing before implementation task
- All changes within a story touch `internal/factory/factory.go` and `internal/factory/factory_test.go` — only one story should be in flight at a time to avoid merge conflicts

---

## Parallel Example: Foundational phase

```bash
# T001 and T002 are strictly sequential (test → implement)
Task: "T001 — write failing Body field test"
# confirm failure
Task: "T002 — add Body []byte to RunContext"
# confirm green
```

## Parallel Example: Polish phase

```bash
# T009 and T010 touch different files — can run simultaneously
Task: "T009 — update godoc in internal/factory/factory.go"
Task: "T010 — review factorytest helpers in internal/factory/factorytest/helpers.go"
```

---

## Implementation Strategy

### MVP (US1 only)

1. Complete Phase 2: Foundational
2. Complete Phase 3: US1 (stdin)
3. **STOP and VALIDATE**: `echo '{"x":1}' | go test ./...`
4. Handlers now receive piped JSON — this alone satisfies the primary agent-pipeline use case

### Incremental Delivery

1. Phase 2 → foundation ready
2. Phase 3 (US1) → stdin works → MVP
3. Phase 4 (US2) → `--file` works → full file-based input
4. Phase 5 (US3) → conflict guard → safe for production scripting
5. Final phase → polish

---

## Notes

- All implementation is contained in `internal/factory/` — no new packages or files needed
- No new external dependencies; stdlib only (`io`, `os`)
- `cmd.InOrStdin()` + `cmd.SetIn()` is the key pattern enabling stdin injection in tests without touching `os.Stdin`
- The `--file` flag is registered in `New()` so every factory-created command inherits it automatically — no per-command changes required
