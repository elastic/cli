# Research: Core Utilities — Constitutional Foundations

All items that could have been "NEEDS CLARIFICATION" were resolved through direct codebase inspection. No external research tasks were required.

---

## Decision: Package location for utilities

**Decision**: `internal/cmdutil/`
**Rationale**: Follows the project's existing `internal/` convention (config, client, output, telemetry all live there). The name `cmdutil` is clear, does not collide with the `cmd/` command package, and signals "reusable command-layer infrastructure."
**Alternatives considered**:
- `internal/util/` — too generic, doesn't communicate the command-layer domain
- `cmd/cmdutil/` — would be inside the `cmd` package, preventing use from `internal/` packages without import cycles

---

## Decision: StructuredError representation

**Decision**: A concrete Go struct implementing `error`, with exported `Code string` and `Message string` fields. Serialises to `{"error":{"code":"…","message":"…"}}` via a `MarshalJSON` method (or explicit marshal call at output site).
**Rationale**: Spec requires at minimum two fields; implementing `error` means it drops in wherever `error` is expected with no adapter. The `MarshalJSON` approach keeps serialisation logic inside the type, not scattered across output sites.
**Alternatives considered**:
- An interface type — adds indirection without benefit; the spec mentions a single concrete type
- Embedding in a wrapper struct at output time only — fragments the contract; harder to test in isolation

---

## Decision: Error code enumeration

**Decision**: Exported Go `const` string values in `cmdutil`:
```go
const (
    ErrCodeValidation         = "validation_failed"
    ErrCodeConfigNotFound     = "config_not_found"
    ErrCodeContextNotFound    = "context_not_found"
    ErrCodeDryRunNotSupported = "dry_run_not_supported"
)
```
**Rationale**: Spec FR-011 requires exported constants. `string` typed constants allow direct comparison and are idiomatic Go without requiring a custom type that would complicate `switch` statements or JSON serialisation.
**Alternatives considered**:
- Custom `type ErrorCode string` — cleaner type safety but requires casting at every call site; spec doesn't mandate it

---

## Decision: StructuredError idempotent wrap

**Decision**: `New(code, message string) *StructuredError` is the primary constructor. A `Wrap(err error, code, message string) *StructuredError` helper checks `errors.As(err, &StructuredError{})` before constructing; if the input is already a `*StructuredError`, it is returned unchanged.
**Rationale**: Spec FR-001 (amended) explicitly requires no double-wrapping.
**Alternatives considered**:
- Always wrapping — breaks the spec requirement and makes error code inspection unreliable

---

## Decision: Context resolution function signature

**Decision**:
```go
// ResolveContext loads the config from disk and returns the active context.
// contextFlag is the value of the --context flag (empty string = use current-context).
func ResolveContext(contextFlag string) (config.Context, error)
```
**Rationale**: Loads config internally (calls `config.DefaultPath()` + `config.Load()`) so callers have a true one-liner. Returns `config.Context` directly — the existing type that client constructors already accept.
**Alternatives considered**:
- Accepting a pre-loaded `config.Config` — forces callers to load config themselves, defeating the purpose
- Returning a new `ResolvedContext` wrapper type — unnecessary indirection; `config.Context` already carries all connection fields

---

## Decision: Dry-run utility design

**Decision**: `HandleDryRun(cmd *cobra.Command, format string) (bool, error)` — returns `(true, nil)` after printing the resolved payload and signalling the caller to exit 0, or `(false, nil)` if `--dry-run` was not set, or `(false, err)` on validation failure. The payload is derived from `cmd.Flags()` — iterating registered flags and printing their names + resolved values, filtered to non-default values.
**Rationale**: Spec FR-005 explicitly states no per-command payload type is needed; the utility derives output from the command's declared configuration. `cobra.Command.Flags()` provides that introspection. Returning a boolean "handled" signal keeps callers idiomatic: `if handled, err := cmdutil.HandleDryRun(cmd, format); handled || err != nil { return err }`.
**Alternatives considered**:
- A middleware/wrapper approach wrapping `RunE` — cleaner but requires refactoring every command's declaration site; the function approach is a zero-friction opt-in
- Requiring each command to pass a payload struct — contradicts spec design decision

---

## Decision: Which es-family commands to refactor

**Decision**: All five es-family command entry points:
1. `es indices list` (via `runGet` in `get_run.go`)
2. `es data-streams list` (via `runGet`)
3. `es remote-clusters list` (via `runGet`)
4. `es cluster health` (via `runGet`)
5. `es raw` (the `newRawCmd("es")` instance in `api.go`)

**Rationale**: The user input explicitly states "refactor ONLY the `es` family of subcommands." All five share the duplicated context-resolution block. `runGet` handles cases 1–4 so refactoring it benefits all four at once. `es raw` is a separate code path in `api.go`.
**Alternatives considered**:
- Refactoring a single simpler command (e.g. `es cluster health`) — would satisfy the spec's original "one command" intent but the user input now requests the full `es` family

---

## Decision: Dry-run applicability to es-family read commands

**Decision**: `es indices list`, `es data-streams list`, `es remote-clusters list`, and `es cluster health` are read-only (GET) commands. Per spec edge case "Resolved": if `--dry-run` is somehow passed to a command that does not register the flag, it MUST return `dry_run_not_supported`. Since these commands will not register `--dry-run` (they're read-only), `HandleDryRun` will detect the flag is absent via `cmd.Flags().Lookup("dry-run") == nil` and return an appropriate `StructuredError`. `es raw` performs mutations (it accepts any HTTP method) so it WILL register `--dry-run`.
**Alternatives considered**:
- Adding `--dry-run` to all es commands — over-engineering for read-only operations; the spec says "every command that performs a mutation or network call"; read-only list commands arguably fall under "network call" but the pragmatic split is mutation vs. read

> **Note**: Constitution Principle III says "every command that performs a mutation or network call MUST support `--dry-run`". The list commands do make network calls. Tasks will include a decision point to register `--dry-run` on list commands too, printing the resolved ES query parameters as the dry-run payload. This is consistent and removes an awkward special-case.
