# Functional Tests

End-to-end tests that run the CLI against real services.

## Directory Structure

```
test/functional/
  cloud/          Cloud & Serverless control plane API tests
    definitions/  YAML test specs generated from @elastic/schemas (committed)
    generated/    bash scripts generated from the definitions (gitignored)
  es/             Elasticsearch API tests (run against a Docker container)
```

## Version-gated definitions

A definition that uses features added in a later stack release declares the
first version that has them. Codegen skips it when `STACK_VERSION` is older:

```yaml
requires:
  stack: true
  stack_since: 9.3.0
```

Codegen also gates on
[`codegen/functional/stack-since.json`](/codegen/functional/stack-since.json):
per-product maps of API name to the version that introduced it. `es` comes from
`@availability stack since=` in `elasticsearch-specification`; `kb` from
operation-level `x-state: ... added in X` in Kibana's `oas_docs/output/kibana.yaml`. A definition is
gated on the newest API it calls. Only APIs added in 9.0 or later are listed.

## Running Locally

### Elasticsearch tests

Requires Docker. The Buildkite script clones
[elasticsearch-clients-tests](https://github.com/elastic/elasticsearch-clients-tests),
generates bash test scripts from the YAML specs, starts an Elasticsearch container,
and runs them. The simplest way to run locally is the Buildkite entry point:

```bash
STACK_VERSION=9.5.3 NODE_VERSION=22 .buildkite/run-es-tests.sh
```

This handles codegen, Docker, and cleanup automatically. The `npm run test:functional:es`
script expects the generated test runner at `test/functional/es/run.sh`, which only
exists after the codegen step above has run.

To run without Buildkite's environment, use
[`scripts/run-es-tests-local.sh`](/scripts/run-es-tests-local.sh) (same flow, isolated
container and config). To regenerate against an existing clone, run
`npm run codegen:functional`; it reads specs from `$ES_CLIENTS_TESTS_DIR`, defaulting to
`../elasticsearch-clients-tests/tests`.

### Cloud tests

Requires a `.elasticrc.yml` with a `cloud` context configured. The tests are
read-only — they only call `list` and `get` endpoints. Test specs are generated
from `@elastic/schemas` (one YAML definition per GET endpoint); `npm run
test:functional:cloud` regenerates the bash scripts and runs them.

```bash
npm run build
npm run test:functional:cloud
```

Regenerate the committed YAML definitions after an `@elastic/schemas` bump with
`npm run codegen:functional:cloud:definitions`.

#### Setting up Cloud credentials

Create (or add to) `~/.elasticrc.yml`:

```yaml
contexts:
  cloud:
    cloud:
      url: https://api.elastic-cloud.com
      auth:
        api_key: <your-cloud-api-key>
current_context: cloud
```

## CI (Buildkite)

Functional tests run in a separate [Buildkite pipeline](/.buildkite/pipeline.yml),
not in the GitHub Actions CI workflow.

| Step | What it does |
|------|-------------|
| **ES functional tests** | Spins up an Elasticsearch Docker container, generates bash test scripts from YAML specs, runs them. Node 24; matrix: stack 9.0–9.5. |
| **Cloud functional tests** | Reads Cloud API credentials from Vault (`secret/ci/elastic-cli/cloud-access`), writes a `.elasticrc.yml`, generates bash scripts from the YAML definitions, runs read-only tests. Node 24. `soft_fail: true` so flaky Cloud API responses don't block builds. |

### Required Vault secret

Cloud tests need `secret/ci/elastic-cli/cloud-access` with an `api_key` field.
The [setup-env.sh](/.buildkite/setup-env.sh) script reads this and generates the
CI config file automatically.

### Environment variables

| Variable | Default | Used by |
|----------|---------|---------|
| `NODE_VERSION` | `24` | Both pipelines — which Node.js version to install via nvm |
| `STACK_VERSION` | `9.5.3` | ES/KB tests — which Docker images to run; written as `version:` in the CI `.elasticrc`; skips definitions with a newer `requires.stack_since` |
| `CLOUD_CREDENTIALS_PATH` | `secret/ci/elastic-cli/cloud-access` | Cloud tests — Vault path for the API key |
