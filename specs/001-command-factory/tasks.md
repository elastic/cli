# Tasks: Command Factory with Config Loading

**Input**: Design documents from `/specs/001-command-factory/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/go-api.md ✓

**TDD discipline**: Every implementation task is preceded by a failing-test task.
Write the test, confirm it fails for the right reason, then implement. Do not skip ahead.

**Organization**: Tasks are grouped by user story to enable independent implementation
and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies at that moment)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every task description

---

## Phase 1: Setup

**Purpose**: Add the one required dependency and create the package skeleton.
No business logic yet — just scaffolding.

- [X] T001 Add `gopkg.in/yaml.v3` to go.mod and go.sum via `go get gopkg.in/yaml.v3`
- [X] T002 [P] Create `internal/factory/` package with stub files: `factory.go`, `config.go`, `path.go` each containing only `package factory`

**Checkpoint**: `go build ./...` passes with the new package present.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config types, path resolution, and config loading — required by every
user story. No user story work can begin until this phase is complete.

**⚠️ CRITICAL**: Complete and verify both sub-tracks before advancing to Phase 3.

### Track A — Config path resolution (`internal/factory/path.go`)

- [X] T003 Write failing tests for unexported `resolveConfigPath()` in `internal/factory/path_test.go`. Accept a `goos` string parameter to make OS logic testable without build tags. Test cases: (1) `$ELASTIC_CONFIG` set + file exists → returns that path; (2) `$ELASTIC_CONFIG` set + file missing → returns error containing `"$ELASTIC_CONFIG path not found"`; (3) `$ELASTIC_CONFIG` set + file exists but unreadable (chmod 000) → returns the path (readability is checked later by `Load()`); (4) `$XDG_CONFIG_HOME` set → returns `$XDG_CONFIG_HOME/elastic/config.yml`; (5) neither env var set → returns `~/.config/elastic/config.yml` (use `os.UserHomeDir()` expected value); (6) `goos == "windows"` + `APPDATA` set → returns `%APPDATA%\elastic\config.yml`; (7) `goos == "windows"` + `APPDATA` empty → returns error. Confirm all tests fail: `go test ./internal/factory/ -run TestResolveConfigPath`
- [X] T004 Implement unexported `resolveConfigPath(goos string) (string, error)` in `internal/factory/path.go` using `os.Getenv`, `os.UserHomeDir`, `os.Stat`, and `filepath.Join`. `$ELASTIC_CONFIG` takes precedence; when set, `os.Stat` the path and return a hard error if not found. Pass all T003 tests.

### Track B — Config struct and loading (`internal/factory/config.go`)  *(can run parallel to Track A)*

- [X] T005 [P] Write failing tests in `internal/factory/config_test.go` covering: (1) `Config`, `Context`, `ElasticsearchConfig` struct YAML unmarshalling with the example config from data-model.md (two contexts: basic auth + api_key); (2) `defaultConfig()` returns `Config` with non-nil empty `Contexts` map; (3) `Load(path)` with valid YAML file → returns populated `Config`; (4) `Load(path)` with empty file → returns `defaultConfig()` values; (5) `Load(path)` with malformed YAML → returns error containing the file path; (6) `Load(path)` with valid YAML containing unknown fields → no error, unknown fields ignored; (7) `Load(path)` with non-existent path → returns `defaultConfig()` values and no error (missing file = use defaults); (8) `Load(path)` with unreadable file (chmod 000 on a real file) → returns error containing the file path and "permission denied" (FR-007); (9) `AuthMode()` returns `"basic"` when both username and password are set; (10) `AuthMode()` returns `"api_key"` when api_key is set; (11) `AuthMode()` returns `"none"` when no credentials are set; (12) `AuthMode()` returns error when both basic auth and api_key are set; (13) **REVISED**: `AuthMode()` returns `"none"` (not error) when only one of username/password is set — auth is optional, partial credentials fall back to none. Confirm all tests fail: `go test ./internal/factory/ -run TestConfig -run TestLoad -run TestAuthMode`
- [X] T006 [P] Implement in `internal/factory/config.go`: exported types `Config` (with `CurrentContext string` and `Contexts map[string]Context`), `Context` (with `Elasticsearch ElasticsearchConfig`), and `ElasticsearchConfig` (with `URL`, `Username`, `Password`, `APIKey`) — all with yaml struct tags per data-model.md. Implement unexported `defaultConfig()` returning a `Config` with initialized empty map. Implement exported `Load(path string) (Config, error)` that: reads the file with `os.ReadFile`, returns `defaultConfig()` silently if `os.IsNotExist`, returns a wrapped error for any other read failure (FR-007: permission denied), unmarshals YAML onto a pre-populated `defaultConfig()` value (FR-005: missing fields keep defaults, FR-008: unknown fields silently ignored via default yaml.v3 behavior), and returns a wrapped error with file path on parse failure (FR-006). Implement `ElasticsearchConfig.AuthMode() (string, error)`: **REVISED** — authentication is optional; partial credentials (username without password or vice versa) return `("none", nil)` instead of an error. Only a full conflict (both basic credentials and api_key set simultaneously) returns an error. Pass all T005 tests.

**Checkpoint**: `go test ./internal/factory/` passes for all path and config tests.
Foundation complete — user story phases can now begin.

---

## Phase 3: User Story 1 — Define a new CLI subcommand using the factory (Priority: P1) 🎯 MVP

**Goal**: A CLI developer calls `factory.New(name, desc, runFunc)` and gets back a
fully wired `*cobra.Command` that populates `RunContext` and calls the handler.

**Independent Test**: `go test ./internal/factory/ -run TestNew` passes; a manually
invoked command prints output proving `RunContext.Config` and `RunContext.ConfigPath`
are populated.

- [X] T007 [US1] Write failing tests for `New()` in `internal/factory/factory_test.go`. Use `$ELASTIC_CONFIG` pointing at temp config files to control path resolution in tests. Test cases: (1) command has correct `Use` and `Short` fields matching the name and description passed to `New()`; (2) executing the command calls the handler exactly once; (3) `RunContext.Config` matches the config loaded from the temp file; (4) `RunContext.ConfigPath` equals the temp file path; (5) an error returned from the handler propagates as the command's `RunE` error; (6) two commands produced by `New()` with different names, both executed against the same `$ELASTIC_CONFIG` file, both receive identical `RunContext.Config` values (US1 acceptance scenario 3: multiple subcommands, same config source). Confirm all tests fail.
- [X] T008 [US1] Implement in `internal/factory/factory.go`: exported type `RunFunc func(ctx RunContext) error`; exported struct `RunContext` with fields `Config Config`, `ConfigPath string`, `ActiveContext string` (doc comments per contracts/go-api.md); exported function `New(name, description string, run RunFunc) *cobra.Command` that creates a `*cobra.Command` with `Use: name`, `Short: description`, and a `RunE` function that calls `resolveConfigPath(runtime.GOOS)` → `Load(path)` → populates `RunContext` → calls `run(ctx)` → returns error. On missing file (empty path after `Load` returns defaults), set `ConfigPath` to `""`. Pass all T007 tests.
- [X] T009 [US1] Update `cmd/root.go`: set `SilenceUsage: true` and `SilenceErrors: true` on `rootCmd` (prevents Cobra from printing usage on RunE errors — config/context errors should show the error message only, not help text). Add `--context` persistent flag (`""` default) via `rootCmd.PersistentFlags().StringVar()`. Register one example factory-produced subcommand (e.g., `factory.New("version", "Print version info", ...)`) via `rootCmd.AddCommand()` to prove the wiring compiles and runs. Update the `Execute()` error output to `fmt.Fprintf(os.Stderr, "Error: %s\n", err)` (clean format for agent and human consumption).
- [X] T010 [US1] Add tests to `cmd/root_test.go`: (1) `rootCmd.PersistentFlags().Lookup("context")` is non-nil; (2) factory-produced command is present in `rootCmd.Commands()`; (3) `rootCmd.SilenceUsage` is `true`; (4) `rootCmd.SilenceErrors` is `true`.

**Checkpoint**: `go test ./...` passes. `go run main.go version` executes without error.

---

## Phase 4: User Story 2 — CLI works gracefully when no config file exists (Priority: P1)

**Goal**: A user with no config file runs any factory-produced command and it
succeeds, with the handler receiving a zero-value `Config` and an empty `ConfigPath`.

**Independent Test**: Run a factory-produced command after unsetting all config env
vars and with no config file present — exits 0 with no error output.

- [X] T011 [US2] Add tests to `internal/factory/factory_test.go`: (1) set `$ELASTIC_CONFIG` to a path inside an empty temp dir (file does not exist — but wait, `$ELASTIC_CONFIG` not-found is a hard error). Instead: unset `$ELASTIC_CONFIG`, set `$XDG_CONFIG_HOME` to an empty temp dir (no `elastic/config.yml` inside), call `New()` and execute the produced command → handler is called, `ctx.Config` equals `defaultConfig()`, `ctx.ConfigPath` is `""`, no error returned. (2) Unset both `$ELASTIC_CONFIG` and `$XDG_CONFIG_HOME`, set `$HOME` to a temp dir with no `.config/elastic/config.yml` → same assertions: handler called, defaults used, no error. Confirm tests pass (should be green if T008 correctly handles missing files) or fail for a specific reason to fix.
- [X] T012 [US2] Review and verify `internal/factory/factory.go` handles the no-file path correctly: `resolveConfigPath()` returns a path that doesn't exist → `Load()` gets `os.IsNotExist` → returns `defaultConfig()` + nil error → `New()` sets `ConfigPath = ""`. If any step doesn't work as expected, fix it. Ensure that only `os.IsNotExist` triggers silent fallback; all other read errors (permission denied, I/O failure) propagate as wrapped errors. Run `go test ./internal/factory/ -run TestNew` to confirm all existing tests still pass.

**Checkpoint**: `go test ./internal/factory/` passes including the no-config-file scenarios.

---

## Phase 5: User Story 3 — User customizes CLI behavior via config file (Priority: P2)

**Goal**: A user's config file values are visible in `RunContext.Config` when a
factory-produced command runs. Partially-set fields fall back to defaults.

**Independent Test**: Write a config file to a temp path, set `$ELASTIC_CONFIG` to
it, run a factory-produced command, verify handler receives the custom values.

- [X] T013 [US3] Add tests to `internal/factory/factory_test.go`: (1) write a temp config file with `current_context: dev` and a `dev` context containing `elasticsearch.url: http://localhost:9200` + `elasticsearch.api_key: test123`; set `$ELASTIC_CONFIG` to the temp file; execute a factory command → assert `ctx.Config.CurrentContext == "dev"`, `ctx.Config.Contexts["dev"].Elasticsearch.URL == "http://localhost:9200"`, `ctx.Config.Contexts["dev"].Elasticsearch.APIKey == "test123"`. (2) Write a temp config file with only `current_context: minimal` and a `minimal` context with only `elasticsearch.url` set; execute → assert `ctx.Config.Contexts["minimal"].Elasticsearch.Username == ""` and `ctx.Config.Contexts["minimal"].Elasticsearch.Password == ""` (missing fields fall back to zero-value defaults). (3) Write a temp config file with two contexts (`prod` and `dev`); execute → assert both contexts are present in `ctx.Config.Contexts` with correct values. Confirm all tests pass (implementation should be complete from T008).
- [X] T014 [US3] No fixes required — all T013 tests passed on first run. The `New()` → `resolveConfigPath()` → `Load()` → `RunContext` pipeline correctly overlays YAML onto `defaultConfig()`, so absent fields retain zero-value defaults and present fields are set as expected.

