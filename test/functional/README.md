# Functional Tests

End-to-end tests that run the CLI against real services.

## Directory Structure

```
test/functional/
  cloud/          Cloud & Serverless control plane smoke tests
  es/             Elasticsearch API tests (run against a Docker container)
```

## Running Locally

### Elasticsearch tests

Requires Docker. The Buildkite script clones
[elasticsearch-clients-tests](https://github.com/elastic/elasticsearch-clients-tests),
generates bash test scripts from the YAML specs, starts an Elasticsearch container,
and runs them. The simplest way to run locally is the Buildkite entry point:

```bash
STACK_VERSION=9.3.0 NODE_VERSION=22 .buildkite/run-es-tests.sh
```

This handles codegen, Docker, and cleanup automatically. The `npm run test:functional:es`
script expects the generated test runner at `test/functional/es/run.sh`, which only
exists after the codegen step above has run.

### Cloud tests

Requires a `.elasticrc.yml` with a `cloud` context configured. The tests are
read-only — they only call `list` and `get` endpoints.

```bash
npm run build
npm run test:functional:cloud
```

If no Cloud credentials are found the test suite exits 0 and skips all tests.

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
| **ES functional tests** | Spins up an Elasticsearch Docker container, generates bash test scripts from YAML specs, runs them. Matrix: Node 22 + 24. |
| **Cloud smoke tests** | Reads Cloud API credentials from Vault (`secret/ci/elastic-cli/cloud-access`), writes a `.elasticrc.yml`, runs read-only smoke tests. Matrix: Node 22 + 24. `soft_fail: true` so flaky Cloud API responses don't block builds. |

### Required Vault secret

Cloud tests need `secret/ci/elastic-cli/cloud-access` with an `api_key` field.
The [setup-env.sh](/.buildkite/setup-env.sh) script reads this and generates the
CI config file automatically.

### Environment variables

| Variable | Default | Used by |
|----------|---------|---------|
| `NODE_VERSION` | `22` | Both pipelines — which Node.js version to install via nvm |
| `STACK_VERSION` | `9.3.0` | ES tests — which Elasticsearch Docker image to run |
| `CLOUD_CREDENTIALS_PATH` | `secret/ci/elastic-cli/cloud-access` | Cloud tests — Vault path for the API key |
