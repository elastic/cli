---
description: Reference documentation for all configuration file options.
applies_to:
  stack: preview
  serverless: preview
type: overview
---

# Configuration file reference

The `.elasticrc` configuration file is a YAML file that supports all the following properties.
See [Configure the Elastic CLI](./configuration.md) for details on where to store the file, how to resolve secret values, and more.

## Supported properties

| name | type | required | default value | description |
| - | - | - | - | - |
| `current_context` | string | yes | - | The key of the context (from `contexts`) that is active by default. Must reference an existing key in `contexts`. |
| `contexts` | object | yes | - | A map of named contexts, each a collection of service blocks (`elasticsearch`, `kibana`, `cloud`) and an optional per-context `commands` policy. At least one map entry is required, and each context must define at least one service block. See [contexts](#contexts.name). |
| `commands` | object | no | - | The root-level command allow/deny policy. Overridden by a context's own `commands` policy when present. See [command policy](#commands-command-policy). |
| `default_profile` | string (`serverless` \| `stack` \| `default`) | no | - | Fallback built-in profile applied to any context that does not set its own `commands.profile`. Overridden by a per-context `commands.profile` and by the `--profile` CLI flag. |
| `banner` | boolean | no | `true` | Whether to show the startup banner. |

### `contexts.<name>`

Each entry in `contexts` is a named context: a collection of optional service blocks plus an optional command policy. At least one of `elasticsearch`, `kibana`, or `cloud` is required.

| name | type | required | default value | description |
| - | - | - | - | - |
| `elasticsearch` | object | no* | - | Elasticsearch service block. See [Service block](#service-block-elasticsearch-kibana-cloud). |
| `kibana` | object | no* | - | Kibana service block. See [Service block](#service-block-elasticsearch-kibana-cloud). |
| `cloud` | object | no* | - | Elastic Cloud service block. See [Service block](#service-block-elasticsearch-kibana-cloud). |
| `commands` | object | no | - | Per-context command allow/deny policy. Takes precedence over the root-level `commands` policy. |

\* At least one of `elasticsearch`, `kibana`, or `cloud` must be present.

#### Service block (`elasticsearch`, `kibana`, `cloud`)

The endpoint URL and authentication credentials for a single service.

| name | type | required | default value | description |
| - | - | - | - | - |
| `url` | string | yes | - | Service endpoint URL. Must be a valid URL using the `http://` or `https://` scheme. |
| `auth` | object | no | - | Authentication credentials for the service; either [API key](#auth-api-key) or [basic auth](#auth-basic), inferred from the fields present. |

##### Auth: API key

| name | type | required | default value | description |
| - | - | - | - | - |
| `api_key` | string | yes | - | API key authentication credential. |

##### Auth: Basic

| name | type | required | default value | description |
| - | - | - | - | - |
| `username` | string | yes | - | Basic auth username. |
| `password` | string | yes | - | Basic auth password. |

## `commands` (command policy)

Policy controlling which commands are permitted to run. Applies at the root level and, optionally, per-context.

| name | type | required | default value | description |
| - | - | - | - | - |
| `profile` | string (`serverless` \| `stack` \| `default`) | no | - | Built-in allow-list profile. Mutually exclusive with `allowed`. |
| `allowed` | array of strings | no | - | Explicit allow-list of command names/namespaces. Entries can use a trailing wildcard (example: `stack.es.*`) to match a namespace. Mutually exclusive with `profile` and `blocked`. |
| `blocked` | array of strings | no | - | Explicit deny-list of command names/namespaces (everything else is allowed). Entries can use a trailing wildcard. Mutually exclusive with `allowed`. |

Valid combinations:

- `profile` alone; use a built-in allow-list.
- `profile` + `blocked`; built-in allow-list with additional restrictions.
- `allowed` alone; explicit allow-list.
- `blocked` alone; explicit deny-list.

Built-in profiles (`profile` / `default_profile`):

| profile | description |
| - | - |
| `serverless` | Only commands that work on Elastic Serverless. Hides `cloud hosted` and exposes `cloud serverless` plus all stack commands. |
| `stack` | Full command surface, including self-managed / hosted-only APIs. Equivalent to having no policy (allow everything). |
| `default` | Alias for `serverless`; the most conservative baseline, recommended for agents and LLM-based tooling. |
