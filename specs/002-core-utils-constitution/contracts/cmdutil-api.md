# API Contract: `internal/cmdutil`

**Branch**: `002-core-utils-constitution` | **Phase**: 1 | **Date**: 2026-03-17

This document defines the exported Go API for the `internal/cmdutil` package.

---

## Error Code Constants

```go
package cmdutil

const (
    ErrCodeValidation        = "validation_error"
    ErrCodeConfigNotFound    = "config_not_found"
    ErrCodeContextNotFound   = "context_not_found"
    ErrCodeNoContextSelected = "no_context_selected"
    ErrCodeDryRunNotSupported = "dry_run_not_supported"
    ErrCodeInternal          = "internal_error"
)
```

---

## `StructuredError`

```go
// StructuredError is a machine-parseable error with a short code and human message.
// It implements the error interface and serializes to
// {"error":{"code":"...","message":"..."}} under --format=json.
type StructuredError struct {
    Code    string
    Message string
}

func (e *StructuredError) Error() string

// NewStructuredError returns a *StructuredError with the given code and message.
// If err is already a *StructuredError, it is returned unchanged (idempotent).
func NewStructuredError(code, message string) *StructuredError

// WrapError wraps err as a *StructuredError with the given code.
// If err is already a *StructuredError, it is returned unchanged.
func WrapError(code string, err error) *StructuredError
```

---

## `ResolveContext`

```go
// ResolveContext loads the config at cfgPath and returns the context named by
// ctxFlag, or cfg.CurrentContext if ctxFlag is empty.
//
// Error codes returned:
//   - ErrCodeConfigNotFound   — config file does not exist
//   - ErrCodeNoContextSelected — ctxFlag empty and no CurrentContext set
//   - ErrCodeContextNotFound  — named context absent from config
//   - ErrCodeInternal         — config file unreadable or malformed
func ResolveContext(cfgPath, ctxFlag string) (config.Context, error)
```

---

## `HandleDryRun`

```go
// HandleDryRun checks whether --dry-run is active on cmd.
// Returns (true, nil) after writing the resolved payload to w when --dry-run is set.
// Returns (false, nil) when --dry-run is not active.
// Returns (false, *StructuredError{ErrCodeDryRunNotSupported}) if the flag is
// not registered on the command.
//
// format is the active output format (e.g. "json", "table"); json emits JSON output.
// w is the writer that receives dry-run output.
func HandleDryRun(cmd *cobra.Command, format string, w io.Writer) (bool, error)
```

---

## `RenderError`

```go
// RenderError writes err to w in the appropriate format.
// Under format=json it emits {"error":{"code":"...","message":"..."}} using the
// StructuredError fields if err is (or wraps) a *StructuredError, or falls back
// to ErrCodeInternal for plain errors.
// Under other formats it writes a plain "Error: <message>" string.
func RenderError(w io.Writer, format string, err error)
```

---

## Usage pattern in `PersistentPreRunE`

When `--dry-run` is not disabled via `NoDryRun: true` in the command spec,
the command factory automatically sets `PersistentPreRunE` to invoke `HandleDryRun`
before business logic runs. Commands do not need to call it directly.

```go
// In cmd/factory.go, newCommand automatically wraps the command:
if !spec.NoDryRun {
	cmd.Flags().Bool("dry-run", false, "Print resolved command payload and exit without executing")
	cmd.PersistentPreRunE = func(cmd *cobra.Command, args []string) error {
		dryRun, err := cmdutil.HandleDryRun(cmd, rootFormat, cmd.OutOrStdout())
		if err != nil {
			return err
		}
		if dryRun {
			return nil
		}
		return nil
	}
}
cmd.RunE = spec.RunE
```

Commands themselves only need to implement their business logic in `RunE`:

```go
RunE: func(cmd *cobra.Command, args []string) error {
	// 1. Context resolution
	cfgPath, err := config.DefaultPath()
	if err != nil {
		return err
	}
	ctxCfg, err := cmdutil.ResolveContext(cfgPath, rootContext)
	if err != nil {
		return err
	}

	// 2. Business logic ...
	result, err := doSomething(cmd.Context(), ctxCfg)
	if err != nil {
		return err
	}
	return output.RenderRows(cmd.OutOrStdout(), ...)
},
```
