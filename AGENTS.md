# Elastic CLI

This is a CLI that exposes a large surface area of subcommands to interact with Elasticsearch, Elastic Cloud and Elasticsearch Serverless control plane APIs.
It targets LLM-powered agents as first-class users by providing several guardrails and machine-friendly inputs and outputs.

## Tech Stack

- **Runtime**: Node.js with native TypeScript (using `--experimental-strip-types`)
- **CLI Framework**: Commander.js
- **Validation**: Zod v4
- **Config Management**: cosmiconfig
- **Config Serialization**: YAML
- **Testing**: Node.js built-in test runner (node:test)
- **Linting**: ESLint + TypeScript ESLint
- **TypeScript**: Strict mode with ESNext + nodenext module resolution

Adding other new third-party dependencies is highly discouraged to reduce supply-chain attack surface.

## Architecture

Commands are defined through shared, reusable config structures (see `factory.ts`). Custom logic only permitted for behaviors that cannot be expressed in config.

## Code Patterns & Conventions

### SPDX Headers
All code files **MUST** start with:
```
/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */
```

### Code Standards
- **Docstrings**: All exported symbols in reusable utilities MUST have complete doc comments
- **Comments**: Explain WHY, not WHAT. Don't restate code in prose
- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces
- **YAML config**: ALL key names use `snake_case` (e.g. `api_key`, `current_context`). Never camelCase or kebab-case
- **Files**: Proper trailing newline, no trailing whitespace

### Use dependencies wisely

When writing code that does something that is not critical to this tool's core domain (i.e. interacting with Elastic APIs), and an installed dependency can likely handle it, **always** try to leverage that dependency in your solution first. For example, for an argument-parsing bug, check if `commander` can help solve it instead of using `process.argv` directly. Only apply a manual solution if that strategy does not succeed.

### TypeScript Configuration
- Strict mode: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `strict`, `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`, `moduleDetection: force`
- Source maps and declaration maps enabled

## TDD Discipline

**ALWAYS** follow this cycle autonomously:
1. Write a failing test capturing intended behavior (RED)
2. Confirm test fails for the right reason
3. Write minimum implementation to make test pass (GREEN)
4. Refactor under green, keeping tests passing (REFACTOR)

Do not stop between writing test and implementation. Proceed through the full cycle.

**Task completion**: All tests pass (`npm test` exits 0), lint checks pass, no style violations.

## Thorough Testing

After every implementation change, you MUST:

1. **Run the full test suite** (`npm test`) before considering work complete. Never skip this step.
2. **Write regression tests for every bug fix.** Each fix must have at least one test that would have caught the original bug.
3. **Test adversarial and edge-case inputs.** For any function that processes user input -- especially strings going into URLs, paths, commands, or queries -- add tests with malicious or unexpected values (`../`, `?#`, empty strings, special characters).
4. **Test configuration, not just output.** When testing HTTP clients or request builders, assert on the full configuration object (e.g., `RequestInit` options like `redirect`, `credentials`), not only the response.
5. **Don't copy test patterns from existing code without auditing them.** Existing tests may have gaps. When writing code modeled after another file, independently evaluate what tests are needed.
6. **Manually verify fixes when feasible.** After unit tests pass, build (`npm run build`) and run the CLI end-to-end to confirm the fix works. Document the manual test commands in your response.
7. **Check for lint errors** on all modified files before declaring work complete.
8. **Never mold tests to make them pass.** If a test fails, investigate the implementation first -- the test may be correct and the code may be wrong. Never weaken assertions, skip test cases, or change expected values just to get green. The test is the spec; fix the code to match it, not the other way around.
9. **Never mold code to make tests pass incorrectly.** Don't add special cases, workarounds, or dead code paths in production code solely to satisfy a poorly written test. If the test is wrong, fix the test with a clear explanation of why.
10. **Test all code paths, not just the happy path.** For every function, ask: what happens with missing input, empty input, null, wrong types, boundary values? For HTTP code: what about redirects, timeouts, empty responses, error status codes?
11. **Run the code you wrote.** Don't just run unit tests. Build the project and exercise the feature manually. If writing a CLI command, run it. If writing an API endpoint, call it. If writing a request builder, trace the actual HTTP request it produces.

