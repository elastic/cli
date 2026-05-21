# Elastic CLI

CLI for interacting with Elasticsearch, Elastic Cloud, and Elasticsearch Serverless control plane APIs. Targets LLM-powered agents as first-class users.

## Tech Stack

- **Runtime**: Node.js with native TypeScript (`--experimental-strip-types`)
- **CLI Framework**: Commander.js
- **Validation**: Zod v4
- **Config Management**: cosmiconfig (YAML serialization)
- **Testing**: Node.js built-in test runner (`node:test`)
- **Linting**: ESLint + TypeScript ESLint, MegaLinter (CI + pre-commit)
- **TypeScript**: Strict mode, ESNext + nodenext module resolution

Avoid adding new third-party dependencies to reduce supply-chain attack surface.

## Architecture

Commands are defined via shared config structures (see `factory.ts`). Custom logic is only permitted for behaviors that cannot be expressed in config.

## Command Authoring Requirements

All requirements below are non-negotiable and enforced at review time.

### Input

- **JSON via stdin and `--input-file`**: Structured input MUST be accepted from stdin or `--input-file <path>`. Neither takes precedence; providing both MUST error.
- **CLI flags for all input fields**: Every top-level schema field MUST have a corresponding kebab-case CLI flag. When both JSON input and flags are provided, flags take precedence.
- **Zod input schema**: Every command with structured input MUST declare a Zod schema as the single source of truth for validation, type inference, and help text. `input: true` (untyped) MUST NOT be used in new commands.
- **Validate before executing**: All input MUST be validated before any handler logic or network call. Invalid input is a hard error.
- **Reject unknown keys**: Input with undefined keys MUST produce a validation error naming the unknown field(s). Silent stripping is not acceptable.

### Output and Errors

- **`--json`**: Every command MUST emit structured JSON when `--json` is passed.
- **`--help --json`**: MUST output the full JSON Schema so agents can introspect valid inputs.
- **Errors**: All errors MUST go to stderr with a non-zero exit code. With `--json`, errors MUST serialize as `{"error": {"code": "...", "message": "..."}}`.

### Mutations and Side Effects

- **`--dry-run`**: Every command that mutates state or makes a network call MUST support `--dry-run`. In dry-run mode: validate all inputs, print the resolved request payload, exit 0 without executing.

### Credentials and Configuration

- **No credentials as CLI flags**: API keys, passwords, and tokens belong only in the config file or environment variables. Never as CLI flags.
- **Named contexts**: Connection info is managed via named contexts in the YAML config (kubectl-style). `--context <name>` MAY override for a single invocation; context fields MUST NOT be duplicated as first-class flags.

### Transport Abstraction

- **Hide routing metadata**: `found_in: path | query | body` is an implementation detail. It MUST NOT appear in help text, schema output, or error messages.
- **Validate path parameter coverage**: If a schema field has `found_in: "path"` but the URL template has no matching placeholder, the system MUST fail fast at registration time.

### Cross-Platform Compatibility

- **Paths**: Use `path.join()` / `path.resolve()`. Hard-coded `/` or `\\` separators are forbidden.
- **Config directories**: Resolve using `os.homedir()` and `process.env.APPDATA` (or OS equivalents). No Unix-only hard-coded paths.
- **Platform guards**: Signal handling, TTY detection, and ANSI escape codes MUST be guarded behind capability checks.
- **CI**: The full test suite MUST pass on Windows, Linux, and macOS before merge.

## Code Patterns & Conventions

### SPDX Header

All code files MUST start with:

```
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */
```

Note the single-asterisk `/*` opener — `scripts/check-spdx` rejects the JSDoc-style `/**` form.

### Standards

- **Docstrings**: All exported symbols in reusable utilities MUST have complete doc comments.
- **Comments**: Explain WHY, not WHAT. Do not restate code in prose.
- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces.
- **YAML config keys**: Always `snake_case` (e.g. `api_key`, `current_context`). Never camelCase or kebab-case.
- **Files**: Trailing newline required, no trailing whitespace.

### Dependencies

When solving a problem outside this tool's core domain (Elastic API interaction), check if an installed dependency solves it before writing custom code. For example: prefer `commander` over `process.argv` for argument parsing. Apply a manual solution only if the dependency cannot help.

### TypeScript Configuration

Strict flags: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`, `moduleDetection: force`. Source maps and declaration maps enabled.

## TDD Discipline

Follow this cycle autonomously for every change:

1. Write a failing test (RED)
2. Confirm it fails for the right reason
3. Write minimum code to pass (GREEN)
4. Refactor under green (REFACTOR)

Task is complete when `npm test` exits 0 and lint passes.

## Pre-commit Linting

MegaLinter runs automatically on staged files when `pre-commit install` has been run. It catches TypeScript lint errors, YAML issues, unpinned GitHub Actions, accidental secrets, and copy-paste duplication. Docker must be running.

If the pre-commit hook fails, read the error output, fix flagged files, and retry. Do NOT use `--no-verify`.

To run MegaLinter manually: `npm run test:megalinter` (requires Docker).

## Thorough Testing

After every implementation change:

1. Run `npm test`. Never skip.
2. Write a regression test for every bug fix.
3. Test adversarial inputs for any function embedding user strings in URLs, paths, or queries (`../`, `?#`, empty strings, special characters).
4. Assert on full `RequestInit` configuration (e.g. `redirect`, `credentials`), not just response output.
5. Do not copy test patterns from existing code without auditing for gaps.
6. After unit tests pass, build (`npm run build`) and verify end-to-end manually.
7. Check for lint errors on all modified files.
8. Never weaken assertions, skip cases, or change expected values to get green. The test is the spec; fix the code.
9. Never add special cases or dead code in production code solely to satisfy a bad test. Fix the test instead.
10. Test all code paths: missing input, empty input, null, wrong types, boundary values, HTTP error codes, redirects, timeouts.
11. Run the code you wrote. For a CLI command, run it. For a request builder, trace the actual HTTP request.

