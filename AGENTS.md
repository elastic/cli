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
