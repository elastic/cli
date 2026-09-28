---
name: build
description: Install, compile, and verify a clean Elastic CLI checkout.
---

# Build

Node.js 22+. If `tsc` OOMs, set `NODE_OPTIONS=--max-old-space-size=8192`.

```bash
npm ci
npm run build
npm test
```

`npm test` already runs `npm run build` then unit tests. `npm ci` for CI and clean checkouts; `npm install` is fine locally.

```bash
npx tsc --noEmit
npm run test:lint
node scripts/generate-notice.mjs
npm run build:schema
```

Commit `NOTICE.txt` after dependency changes and `docs/cli/schema.json` after command or flag changes.

Do not edit `src/es/apis/*.ts`, `src/es/api-manifest.ts`, `src/kb/apis.ts`, or `src/kb/api-manifest.ts`. Unset `ELASTIC_CLI_CONFIG_FILE` before running the built binary against a real cluster.
