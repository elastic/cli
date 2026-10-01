---
name: test
description: Write and run Elastic CLI unit and functional tests.
---

# Test

Framework: Node.js `node:test` plus `node:assert/strict`. Files live in `test/**/*.test.ts`.

```bash
npm test
npx tsx --test test/**/*.test.ts
npx tsc --noEmit
```

`npm test` builds, then runs unit tests with coverage (90% lines/branches/functions on `src/` and `packages/*/src`, excluding generated manifests).

Every bug fix needs a regression test that would have caught it. For URL/path/query builders, add adversarial inputs (`../`, `?#`, empty, special characters). For HTTP clients, assert the full `RequestInit` (`redirect`, `credentials`, headers), not just the response. Cover failure responses, not only success fixtures.

Do not weaken assertions, skip cases, or add production special cases to satisfy a bad test. The `cli.test.ts` config caching case is a known pre-existing failure; ignore only that one.

Functional: `ELASTIC_CLI_CONFIG_FILE` must be unset unless pointing at an intentional fixture. ES: `npm run test:functional:es`. Kibana: `ELASTIC_CLI_CONFIG_FILE=/tmp/local-rc.yml npm run test:functional:kb`. Cloud: `npm run test:functional:cloud`.
