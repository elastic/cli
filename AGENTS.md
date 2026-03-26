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