## Security Checklist

When creating or modifying code that constructs URLs, sends credentials, or makes HTTP requests:

- **Encode path parameters.** Never interpolate user input into URL paths with bare `String(value)`. Always use `encodeURIComponent()` or a wrapper that encodes each segment.
- **Validate URL schemes.** Reject anything other than `http://` and `https://`. Warn on plaintext `http://` for non-localhost targets.
- **Don't copy patterns blindly.** If replicating URL-building logic from another file, audit the source for encoding and validation gaps before copying.
- **Set `redirect: 'error'`** (or `'manual'`) on every `fetch` call that sends credentials. Never rely on the default `'follow'` behavior.
- **Assert on `RequestInit` configuration in tests**, not just on response output. Verify `redirect`, `method`, and `headers` are set as intended.
- **Add at least one adversarial input test** for any function that accepts user-provided strings and embeds them in URLs or paths.

## Generic Abstractions Must Handle Real-World Variation

### Lessons

1. **Enumerate all variants a system can produce, not just the ones you see first.** `unwrapField()` only handled `optional` and `default` because those were the only wrappers visible in the initial hand-written schemas. When codegen produced schemas using `z.lazy()`, `z.record()`, `z.any()`, and `z.union()`, they all silently fell through to a catch-all that mapped them to `"string"`. Before writing a generic handler, inspect the full set of types/formats the upstream system can produce and add explicit branches or a loud failure for unrecognized cases.

2. **Fail loudly on unrecognized input instead of falling through to a default.** The `unwrapField` catch-all `return { typeName: def.type, isOptional: false }` silently returned garbage. A `throw new Error('unhandled Zod type: ' + def.type)` would have surfaced the problem immediately at registration time instead of producing subtle runtime validation failures across 1400+ fields.

3. **Test with real generated schemas, not just hand-crafted toy schemas.** If our `extractSchemaArgs` tests had included even one actual schema from the codegen output (which uses `z.lazy` extensively), the bug would have been caught before merging.

4. **Generic request builders need escape hatches for endpoint-specific semantics.** The ES bulk API needs NDJSON; the index API needs body promotion. A "one size fits all" `collectBody()` silently produced wrong output for both. When designing generic abstractions, ask: "what endpoint-specific behavior could this need?" and add explicit extension points (`bodyFormat`, `BODY_ROOT_FIELDS`) rather than special-casing later.

5. **User-facing error messages should diagnose common mistakes.** Raw error propagation (e.g., `SSL routines:tls_get_more_records:packet length too long`) is unhelpful. When you catch an error class that has known causes (TLS mismatch, auth failure, DNS resolution), pattern-match on the message and append a human-readable hint with a suggested fix.

6. **When consuming codegen output, treat it as untrusted input.** The codegen produces valid schemas, but the CLI's generic layers made assumptions about which Zod types would appear. Validate those assumptions with tests that exercise actual generated output.

7. **Inspect the type definition before setting properties on shared types.** When building an object typed as an external interface (e.g., `TransportRequestParams` from `@elastic/transport`), read the type definition first. Don't assume it has a property just because it seems logical -- `TransportRequestParams` has `bulkBody` for NDJSON, not `body` + `headers`. JavaScript silently allows setting non-existent properties, so only `tsc --noEmit` or CI will catch this. Always run a type-check (`npx tsc --noEmit`) locally before pushing, not just tests.

8. **Guard clauses that silently discard data are dangerous.** `collectBody()` had `if (!(def.body instanceof z.ZodObject)) return undefined` -- a guard clause that silently threw away all stdin/`--input-file` input for every Cloud POST command without an explicit body schema. That was the *common* case, not the edge case. When writing a guard clause that returns early with no data, ask: "what happens to the caller's input?" If the answer is "it gets silently dropped," that's almost certainly a bug. Prefer forwarding unknown input (with clear passthrough semantics) over silently discarding it.

9. **Trace the full data flow across layers for every combination of modes.** The `--json` flag broke cat APIs because the handler returned raw text and the factory blindly called `JSON.stringify()` on it. Neither layer was wrong in isolation -- the handler correctly returned text, the factory correctly serialized JSON. But together, the combination of `responseType: 'text'` + `--json` was never traced end-to-end. When a feature involves two cooperating layers (handler + output formatter, request builder + transport), enumerate all mode combinations and verify each one produces correct output.