**Checkpoint**: `go test ./internal/factory/ -run TestNew` passes including custom-config scenarios.

---

## Phase 6: User Story 4 — Factory design supports future extensibility (Priority: P2)

**Goal**: `--context=<name>` overrides `current_context` for one invocation.
`RunContext.ActiveContext` is always the resolved context name.
Unknown context name → hard error listing available contexts.
The `RunContext` struct is the documented extension point for future concerns.

**Independent Test**: `go run main.go version --context=nonexistent` exits non-zero
with a message listing available context names.

- [X] T015 [US4] Write failing tests in `internal/factory/factory_test.go` for context resolution. Create a temp config file with `current_context: prod` and two contexts `prod` and `dev`. Register the `--context` flag on the test command's root (or use `cmd.Root().PersistentFlags()`). Test cases: (1) `--context=dev` → `ctx.ActiveContext == "dev"` regardless of `current_context`; (2) `--context` not set (empty) → `ctx.ActiveContext == "prod"` (falls back to `current_context`); (3) `--context=missing` → command returns error containing `"not found"` and containing `"prod"` and `"dev"` (lists available contexts); (4) no config file + `--context` not set → `ctx.ActiveContext == ""` (empty is valid when no config exists); (5) no config file + `--context=anything` → error because there are no contexts to validate against. Confirm tests fail.
- [X] T016 [US4] Implement context resolution in `New()`'s `RunE` in `internal/factory/factory.go`, after config loading and before calling the handler: read the `--context` flag via `cmd.Root().PersistentFlags().Lookup("context")` (Lookup is nil-safe); if non-empty, validate the name exists in `cfg.Contexts` — if not found, return `contextNotFoundError()` which lists sorted available names (or "no contexts are configured" when the map is empty); if found, set `ctx.ActiveContext = name`; if the flag is empty, set `ctx.ActiveContext = cfg.CurrentContext`. Pass all T015 tests.
- [X] T017 [P] [US4] Add integration test to `cmd/root_test.go`: set `$ELASTIC_CONFIG` to a temp config file with known contexts; execute `rootCmd` with args `["version", "--context=bogus"]`; assert the error output contains `"not found"`, confirming the `--context` flag flows from `cmd/root.go` through to factory context resolution.

