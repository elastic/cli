# Authentication

Today `elastic` authenticates to Elasticsearch using either a static API key (`api_key`) or basic auth (`username` + `password`) stored in the config file. This document also describes planned support for OAuth2-based authentication via Elastic's **Unified Identity and Access Management (UIAM)** platform.

> **Status**: Current releases support API key and basic auth from context config. The UIAM/OAuth2 flows below are design notes for future work and are not implemented yet. For current configuration examples, see [`docs/config.md`](config.md).

## Background: UIAM

[UIAM](https://github.com/elastic/uiam) is Elastic's centralized identity layer for Elastic Cloud. It provides:

- A single identity for users and service accounts across all Elastic Cloud products.
- OAuth2 / OpenID Connect (OIDC) compliant authorization and token endpoints.
- Scoped access tokens that can be used to authenticate to Elasticsearch clusters, Kibana, and other Elastic services without managing per-cluster API keys.

By integrating with UIAM, `elastic` will be able to obtain short-lived access tokens and use them to access Elastic Cloud clusters, removing the need for long-lived API keys.

## Planned authentication methods

### 1. OAuth2 Client Credentials

**Use case**: Unattended / CI / service-to-service access.

A pre-registered OAuth2 client (identified by a `client_id` and `client_secret`) requests an access token direlasticy from the UIAM token endpoint. No interactive login is needed.

```
elastic ──POST /oauth2/token──► UIAM
      grant_type=client_credentials
      client_id=...
      client_secret=...
      scope=...

elastic ◄── access_token ──── UIAM

elastic ──Bearer <token>──► Elasticsearch
```

**Config example** (future):

```yaml
contexts:
  ci-prod:
    cloud_id: "deploy:base64..."
    auth:
      method: client_credentials
      client_id: "elastic-ci"
      client_secret: "${ELASTIC_CLIENT_SECRET}"   # env-var expansion
      token_url: "https://auth.elastic.co/oauth2/token"
      scopes:
        - "cluster:read"
```

### 2. OAuth2 Authorization Code (with PKCE)

**Use case**: Interactive developer login.

`elastic` opens the user's browser to the UIAM authorization endpoint. After the user authenticates (and optionally completes MFA), UIAM redirects back to a temporary localhost callback with an authorization code. `elastic` exchanges the code for an access token and a refresh token.

PKCE (Proof Key for Code Exchange, [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)) is used to secure the flow for public / native CLI clients that cannot safely store a client secret.

```
elastic ──browser open──► UIAM /oauth2/authorize
                        ?response_type=code
                        &client_id=elastic
                        &redirect_uri=http://localhost:<port>/callback
                        &code_challenge=<S256 hash>
                        &scope=...

User authenticates in browser

UIAM ──redirect──► http://localhost:<port>/callback?code=...

elastic ──POST /oauth2/token──► UIAM
      grant_type=authorization_code
      code=...
      code_verifier=...

elastic ◄── access_token + refresh_token ──── UIAM

elastic ──Bearer <token>──► Elasticsearch
```

**Config example** (future):

```yaml
contexts:
  dev:
    cloud_id: "deploy:base64..."
    auth:
      method: authorization_code
      client_id: "elastic"
      issuer: "https://auth.elastic.co"
      scopes:
        - "cluster:read"
        - "cluster:write"
```

`elastic login` will trigger the browser flow and cache the tokens locally. `elastic` will transparently refresh the access token using the stored refresh token.

### 3. OIDC Token Exchange

**Use case**: Workload identity federation; environments that already have an OIDC token from an external identity provider (e.g., GitHub Actions, GCP, AWS).

The caller supplies an existing OIDC ID token. `elastic` presents it to the UIAM token-exchange endpoint ([RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693)), which validates the external token and returns an Elastic access token.

```
External IdP ──id_token──► elastic

elastic ──POST /oauth2/token──► UIAM
      grant_type=urn:ietf:params:oauth:grant-type:token-exchange
      subject_token=<external OIDC id_token>
      subject_token_type=urn:ietf:params:oauth:token-type:id_token
      requested_token_type=urn:ietf:params:oauth:token-type:access_token
      scope=...

elastic ◄── access_token ──── UIAM

elastic ──Bearer <token>──► Elasticsearch
```

**Config example** (future):

```yaml
contexts:
  gha:
    cloud_id: "deploy:base64..."
    auth:
      method: token_exchange
      client_id: "elastic-gha"
      token_url: "https://auth.elastic.co/oauth2/token"
      subject_token_env: "ACTIONS_ID_TOKEN_REQUEST_TOKEN"   # source of the external OIDC token
      scopes:
        - "cluster:read"
```

## How UIAM credentials are used to access clusters

With API-key auth, `elastic` sends `Authorization: ApiKey <key>` direlasticy to the Elasticsearch endpoint.

With UIAM-based auth, the flow changes:

1. **Token acquisition** -- `elastic` obtains an OAuth2 access token from the UIAM token endpoint using one of the methods above.
2. **Token caching** -- The access token (and refresh token, if present) are stored in a per-context credential cache on disk, protected with user-only file permissions (`0600`). The cache lives alongside the config file (e.g., `~/.config/elastic/credentials.yaml`).
3. **Request authentication** -- `elastic` sends requests to Elasticsearch with `Authorization: Bearer <access_token>`. UIAM-aware Elastic Cloud proxies validate the token and map it to the appropriate cluster permissions.
4. **Transparent refresh** -- When an access token is expired or about to expire, `elastic` automatically refreshes it using the stored refresh token (authorization-code flow) or by requesting a new one (client-credentials and token-exchange flows).
5. **Scoping** -- Token scopes requested during authentication determine what the bearer can do. This is enforced server-side by UIAM and the Elastic Cloud infrastructure; `elastic` does not need to manage per-cluster API keys.

### Credential precedence

When both `api_key` and `auth` are set in a context, `api_key` takes precedence for backward compatibility. A future version may warn about ambiguous configuration.

The planned precedence order:

1. `--api-key` flag (if added) or `api_key` in the context config -- static API key, sent as `Authorization: ApiKey ...`.
2. `auth.method` in the context config -- OAuth2 flow, produces `Authorization: Bearer ...`.
3. `ELASTIC_API_KEY` environment variable (future) -- fallback static API key.

## Planned config schema changes

The `Context` struct will gain an `Auth` sub-object:

```yaml
contexts:
  <name>:
    cloud_id: "..."                          # existing
    elasticsearch_url: "..."                 # existing
    api_key: "..."                           # existing (static key)
    auth:                                    # new (OAuth2 / UIAM)
      method: "client_credentials | authorization_code | token_exchange"
      client_id: "..."
      client_secret: "..."                   # client_credentials only
      issuer: "..."                          # OIDC discovery base URL
      token_url: "..."                       # explicit token endpoint (overrides discovery)
      scopes: [...]
      subject_token_env: "..."               # token_exchange only
```

## Planned CLI commands

| Command | Description |
|---|---|
| `elastic login` | Start an interactive authorization-code login for the current context. |
| `elastic logout` | Clear cached tokens for the current (or specified) context. |
| `elastic auth status` | Show current auth method, token expiry, and scopes for the active context. |

## Security considerations

- **Credential storage** -- Tokens are stored in a dedicated credentials file with `0600` permissions. The config file itself continues to hold non-token settings, and currently stores static credentials (`api_key`, `username`, and `password`) for context-based auth.
- **Client secrets** -- For the client-credentials flow, `client_secret` can be supplied via environment variable expansion (`${VAR}`) to avoid writing secrets to disk.
- **PKCE** -- The authorization-code flow always uses PKCE (`S256`). A plain `code_challenge_method` is not supported.
- **Token lifetimes** -- `elastic` respects the `expires_in` value from the token response and proactively refreshes tokens before they expire.
- **Revocation** -- `elastic logout` revokes tokens at the UIAM revocation endpoint when available, in addition to deleting them locally.
