# Data Model: Configuration File Loading

**Date**: 2026-03-30
**Feature**: 002-config-file-loading

## Entities

### ConfigFile (root)

The top-level structure of the YAML configuration file.

| field | type | required | description |
|-------|------|----------|-------------|
| `current-context` | string | Yes | Key of the default active context |
| `contexts` | Record<string, Context> | Yes | Map of context definitions keyed by unique name (min 1 entry) |

**Validation rules**:
- `current-context` must match a key in `contexts`
- `contexts` must contain at least one entry
- Unknown top-level fields are silently ignored

### Context

A named group of service configurations. The context's name/identity is its key in the `contexts` map.

| field | type | required | description |
|-------|------|----------|-------------|
| `elasticsearch` | ServiceBlock | No | Elasticsearch service configuration |
| `kibana` | ServiceBlock | No | Kibana service configuration |
| `cloud` | ServiceBlock | No | Elastic Cloud service configuration |

**Validation rules**:
- At least one service block (`elasticsearch`, `kibana`, or `cloud`) must be present
- Unknown fields within a context are silently ignored

### ServiceBlock

Configuration for a single service within a context.

| field | type | required | description |
|-------|------|----------|-------------|
| `url` | string | Yes | Endpoint URL for the service |
| `auth` | Auth | Yes | Authentication credentials |

**Validation rules**:
- `url` must be a non-empty string (URL format validation deferred to runtime connection)
- `auth` must conform to one of the supported auth types

### Auth (discriminated union)

Authentication credentials. Discriminated on the `type` field.

#### Variant: API Key

| field | type | required | description |
|-------|------|----------|-------------|
| `type` | `'apiKey'` (literal) | Yes | Discriminator |
| `apiKey` | string | Yes | The API key value |

#### Variant: Basic (username/password)

| field | type | required | description |
|-------|------|----------|-------------|
| `type` | `'basic'` (literal) | Yes | Discriminator |
| `username` | string | Yes | Username |
| `password` | string | Yes | Password |

## Resolved Types

### ResolvedConfig

The typed object passed to command handlers after config loading and context resolution.

| field | type | description |
|-------|------|-------------|
| `context` | ResolvedContext | The active context's service blocks (no other contexts visible) |

### ResolvedContext

The active context with only its configured service blocks.

| field | type | description |
|-------|------|-------------|
| `elasticsearch` | ServiceBlock \| undefined | Present if configured in the active context |
| `kibana` | ServiceBlock \| undefined | Present if configured in the active context |
| `cloud` | ServiceBlock \| undefined | Present if configured in the active context |

## Relationships

```text
ConfigFile
├── current-context ──references key in──► contexts
└── contexts: Record<string, Context>
    └── Context
        ├── elasticsearch? ──► ServiceBlock ──► Auth (apiKey | basic)
        ├── kibana?        ──► ServiceBlock ──► Auth (apiKey | basic)
        └── cloud?         ──► ServiceBlock ──► Auth (apiKey | basic)

Resolution: ConfigFile + (--context flag | current-context) ──► ResolvedConfig
```

## Example Config File

```yaml
current-context: production

contexts:
  production:
    elasticsearch:
      url: https://es.prod.example.com:9200
      auth:
        type: apiKey
        apiKey: abc123def456
    kibana:
      url: https://kibana.prod.example.com:5601
      auth:
        type: basic
        username: admin
        password: s3cret

  staging:
    elasticsearch:
      url: https://es.staging.example.com:9200
      auth:
        type: basic
        username: dev
        password: devpass
    cloud:
      url: https://cloud.elastic.co/api
      auth:
        type: apiKey
        apiKey: cloud-key-789
```