**Checkpoint**: `go test ./...` passes. `RunContext.ActiveContext` is set correctly for
all cases: flag set to valid name, flag empty, flag set to invalid name, no config file.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Exported symbol documentation, race detection, final validation.

- [X] T018 Add Go doc comments to all exported symbols in `internal/factory/factory.go` and `internal/factory/config.go` (`path.go` has only unexported symbols). Added field-level doc to `Config`, `Context`, and `ElasticsearchConfig`; expanded `New`'s comment to cover the full resolution pipeline and error conditions per contracts/go-api.md. `AuthMode` was previously removed and is not documented.
- [X] T019 `go test -race ./...` and `go vet ./...` both pass with zero warnings or race conditions.
- [X] T020 `just build`, `just test`, and `just lint` all pass. Smoke-tested `./bin/elastic version` under three conditions: (1) no config file — exits 0; (2) valid config file at `$ELASTIC_CONFIG` with `--context=dev` — exits 0; (3) `--context=nonexistent` — exits 1 with `Error: context "nonexistent" not found; available: dev`.

**Checkpoint**: `just test`, `just lint`, and `just build` all pass. Binary produces correct output for all manual smoke tests.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) — Track A and Track B run in parallel
    │  (BLOCKS everything below)
    ▼
Phase 3 (US1, P1) ──► Phase 4 (US2, P1)
    │
    ▼
