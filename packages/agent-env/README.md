# @elastic/agent-env

Detect the coding-agent harness (Claude Code, Cursor, Codex, Gemini CLI, …)
that spawned the current process from its environment variables. Marker table
sourced from [Hugging Face's `agent-harnesses.ts` registry](https://github.com/huggingface/huggingface.js/blob/main/packages/tasks/src/agent-harnesses.ts).

## Usage

```ts
import { detectAgent } from '@elastic/agent-env'

const result = detectAgent() // minConfidence defaults to 0.95

if (result.isOk()) {
  const { agent, confidence, llm } = result.value
  console.log(`${agent} (${confidence})${llm ? ` ${llm.vendor ?? '?'}/${llm.model}` : ''}`)
} else {
  console.error(result.error.message)
}
```

`detectAgent(minConfidence = 0.95, env = process.env)` returns a
[`Result`](https://www.typescript-result.dev) instead of throwing:

- **`Result.ok({ agent, confidence, llm? })`** — `confidence` is the share of matched
  env vars pointing at the winning agent (all agreeing → `1`; two Claude vars +
  one Codex var → `0.666…`). Ties break by marker priority order. `llm` is
  `{ model, vendor? }` — the active model id when the harness exposes it as an
  env var (absent otherwise); see below.
- **`Result.error({ code: 'no-agent-detected', … })`** — no known markers found.
- **`Result.error({ code: 'low-confidence', agent, confidence, … })`** —
  `confidence` fell below `minConfidence`.

`agent` is typed as `AgentId` (`KnownAgent | string`). Values outside
`KnownAgent` can appear when the `AI_AGENT` env var is set to an unrecognized
string (see [Universal opt-in](#universal-opt-in) below).

## Known agents

The `KnownAgent` union and the `AGENT_SHORT_CODES` record both cover these agents:

| `KnownAgent` | Short code | Notes |
|---|---|---|
| `antigravity` | `ag` | |
| `augment-cli` | `au` | |
| `cline` | `cl` | |
| `claude-code` | `cc` | |
| `codex` | `cx` | |
| `cowork` | `cw` | Claude Code cowork variant |
| `crush` | `ch` | |
| `cursor` | `cr` | |
| `cursor-cli` | `cu` | |
| `gemini-cli` | `gm` | |
| `github-copilot` | `gh` | |
| `goose` | `go` | |
| `hermes-agent` | `he` | |
| `kilo-code` | `ki` | |
| `kiro` | `kr` | |
| `openclaw` | `ow` | |
| `opencode` | `oc` | |
| `pi` | `pi` | |
| `replit` | `rp` | |
| `trae` | `tr` | |
| `vtcode` | `vt` | |
| `warp` | `wp` | |
| `zed` | `zd` | |

`AGENT_SHORT_CODES` is exported as `Record<KnownAgent, string>` for use in
telemetry, tracing, or log fields where a compact token is preferable to the
full agent id.

```ts
import { AGENT_SHORT_CODES } from '@elastic/agent-env'
// AGENT_SHORT_CODES['claude-code'] === 'cc'
```

## Universal opt-in

Two env vars let any harness self-identify without a dedicated marker:

| Env var | Accepted values | Notes |
|---|---|---|
| `AI_AGENT` | Any non-empty string | Value is used verbatim as the agent id; can produce `AgentId` values outside `KnownAgent` |
| `AGENT` | `KnownAgent` values only | Restricted to known agents to avoid misattribution from unrelated `AGENT` vars set by other tooling |

These are checked before the marker table, so they take priority when present.

## CLI telemetry

The Elastic CLI consumes this package to attribute traffic to the spawning
harness. The detected agent's short code is appended to `x-elastic-client-meta`
as `ag=<code>`, and any detected LLM is appended to the `user-agent` string.
Detection below the default `0.95` confidence, or an agent with no short code,
emits neither.

| Harness env vars | `user-agent` (suffix) | `x-elastic-client-meta` (suffix) |
|---|---|---|
| `CLAUDECODE=1`, `ANTHROPIC_MODEL=claude-sonnet-4-5` | `; anthropic/claude-sonnet-4-5` | `,ag=cc` |
| `PI_CODING_AGENT=true`, `PI_MODEL=anthropic/claude-sonnet-4-5` | `; anthropic/claude-sonnet-4-5` | `,ag=pi` |
| `CURSOR_TRACE_ID=…` (no model var) | (none) | `,ag=cr` |
| `AI_AGENT=devin` (no short code) | (none) | (none) |

Full emitted headers for the first row:

```text
user-agent: elastic-cli/0.5.0 (linux x64; Node.js v22.0.0; anthropic/claude-sonnet-4-5)
x-elastic-client-meta: et=0.5.0,js=22.0.0,t=0.5.0,ag=cc
```

## LLM model detection

When the detected harness publishes the active model id as an env var, `llm` is
populated in the success result as `{ model, vendor? }`. `model` is the canonical
lowercase id; `vendor` is normalized for telemetry grouping and omitted when it
cannot be established. Vendor precedence: an explicit `vendor/model` value (split
on the first `/`), then the agent's known vendor, then a model-prefix lookup
(e.g. `claude*`→`anthropic`, `gpt*`→`openai`). Coverage is limited to harnesses
whose official documentation describes a stable model env var:

| Agent | Env var | Source |
|---|---|---|
| `pi` | `PI_MODEL` | [Pi environment variables](https://pi.dev/docs/latest/environment-variables) — injected by Pi into every bash/powershell tool subprocess |
| `claude-code` / `cowork` | `ANTHROPIC_MODEL` | [Claude Code env vars](https://code.claude.com/docs/en/env-vars) — "Name of the model setting to use" |
| `github-copilot` | `COPILOT_MODEL` | [GitHub Copilot CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) — "Use `--model=MODEL` or the `COPILOT_MODEL` environment variable to select the AI model" |

All other harnesses return no `llm` field; the HuggingFace `agent-harnesses.ts`
registry does not define model-detection env vars for them.

## Utility exports

`resolveLlm(raw, agentVendor?)` and `normalizeModelId(raw)` are exported for
callers that parse model strings independently of `detectAgent`.

- **`resolveLlm(raw, agentVendor?)`** — splits a raw model string into
  `{ model, vendor? }` using the same vendor-precedence logic as `detectAgent`.
- **`normalizeModelId(raw)`** — lowercases, trims, and collapses internal
  whitespace to hyphens.
