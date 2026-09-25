# `elastic quickstart` as an extension — design

Status: design agreed, skeleton landed. Supersedes nothing; the in-tree MVP on
`feat/quickstart-mvp` is the reference implementation being ported.

Constraint: **ship as an extension first, with no changes to the CLI core.** Every
gap below is therefore absorbed by the extension or accepted as a loss, not fixed
in `src/`. The final section lists what would change if that constraint were lifted.

## Host contract, as measured

The behaviours below were verified against `src/cli.ts` and `src/extension/*` at
`db5fea8` by registering a probe extension and inspecting what the child received.

| Behaviour | Result |
|---|---|
| Positional args and flags after the command name | forwarded verbatim (`elastic qs --json` → `["--json"]`) |
| `stdio` | `inherit` — TTY, color, and interactive prompts all work |
| Exit code | propagated |
| `--help` / `-h` anywhere in argv | **dispatch is skipped**; the root CLI help prints and exits 0 |
| Global flags before the command name | arg slicing is a fixed `process.argv.slice(3)`, so the flag value and the command name arrive as args |
| `--use-context` / `--config-file` / `--command-profile` | not forwarded to context resolution; config errors are swallowed |
| Environment | allowlist in `src/extension/env.ts`; everything else is dropped, including `ELASTIC_ENV`, `NO_COLOR`, `FORCE_COLOR`, `CI` |
| Context credentials | `ELASTIC_{ES,KIBANA,CLOUD}_*` for the **active context only**, captured at spawn time |
| `cli-schema` / shell completion | extensions do not appear in either |
| Install | `git clone --depth 1` then `npm install --production --ignore-scripts`, or `npm install --ignore-scripts` for `npm:` sources |

`--ignore-scripts` on both paths is the load-bearing detail for packaging: there is
no build step at install time.

## What the extension gives up

Lost outright, with no in-extension workaround:

- **`elastic quickstart --help`** prints the root CLI help instead of the command's.
  It fails silently rather than erroring, which makes it the most user-hostile item
  on this list. Mitigated only by supporting a `help` positional.
- **Agent discoverability through `cli-schema`.** The runbook contract itself is
  unaffected, but the entry point to it is no longer in the CLI's introspection
  output. Extension-aware agents can still find it via `elastic extension list --json`.
- **Shell completion.**
- **`--output-fields` / `--output-template`** on quickstart output.

Reimplemented in the extension rather than inherited from `factory.ts`:

- `--dry-run`.
- The `{"error": {"code", "message"}}` stderr envelope and exit-code normalisation.

Unaffected: `--json` and the entire agent runbook, TTY mode detection, the clack
interactive layer, browser and IDE handoff, agent detection via `PATH`, the value
node (index create, bulk ingest, refresh, BM25-vs-semantic), provisioning with
`--wait` / `--save-as`, the 403 entitlement fallback, the context document, and the
sample-app installer seam. Global-flag forwarding costs nothing, because
`quickstart` is in `skipConfigNames` and accepts no global flags today.

## Forced adaptations

### 1. `ELASTIC_ENV` becomes `--env`

The env allowlist drops `ELASTIC_ENV`, so the prod/QA switch moves to a flag.
`resolveCloudEnv` reads parsed argv instead of `process.env`. Unknown values stay a
hard `bad_env` error — never a silent prod fallback.

Cost: the switch can no longer be set once in a shell profile, and existing QA
scripts and the `expect` E2E harness must pass the flag. `NO_COLOR` / `FORCE_COLOR`
move to `--no-color` for the same reason.

### 2. The parent CLI is resolved from `PATH`

`selfExecArgv()` re-execs `process.execPath` plus `process.argv[1]`, which an
extension has no equivalent for. The extension resolves `elastic` on `PATH` and
probes `elastic --version` at startup, failing with an actionable message when it
is missing. `--cli-bin <path>` is the escape hatch; it is a flag rather than an
env var because env vars do not survive the allowlist.

Rejected alternative: depending on `@elastic/cli` and invoking the resolved copy.
It pins a known version, but installs a second CLI and can silently differ from the
`elastic` the user actually typed.

### 3. Both API keys are minted at provision time

