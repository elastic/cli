## Spec-Kit

This repository uses the [spec-kit](https://github.com/github/spec-kit) workflow for AI-assisted feature development — a convention for structuring specs, plans, and tasks in a `.specify/` directory.

### `.specify/` directory

| Path | Purpose |
|------|---------|
| `.specify/templates/` | Markdown templates for specs, plans, tasks, and checklists |
| `.specify/memory/` | Long-lived context files (e.g. `constitution.md`) read by agents |
| `.specify/scripts/` | Helper shell scripts for common workflow steps |
| `.specify/hooks.yml` | CI/automation hook definitions |

### How to use it

- Start a new feature: `/speckit-specify` — creates a spec from a template and opens a clarification loop.
- Generate a plan: `/speckit-plan` — converts an approved spec into a structured plan.
- Break into tasks: `/speckit-tasks` — decomposes a plan into trackable tasks.
- Implement: `/speckit-implement` — works through tasks and updates checklists.

### `specs/` directory

Each feature gets a numbered subdirectory (e.g. `specs/002-core-utils-constitution/`).
Treat the artifacts inside as follows:

| Artifact | Treatment |
|----------|-----------|
| `spec.md`, `plan.md`, `research.md`, `quickstart.md`, `tasks.md` | **Static record.** Snapshot of intent at authoring time. Do not update once implementation has begun. |
| `contracts/`, `data-model.md` | **Living.** Define output shapes and types that code is built against. If the contract has drifted from the code, update the contract before proceeding. If you are changing a contract, update it before the code. |

### Agent implementation guidance

#### TDD discipline

When implementing tasks, follow the red/green cycle autonomously:

1. Write the failing test first and confirm it fails for the right reason.
2. Write the minimum implementation to make it pass.
3. Refactor while keeping tests green.

Do not stop and ask for human approval between writing a test and writing its
implementation — proceed through the full red/green/refactor cycle and surface
results at the task completion boundary.

#### Test helper packages

Reusable test helpers live in dedicated `*test` packages alongside the package
they support, following the `internal/pkgname/pkgnametest` convention. All packages
with reusable test setup must follow this pattern. Do not duplicate setup logic
across test files — add a helper to the appropriate test package instead.

The canonical example is `internal/cmdutil/cmdutiltest`, which provides:

```go
// InitUserConfigDir initialises a minimal elastic config in a temporary
// directory and sets the OS-appropriate environment variable so that
// os.UserConfigDir() resolves to that directory for the duration of the test.
// Use this in any test that needs a real config on disk.
func InitUserConfigDir(tb testing.TB) string
```

Use `cmdutiltest.InitUserConfigDir(t)` instead of writing ad-hoc
`XDG_CONFIG_HOME` / temp-dir setup in individual test files. The helper handles
the correct env var per OS (`XDG_CONFIG_HOME` on Linux, `HOME` on macOS,
`AppData` on Windows) via `tb.Setenv`, so it is safe and portable.

#### Code formatting and linting

**Always run `gofmt` after making any code changes.** This is the canonical Go formatter and enforces consistent whitespace and style.

```sh
gofmt -w ./...
```

Verify all files are formatted before committing:

```sh
gofmt -l ./...   # should print nothing
```
