# @elastic/config-resolver

Expression resolver used by the [Elastic CLI](https://github.com/elastic/cli)
config pipeline. Walks arbitrary JSON-like values and replaces strings of the
form `$(name:params)` with values fetched from a pluggable set of resolvers.

Built-in resolvers: `file`, `env`, `cmd`, `keychain` (macOS), `secret_service`
(Linux), `pass`, `credential_manager` (Windows).

Additional resolvers can be registered at runtime via `registerResolver`.

Published in-tree as a private workspace package. This is not currently
released to the public npm registry; depend on it through the workspace.