## Security Checklist

When constructing URLs, sending credentials, or making HTTP requests:

- **Encode path parameters**: Use `encodeURIComponent()` or an equivalent wrapper. Never bare `String(value)`.
- **Validate URL schemes**: Reject anything other than `http://` or `https://`. Warn on plaintext `http://` for non-localhost targets.
- **Audit before copying**: If replicating URL-building logic from another file, check it for encoding and validation gaps.
- **Set `redirect: 'error'`** (or `'manual'`) on every `fetch` call that sends credentials. Never rely on the default `'follow'`.
- **Assert on `RequestInit`** in tests: verify `redirect`, `method`, and `headers`.
- **Adversarial input test**: Add at least one test with malicious input for any function that embeds user strings in URLs or paths.

## Generic Abstractions: Lessons Learned

1. **Enumerate all variants upfront.** `unwrapField()` only handled `optional` and `default`; codegen also produced `z.lazy()`, `z.record()`, `z.any()`, `z.union()`, which all fell through silently. Inspect the full set of types the upstream system can produce and add explicit branches or a loud failure for unrecognized cases.

2. **Fail loudly on unrecognized input.** A catch-all `return { typeName: def.type, isOptional: false }` silently returned garbage. `throw new Error('unhandled Zod type: ' + def.type)` would have surfaced the problem at registration time.

3. **Test with real generated schemas.** Hand-crafted toy schemas miss codegen-specific types like `z.lazy`.

4. **Generic request builders need extension points for endpoint-specific semantics.** The bulk API needs NDJSON; the index API needs body promotion. Add explicit extension points (`bodyFormat`, `BODY_ROOT_FIELDS`) rather than special-casing later.

5. **Diagnose common mistakes in user-facing errors.** Map known error patterns (TLS mismatch, auth failure, DNS) to actionable hints instead of propagating raw messages.

6. **Treat codegen output as untrusted input.** Validate assumptions about which Zod types appear with tests that use actual generated schemas.

7. **Read external type definitions before setting properties.** `TransportRequestParams` has `bulkBody` for NDJSON, not `body` + custom headers. JavaScript silently ignores extra properties; only `tsc --noEmit` or CI catches this. Run `npx tsc --noEmit` before pushing.

8. **Guard clauses that discard data are dangerous.** `if (!(def.body instanceof z.ZodObject)) return undefined` silently dropped all stdin/`--input-file` input for Cloud POST commands. When a guard returns early with no data, ask what happens to the caller's input. Prefer forwarding with passthrough semantics over silent discard.

9. **Trace the full data flow for every mode combination.** `--json` broke cat APIs because the handler returned raw text and the factory blindly called `JSON.stringify()`. When two layers cooperate (handler + formatter, request builder + transport), enumerate all mode combinations and verify each.

10. **Review codegen command names for UX.** Machine-generated names (e.g. `list-deployments`) are precise but verbose. Add short aliases where unambiguous so users can discover commands intuitively.

## Spec-Kit Workflow

Uses [spec-kit](https://github.com/github/spec-kit) for AI-assisted feature development.

| Path | Purpose |
|------|---------|
| `.specify/specs/` | Feature specifications |
| `.specify/plans/` | Implementation plans |
| `.specify/tasks/` | Task definitions |
| `.specify/memory/` | Long-lived context (e.g. `constitution.md`) |
| `.specify/templates/` | Markdown templates |
| `.specify/scripts/` | Helper scripts |
| `.specify/hooks.yml` | CI/automation hooks |

## Conventional Commits

All commit messages and PR titles MUST follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). PR titles are validated in CI.

### Format

```
<type>(<optional scope>)<optional !>: <description>

<optional body>

<optional footers>
```

### Types

| Type | When to use | Triggers release? |
|------|-------------|-------------------|
| `feat` | New user-facing feature | Yes (minor) |
| `fix` | Bug fix | Yes (patch) |
| `perf` | Performance improvement, no API change | Yes (patch) |
| `docs` | Documentation only | No |
| `test` | Adding or updating tests | No |
| `ci` | CI/CD changes | No |
| `chore` | Dependencies, tooling, maintenance | No |
| `refactor` | Code restructuring, no behavior change | No |
| `revert` | Reverts a previous commit | Depends |

### Scope

Use a scope when the change is confined to one area. Omit for cross-cutting changes.

Common scopes: `cli`, `config`, `auth`, `cloud`, `es`, `serverless`.

```
feat(cli): add --format flag to search command
fix(config): handle missing YAML key gracefully
ci: add PR title validation step
```

### Breaking Changes

Indicate with `!` before the colon, a `BREAKING CHANGE` footer, or both:

```
feat(cli)!: rename --output to --format

BREAKING CHANGE: --output is removed; use --format instead.
```

### Release-Please Integration

[release-please](https://github.com/googleapis/release-please) automates versioning from commit messages via squash-merge.

To override a merged commit message, add to the PR body:

```
BEGIN_COMMIT_OVERRIDE
feat(cli): correct description

fix(config): secondary fix
END_COMMIT_OVERRIDE
```

To force a specific version, use the `Release-As` trailer:

```
chore: release 3.0.0

Release-As: 3.0.0
```

### Common Mistakes

- Types and scopes must be lowercase: `feat`, not `Feat`; `feat(cli)`, not `feat(CLI)`.
- No space before the colon: `feat:`, not `feat :`.
- Space after the colon: `feat: add`, not `feat:add`.
- Description must not be capitalized or end with a period.
- Empty scope parentheses are invalid: omit them entirely.
- Every commit must have a type prefix.