`mintEsApiKeyForApp` currently reads the project's admin basic-auth pair out of a
named, non-active context and calls Elasticsearch directly, because Elasticsearch
will not mint a usable derived key from an API-key parent — a derived key
authenticates and then 403s on every call.

An extension cannot read that pair: spawn-time env carries the active context only,
and by handoff time the project context holds an API key. The subprocess fallback
would hand the sample app a key that fails on first use.

The flow therefore mints **both** the context key and the sample-app key during
provisioning, while the context still has basic auth, and carries the app key in
memory to the installer.

### 4. Credential writes

`persistCloudApiKey` and the post-mint rewrite of the project context's
Elasticsearch auth both bypass argv by design, writing through the in-process
config writer and OS secret store. The only public equivalent is
`elastic config context add|edit --cloud-api-key|--es-api-key <value>`, which
`src/config/commands.ts` itself warns is visible in process listings and shell
history — and writes that warning to stderr, where clack draws its frames.

This also contradicts a standing requirement in `AGENTS.md`: *"No credentials as
CLI flags. API keys, passwords, and tokens belong only in the config file or
environment variables."*

Resolution under the no-core-changes constraint:

- **Pasted Cloud key**: drop the in-flow paste. `elastic config context add
  --cloud-api-key` becomes a documented prerequisite. This costs the zero-flag
  promise and moves the hardest step out of the guided flow, but keeps the key out
  of argv and avoids duplicating the writer and keychain policy — including the
  macOS `security -w` detached-spawn fix — inside the extension.
- **Post-mint Elasticsearch rewrite**: unresolved. The key is minted by quickstart
  and never seen by the user, so routing it through argv is a regression nobody
  asked for. Tracked as the one item most likely to justify a core change.

Auth reuse detection survives as `elastic config context list --json` followed by
`elastic status --use-context <name> --json` per candidate, replacing one in-process
scan with N subprocesses.

## Packaging

TypeScript source executed directly by Node's type stripping, with no build step
and no committed `dist/`.

`--ignore-scripts` means `prepare` never runs at install time, so a TypeScript
extension would otherwise have to commit build output or ship only via npm.
Running the source directly avoids both: `bin/elastic-quickstart.ts` carries a
`#!/usr/bin/env node` shebang and mode 0755, and the host spawns it as-is.

This sets the floor at Node 22.18 (type stripping unflagged), above the CLI's own
Node 22 requirement. Enum, namespace, and parameter-property syntax are unavailable,
which matches the conventions in `AGENTS.md` already.

Both install paths work: `github:elastic/elastic-quickstart` and, once published,
`npm:elastic-quickstart`.

## If the core constraint were lifted

In rough order of value per line changed:

1. Dispatch `--help` to the extension, and slice args from the resolved command
   position rather than a fixed index.
2. Export `ELASTIC_CLI_BIN` and `ELASTIC_CLI_VERSION` alongside the context vars.
3. Pass through non-secret `ELASTIC_*`, `NO_COLOR`, `FORCE_COLOR`, and `CI`.
4. Accept secrets on stdin (`--es-api-key -`), which closes adaptation 4 entirely
   and brings `config context` back in line with the `AGENTS.md` rule.
5. An extension manifest declaring commands and schema, so extensions reach
   `cli-schema` and completion.

## Skeleton

`extensions/quickstart/` holds the four adaptations above and nothing else; the
journey itself is not yet ported.

| Module | Role |
|---|---|
| `bin/elastic-quickstart.ts` | executable entry; shebang, argv, exit-code handling |
| `src/argv.ts` | flag parsing — `--json`, `--env`, `--no-color`, `--cli-bin`, `--dry-run`, `help` |
| `src/cli-bin.ts` | resolve and version-probe the parent CLI (adaptation 2) |
| `src/executor.ts` | `runCli` over the resolved binary |
| `src/mode.ts` | TTY / `--json` mode detection, ported unchanged |
| `src/errors.ts` | error envelope and exit codes, replacing `factory.ts` |

Directory placement keeps it outside the CLI's `tsconfig` and `eslint` globs so
extraction to `elastic/elastic-quickstart` is a `git mv`.