Phase 5 (US3, P2)
    │
    ▼
Phase 6 (US4, P2)
    │
    ▼
Phase 7 (Polish)
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. No dependency on other user stories.
- **US2 (P1)**: Depends on US1 — adds no-config-file tests to the factory pipeline built in US1.
- **US3 (P2)**: Depends on US1 + US2 — adds config-value assertions to existing factory pipeline.
- **US4 (P2)**: Depends on US1 — adds `--context` resolution layer to `New()`.

### Within Each Phase

1. Write failing test(s) → confirm failure
2. Implement to pass tests
3. Refactor under green
4. `go test ./...` before advancing

---

## Parallel Opportunities

### Phase 2 (Foundational)

```
T003 Write path_test.go          T005 [P] Write config_test.go
T004 Implement path.go      ──   T006 [P] Implement config.go
```

Both tracks target different files with no shared state.

### Phase 3 (US1)

```
T007 → T008  (factory_test.go → factory.go)
T009 → T010  (cmd/root.go → cmd/root_test.go) — can overlap with T007/T008
              since they target different packages
```

### Phase 7 (Polish)

T018, T019, T020 all target different concerns — all three can run in parallel.

---

## Parallel Example: Phase 2

```
# Start both tracks simultaneously:
Task T003: "Write failing tests for resolveConfigPath() in internal/factory/path_test.go"
Task T005: "Write failing tests for Config/Load/AuthMode in internal/factory/config_test.go"

# Once both test files exist and fail correctly:
Task T004: "Implement resolveConfigPath() in internal/factory/path.go"
Task T006: "Implement Config structs, Load(), AuthMode() in internal/factory/config.go"
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 only)

1. Phase 1: Setup
2. Phase 2: Foundational (both tracks)
3. Phase 3: US1 — factory exists and works
4. Phase 4: US2 — missing file is graceful
5. **STOP and validate**: `go test ./...` passes; binary runs without config file
6. Demo: `./bin/elastic version` works on a machine with no config file

### Incremental Delivery

1. Setup + Foundational → types and path resolution available
2. US1 + US2 (P1) → MVP: factory works, no-config graceful → ship
3. US3 (P2) → custom config values → ship
4. US4 (P2) → `--context` override → ship
5. Polish → docstrings, race tests, clean errors → merge to main

---

## Notes

- `[P]` tasks target different files — safe to parallelize
- TDD is non-negotiable (Constitution V): never write impl before a failing test
- `internal/factory/` is inaccessible outside the module — correct for CLI plumbing
- `resolveConfigPath()` is **unexported** — it is internal to the factory package, called only by `New()`
- `cmd/root.go` is the only place `--context` flag is registered; factory reads it at execution time via `cmd.Root().PersistentFlags().GetString("context")`
- `$ELASTIC_CONFIG` not-found → hard error (not silent fallback) — test this explicitly in T003
- `$ELASTIC_CONFIG` set + file unreadable → resolveConfigPath returns the path; `Load()` returns a permission error — test in T005
- `AuthMode()` is called in handler, not in `Load()` — keeping load and validate separate
- `Load()` on `os.IsNotExist` → returns `defaultConfig()` silently; any other read error → returns wrapped error (FR-007)
- `SilenceUsage: true` and `SilenceErrors: true` added to rootCmd in T009 so config/context errors show only the error message, not help text
