# Configuration

`elastic` reads and writes a single YAML config file containing contexts and the active context.

## Config file location

`elastic` uses the OS-appropriate per-user config directory (via Go's `os.UserConfigDir()`):

- **Linux**: `$XDG_CONFIG_HOME/elastic/config.yaml` (fallback `~/.config/elastic/config.yaml`)
- **macOS**: `~/Library/Application Support/elastic/config.yaml`
- **Windows**: `%AppData%\\elastic\\config.yaml`

On first run, `elastic` will create this file if it does not exist, including a commented-out example configuration.

## Schema

```yaml
current-context: prod
contexts:
  prod:
    cloud_id: "deployment-name:base64..."
    api_key: "encoded-api-key"
    # or use basic auth instead of api_key:
    # username: "elastic"
    # password: "..."
  local:
    elasticsearch_url: "https://localhost:9200"
    kibana_url: "https://localhost:5601"   # optional; required for Kibana-only APIs like SLOs
    api_key: "encoded-api-key"
```

## Fields

- **`current-context`**: Name of the default context to use when `--context` is not provided.
- **`contexts.<name>.cloud_id`**: Elastic Cloud ID for a deployment/project. Used to derive the Elasticsearch endpoint URL.
- **`contexts.<name>.elasticsearch_url`**: Direct Elasticsearch base URL. If set, it overrides `cloud_id` URL derivation.
- **`contexts.<name>.kibana_url`**: Optional Kibana base URL. If omitted, `elastic` derives it from `cloud_id` (preferred) or from an Elastic Cloud-style `elasticsearch_url` when possible.
- **`contexts.<name>.api_key`**: API key used for requests (sent as `Authorization: ApiKey ...`).
- **`contexts.<name>.username`** and **`contexts.<name>.password`**: Basic auth credentials used when `api_key` is not set (sent as `Authorization: Basic ...`).

> **Future**: OAuth2 / UIAM-based authentication (client credentials, authorization code with PKCE, and OIDC token exchange) will be supported via an `auth` sub-object in the context. See [`docs/auth.md`](auth.md) for the full design.

## Commands

Create/update a context:

```bash
elastic config context set prod --cloud-id '...' --api-key '...'
elastic config context set prod --cloud-id '...' --username 'elastic' --password '...'
```

Select the active context:

```bash
elastic config context use prod
```

List contexts:

```bash
elastic config context list
```

## OpenTelemetry

`elastic` can emit OpenTelemetry spans for command execution and outgoing HTTP requests. Telemetry is **opt-in** and configured via the top-level `otel` key in `config.yaml`, using the [OpenTelemetry declarative configuration](https://opentelemetry.io/docs/specs/otel/configuration/) schema (powered by [`otelconf`](https://pkg.go.dev/go.opentelemetry.io/contrib/otelconf)).

When the `otel` key is absent, no telemetry SDK is initialised and no spans are exported.

### Example

```yaml
current-context: prod
contexts:
  prod:
    cloud_id: "..."
    api_key: "..."
otel:
  file_format: "0.3"
  propagator:
    composite:
      - tracecontext: {}
      - baggage: {}
  tracer_provider:
    processors:
      - batch:
          exporter:
            otlp_http:
              endpoint: http://localhost:4318
  resource:
    attributes:
      - name: service.name
        value: elastic-cli
```

By default, `elastic` sets the `service.name` resource attribute to `elastic-cli`. To override it, add your own `service.name` entry under `resource.attributes` in the `otel` block.

The `otel` block supports `${ENV_VAR}` substitution, so you can use environment variables for dynamic values (e.g. `endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT}`).

`elastic` will also join an existing trace when `TRACEPARENT`/`TRACESTATE` (and optional `BAGGAGE`) are set in the environment.
