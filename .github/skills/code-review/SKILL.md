---
name: code-review
description: Guidelines to apply when doing a code review on a pull request
---

- All guidelines documented in the AGENTS.md, ARCHITECTURE.md, CONTRIBUTING.md and any other linked documents **MUST** be respected.
- If changes are made to the `elasticrc` configuration schema (see `src/config/schema.ts`), they **MUST** be included in `docs/cli/configuration_reference.md` and **SHOULD** be mentioned in the README if they are broadly useful.
- If support for new global arguments or environment variables is added, they **MUST** be mentioned in documentation in `./docs/cli/` and **SHOULD** be in the README.
- All changes **MUST** be covered by unit tests.
- Extra attention **SHOULD** be given to *existing unit tests that have changed*, to ensure that the change does not allow regressions, that it actually tests what it states, and that it is still possible for the test to fail under some circumstance (i.e. does not do the functional equivalent of `assert(true)`).
- All global CLI options **MUST** be respected by all new changes. For example, if a global `--no-color` flag is supported by the CLI, and `renderText` is updated to emit ANSI, `renderText` must not emit ANSI when that flag is set.
- Code should **ALWAYS** reuse provided factories and utilities instead of Node.js globals (`hasGlobalJsonFlag` instead of `process.argv.includes('--json')`, handler return value instead of `process.stdout.write`) unless there is a **VERY** clear reason to circumvent the ideal path.
