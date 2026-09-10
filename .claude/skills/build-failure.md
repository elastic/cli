---
name: build-failure
description: Diagnose Elastic CLI CI and local build failures.
---

# Build failure

Read the failing job log before changing code. Match the symptom, then apply the fix.

JavaScript heap out of memory / `tsc` killed: set `NODE_OPTIONS=--max-old-space-size=8192` (CI already uses 6144). Do not lower memory to make a test pass.

`docs/cli/schema.json` is out of date: `npm run build && npm run build:schema`, commit the file. Same-repo PRs can let CI commit it.

`NOTICE.txt` is out of date: `node scripts/generate-notice.mjs`, commit if it changed.

PR title rejected: conventional commits, lowercase type, no trailing period. Example: `fix: redact cloud credentials`.

Edited generated API files: revert `src/es/apis/`, `src/es/api-manifest.ts`, `src/kb/apis.ts`, `src/kb/api-manifest.ts`. Fix the generator or a hand-maintained file (`src/es/register.ts`, `src/factory.ts`) instead.

MegaLinter / pre-commit: Docker must be running. Fix the flagged files; do not `--no-verify`.

Windows path or spawn failures: use `path.join`, no hard-coded `/`. Tests must pass on Windows, macOS, and Linux.

Functional tests: `ELASTIC_CLI_CONFIG_FILE` must be unset unless pointing at an intentional fixture. Kibana functional tests need `kibana_system`, not `elastic`.

`npm ci` lock mismatch: do not hand-edit `package-lock.json`. Change `package.json` and re-run `npm install`.
