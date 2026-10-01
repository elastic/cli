---
description: Learn about the contexts, credentials, command policies, and other properties supported in an Elastic CLI configuration file.
applies_to:
  stack: preview
  serverless: preview
type: overview
---

# Configuration file reference

The `.elasticrc` configuration file defines connection contexts, credentials, command policies, and CLI behavior. See [Configure the Elastic CLI](./configuration.md) to learn where to store the file and how to resolve secret values.

## Supported properties [supported-properties]

| Name | Type | Required | Default value | Description |
| - | - | - | - | - |
| `current_context` | string | yes | - | The key of the context (from `contexts`) that is active by default. Must reference an existing key in `contexts`. |
| `contexts` | object | yes | - | A map of named contexts, each a collection of service blocks (`elasticsearch`, `kibana`, `cloud`) and an optional per-context `commands` policy. At least one map entry is required, and each context must define at least one service block. See [contexts](#contexts). |
| `commands` | object | no | - | The root-level command allow/deny policy. Overridden by a context's own `commands` policy when present. See [command policy](#command-policy). |
| `default_profile` | string (`serverless` \| `stack` \| `default`) | no | - | Fallback built-in profile applied to any context that does not set its own `commands.profile`. Overridden by a per-context `commands.profile` and by the `--command-profile` CLI flag. |
| `banner` | boolean | no | `true` | Whether to show the startup banner. |
| `telemetry` | boolean | no | `true` | Whether to collect anonymous usage telemetry. Set to `false` to turn off collection of anonymous telemetry. Overridden by the `ELASTIC_CLI_TELEMETRY` environment variable. |

### `contexts.<name>` [contexts]

Each entry in `contexts` is a named context: a collection of optional service blocks plus an optional command policy. At least one of `elasticsearch`, `kibana`, or `cloud` is required.

| Name | Type | Required | Default value | Description |
| - | - | - | - | - |
| `elasticsearch` | object | no^1^ | - | {{es}} service block. See [Service block](#service-block). |
| `kibana` | object | no^1^ | - | {{kib}} service block. See [Service block](#service-block). |
| `cloud` | object | no^1^ | - | {{ecloud}} service block. See [Service block](#service-block). |
| `commands` | object | no | - | Per-context command allow/deny policy. Takes precedence over the root-level `commands` policy. |

^1^ At least one of `elasticsearch`, `kibana`, or `cloud` must be present.

#### Service block (`elasticsearch`, `kibana`, `cloud`) [service-block]

The endpoint URL and authentication credentials for a single service.

| Name | Type | Required | Default value | Description |
| - | - | - | - | - |
| `url` | string | yes | - | Service endpoint URL. Must be a valid URL using the `http://` or `https://` scheme. |
| `auth` | object | no | - | Authentication credentials for the service. {{es}} and {{kib}} support [API key](#auth-api-key) or [basic authentication](#auth-basic); {{ecloud}} requires an [API key](#auth-api-key). |

##### Auth: API key [auth-api-key]

| Name | Type | Required | Default value | Description |
| - | - | - | - | - |
| `api_key` | string | yes | - | API key authentication credential. |

##### Auth: Basic [auth-basic]

| Name | Type | Required | Default value | Description |
| - | - | - | - | - |
| `username` | string | yes | - | Basic auth username. |
| `password` | string | yes | - | Basic auth password. |

### Command policy (`commands`) [command-policy]

Policy controlling which commands are permitted to run. Applies at the root level and, optionally, per-context.

| Name | Type | Required | Default value | Description |
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

| Profile | Description |
| - | - |
| `serverless` | Only commands that work on {{serverless-full}}. Hides `cloud hosted` and exposes `cloud serverless` plus the majority of stack commands. |
| `stack` | Full command surface, including self-managed / hosted-only APIs. Equivalent to having no policy (allow everything). |
| `default` | Alias for `serverless`; the most conservative baseline, recommended for agents and LLM-based tooling. |
