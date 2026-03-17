# Quickstart: Core Utilities (`internal/cmdutil`)

**Branch**: `002-core-utils-constitution` | **Date**: 2026-03-17

This guide shows a developer how to build a new `es`-family command using the three core utilities, and how the refactored commands serve as reference implementations.

---

## 1. Writing a new `es` command

### Building a command with the newCommand factory

```go
// cmd/es_myresource.go
package cmd

import (
    "github.com/elastic/cli/internal/client"
    "github.com/elastic/cli/internal/cmdutil"
    "github.com/elastic/cli/internal/config"
    "github.com/elastic/cli/internal/output"
    "github.com/spf13/cobra"
)

var esMyResourceListCmd = newCommand(commandSpec{
	Use:          "list [name|pattern...]",
	Short:        "List my resources",
	Args:         cobra.ArbitraryArgs,
	SilenceUsage: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Context resolution — single call, no duplication.
		cfgPath, err := config.DefaultPath()
		if err != nil {
			return err
		}
		ctxCfg, err := cmdutil.ResolveContext(cfgPath, rootContext)
		if err != nil {
			return err
		}

		// Business logic.
		cl, err := client.NewFromContext(ctxCfg)
		if err != nil {
			return err
		}
		resources, _, err := cl.ListMyResources(cmd.Context())
		if err != nil {
			return err
		}

		return output.RenderRows(cmd.OutOrStdout(),
			output.NormalizeFormat(rootFormat),
			[]string{"name", "status"},
			myResourceRows(resources),
			resources,
		)
	},
})

func init() {
	esMyResourceCmd.AddCommand(esMyResourceListCmd)
}

func init() {
    esMyResourceCmd.AddCommand(esMyResourceListCmd)
    // Register --dry-run so the utility can handle it.
    esMyResourceListCmd.Flags().Bool("dry-run", false,
        "Print resolved request payload and exit without executing")
}
```

---

## 2. Error handling

### Returning a structured error from business logic

```go
import "github.com/elastic/cli/internal/cmdutil"

func validateQuery(q string) error {
    if q == "" {
        return cmdutil.NewStructuredError(cmdutil.ErrCodeValidation, "query must not be empty")
    }
    return nil
}
```

### Wrapping an upstream error

```go
if err := upstream.Do(); err != nil {
    // If err is already a *StructuredError it is returned as-is (no double-wrap).
    return cmdutil.WrapError(cmdutil.ErrCodeInternal, err)
}
```

---

## 3. Testing a command with dry-run

```go
func TestMyCommandDryRun(t *testing.T) {
    var buf bytes.Buffer
    cmd := newRootForTest()  // helper that wires up your command under a test root

    cmd.SetArgs([]string{"es", "my-resource", "list", "--dry-run", "--format=json"})
    cmd.SetOut(&buf)

    err := cmd.Execute()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }

    var payload map[string]any
    if err := json.Unmarshal(buf.Bytes(), &payload); err != nil {
        t.Fatalf("invalid JSON: %v", err)
    }
    dr, ok := payload["dry_run"].(map[string]any)
    if !ok {
        t.Fatal("missing dry_run key")
    }
    if dr["command"] != "elastic es my-resource list" {
        t.Errorf("unexpected command: %v", dr["command"])
    }
}
```

---

## 4. Reference implementations

After this feature ships, the following files are the canonical reference:

| File | Demonstrates |
|------|-------------|
| `internal/cmdutil/errors.go` | `StructuredError`, constants, constructors |
| `internal/cmdutil/context.go` | `ResolveContext` |
| `internal/cmdutil/dryrun.go` | `HandleDryRun` |
| `internal/cmdutil/render.go` | `RenderError` |
| `cmd/es_resources.go` | Refactored `runGet` + four `es` listing commands |
| `cmd/esql.go` | Refactored `es query` command |
| `internal/cmdutil/*_test.go` | Unit tests for each utility (≥80% coverage) |

---

## 5. Constitution compliance checklist for new `es` commands

- [ ] Uses `cmdutil.ResolveContext` — no inline context-resolution block
- [ ] Command is built via `newCommand(commandSpec{})` — no manual Cobra command creation
- [ ] Calls `cmdutil.RenderError` before returning any error
- [ ] Uses `cmdutil.NewStructuredError` or `cmdutil.WrapError` for all custom errors
- [ ] Uses an `ErrCode*` constant — no free-form code strings
- [ ] Has unit tests covering the dry-run path, a context-not-found path, and the success path
- [ ] All exported symbols in `cmdutil` have Go doc comments
