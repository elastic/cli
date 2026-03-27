# Elastic CLI

This is Go-based CLI that exposes a large surface area of subcommands to interact with Elasticsearch, Elastic Cloud and Elasticsearch Serverless control plane APIs. It targets LLM-powered agents as first-class users by providing several guardrails and machine-friendly inputs and outputs.

In order to enforce strong support for agents, most command definition will be handled by core, reusable utilities that enforce how commands are defined, configured and run.

## File layout

TODO

## Use `just` commands if available

If a target exists in the `justfile` to do what you need, run that rather than directly running another command.

## Dependencies

CLI setup uses [Cobra](https://github.com/spf13/cobra). Elasticsearch HTTP activity is handled by [the Go Elasticsearch transport](https://github.com/elastic/elastic-transport-go/).

Adding new third-party dependencies is highly discouraged, in order to keep binaries smaller and to reduce the surface area of supply-chain attacks.

## TDD discipline

When implementing tasks, follow the red/green cycle autonomously:

1. Write the failing test first and confirm it fails for the right reason.
2. Write the minimum implementation to make it pass.
3. Refactor while keeping tests green.

Do not stop and ask for human approval between writing a test and writing its implementation. Proceed through the full red/green/refactor cycle and surface results at the task completion boundary.


## Testing Patterns

### Test Helper Packages (`{pkg}test`)

Go tests should store reusable helpers and fixtures in a dedicated package named `{pkg}test`,
co-located inside the package directory:

```
internal/factory/
├── factory.go
├── path.go
├── path_test.go          # imports factorytest
├── config_test.go
└── factorytest/
    └── helpers.go        # TempConfigFile(), TempConfigFileUnreadable()
```

**What belongs in a `{pkg}test` package**: shared *fixture* helpers — creating temp files,
building test structs, seeding test data. Things that would otherwise be duplicated across
multiple `_test.go` files.

**What does not belong**: wrappers around `t.Setenv()`. The standard Go idiom for controlling
environment variables in tests is simply:

```go
t.Setenv("ELASTIC_CONFIG", tmpFile)  // auto-restored after the test
```

`t.Setenv` sets the variable and restores the original value automatically on cleanup.
There is no need for a `Env()` / `FakeEnv()` helper or a `getenv func(string) string`
injection parameter — that is unnecessary indirection in Go.


## Go Idioms and Best Practices

### Inject I/O dependencies; never hardcode `os.Stdout` / `os.Stderr` inside logic

Functions that produce output must accept `io.Writer` parameters so callers (and
tests) can capture or redirect output without mocking the OS. Reserve direct OS
file references for the thin entry-point wrapper:

```go
// Good — entry point wires real OS streams
func Execute() {
    os.Exit(executeRoot(rootCmd, os.Args[1:], rootCmd.OutOrStdout(), rootCmd.ErrOrStderr()))
}

// Good — logic is fully testable
func executeRoot(cmd *cobra.Command, args []string, stdout, stderr io.Writer) int { ... }

// Bad — output is not capturable in tests
func Execute() {
    if err := rootCmd.Execute(); err != nil {
        output.Render(os.Stdout, ...)  // hardcoded; bypasses rootCmd.SetOut
    }
}
```

For Cobra commands, use `cmd.OutOrStdout()` and `cmd.ErrOrStderr()` rather than
`os.Stdout` / `os.Stderr`. These respect writers configured via `cmd.SetOut` /
`cmd.SetErr`, which is how tests and embedded use-cases redirect output.

### Use sentinel errors to signal "already handled" across a layer boundary

When a function handles an error itself (e.g. writes a JSON envelope to the user)
but still needs to signal failure to its caller, returning `nil` is wrong — it
causes the caller to exit 0. Returning the original error is also wrong — it
causes the caller to double-print. The right pattern is a package-level sentinel:

```go
// output package
var ErrAlreadyRendered = errors.New("error already rendered")

func Render(...) error {
    // writes JSON envelope ...
    if cmdErr != nil {
        return ErrAlreadyRendered  // "I showed the user; you just need to exit non-zero"
    }
    return nil
}

// caller
if errors.Is(err, output.ErrAlreadyRendered) {
    return 1  // exit non-zero, print nothing
}
```

This pattern keeps the two concerns — user-facing output and process exit code —
cleanly separated without coupling layers through shared state.

### Keep doc comments accurate as behavior evolves

When implementation changes (e.g. errors are now rendered inside `RunE` rather
than propagated to Cobra), update the doc comment on the affected function in
the same commit. A doc comment that contradicts the code is worse than no
comment: it actively misleads future readers and agents.

Specifically: when a function's error-handling model changes, re-read its doc
comment and update the description, the enumerated behavior steps, and any
"not an error" / "error condition" tables.

### Keep spec contracts in sync with code

Contract documents in `specs/*/contracts/` are the authoritative interface
description for each package. When implementation diverges from a contract
(different JSON structure, changed error codes, different exit-code behavior),
update the contract in the same change. Stale contracts cause downstream
consumers — including other agents — to build against the wrong interface.

### `return nil` after writing an error is an exit-code bug

If a function writes an error response (to a stream, to a log, to a JSON
envelope) and then returns `nil`, the caller has no signal that anything went
wrong. In CLI code this manifests as exit code 0 for a failed invocation.
Always ensure that error paths propagate a non-nil return value — even if the
error has already been presented to the user.