10. **Codegen output needs a UX review.** Machine-generated command names (e.g., `list-deployments` from `listDeployments` operationId) are precise but verbose. Users will instinctively try shorter forms (`list`, `get`). When registering auto-generated commands, add short aliases where unambiguous, and test that users can discover commands with intuitive names.

## Spec-Kit Workflow

The project uses [spec-kit](https://github.com/github/spec-kit) for AI-assisted feature development.

| Path | Purpose |
|------|---------|
| `.specify/specs/` | Feature specifications |
| `.specify/plans/` | Implementation plans |
| `.specify/tasks/` | Task definitions |
| `.specify/memory/` | Long-lived context files (e.g. `constitution.md`) |
| `.specify/templates/` | Markdown templates |
| `.specify/scripts/` | Helper shell scripts |
| `.specify/hooks.yml` | CI/automation hook definitions |

## Conventional Commits

All commit messages and PR titles MUST follow the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification. PR titles are validated in CI.

### Format

```
<type>(<optional scope>)<optional !>: <description>

<optional body>

<optional footers>
```

### Types

| Type | When to use | Triggers release? |
|------|-------------|-------------------|
| `feat` | New user-facing feature or capability | Yes (minor) |
| `fix` | Bug fix | Yes (patch) |
| `perf` | Performance improvement with no API change | Yes (patch) |
| `docs` | Documentation only | No |
| `test` | Adding or updating tests | No |
| `ci` | CI/CD pipeline changes | No |
| `chore` | Dependency bumps, tooling, repo maintenance | No |
| `refactor` | Code restructuring with no behavior change | No |
| `revert` | Reverts a previous commit | Depends on reverted type |

### Scope

Use a scope when the change is clearly confined to one area of the codebase. Omit it for cross-cutting changes.

```
feat(cli): add --format flag to search command
fix(config): handle missing YAML key gracefully
ci: add PR title validation step
chore: update dependencies
```

Common scopes for this project: `cli`, `config`, `auth`, `cloud`, `es`, `serverless`.

### Breaking Changes

A breaking change triggers a **major** version bump. Indicate it one of two ways (or both):

1. **`!` after the type/scope**, immediately before the colon:
   ```
   feat!: remove deprecated --legacy flag
   feat(cli)!: rename --output to --format
   ```

2. **`BREAKING CHANGE` footer** in the commit body:
   ```
   feat: switch config format from JSON to YAML

   BREAKING CHANGE: existing .elasticrc.json files must be migrated to .elasticrc.yml
   ```

   Using both `!` and the footer is valid. The footer is preferred when the breaking change needs a longer explanation than fits in the subject line.

### Release-Please Integration

This project uses [release-please](https://github.com/googleapis/release-please) to automate versioning and changelogs. It reads commit messages (via squash-merge) to determine version bumps.

**Overriding commit messages after merge.** If a PR was already merged with a wrong or incomplete commit message, edit the merged PR's body on GitHub and add:

```
BEGIN_COMMIT_OVERRIDE
feat(cli): correct description of the change

fix(config): secondary fix included in same PR
END_COMMIT_OVERRIDE
```

Release-please will use the override block instead of the actual merge commit. This only works with squash-merge.

**Multiple changes in one commit.** Use conventional commit lines as footers to represent additional changes:

```
feat: add v2 API support

Adds the new /v2 endpoints for project management.

fix(auth): token refresh no longer drops scopes
  BREAKING-CHANGE: v1 token format is no longer accepted
```

**Forcing a specific version.** Use the `Release-As` trailer:

```
chore: release 3.0.0

Release-As: 3.0.0
```

### Common Mistakes

- `Feat:` or `FIX:` -- types must be lowercase.
- `feat(CLI):` -- scopes should be lowercase.
- `feat : add thing` -- no space before the colon.
- `feat:add thing` -- must have a space after the colon.
- `feat: Add thing.` -- description should not be capitalized or end with a period.
- `feat(): add thing` -- empty scope parentheses; omit them entirely.
- `update README` -- missing type prefix entirely.
