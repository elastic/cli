/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

interface Marker {
  env: string
  agent: KnownAgent
  /** Exact value required to match; omit to match any non-empty value. */
  value?: string
}

export type KnownAgent =
  | 'cowork'
  | 'claude-code'
  | 'cursor-cli'
  | 'cursor'
  | 'codex'
  | 'gemini-cli'
  | 'github-copilot'
  | 'antigravity'
  | 'augment-cli'
  | 'cline'
  | 'crush'
  | 'goose'
  | 'hermes-agent'
  | 'kilo-code'
  | 'kiro'
  | 'openclaw'
  | 'opencode'
  | 'pi'
  | 'replit'
  | 'trae'
  | 'vtcode'
  | 'zed'
  | 'warp'

export type AgentId = KnownAgent | (string & {})

export interface LlmInfo {
  /** Canonical lowercase model id with any vendor prefix stripped. */
  model: string
  /** Normalized vendor, omitted when it cannot be established. */
  vendor?: string
}

export interface Detection {
  agent: AgentId
  confidence: number
  llm?: LlmInfo
}

export const AGENT_SHORT_CODES: Record<KnownAgent, string> = {
  cowork: 'cw',
  'claude-code': 'cc',
  'cursor-cli': 'cu',
  cursor: 'cr',
  codex: 'cx',
  'gemini-cli': 'gm',
  'github-copilot': 'gh',
  antigravity: 'ag',
  'augment-cli': 'au',
  cline: 'cl',
  crush: 'ch',
  goose: 'go',
  'hermes-agent': 'he',
  'kilo-code': 'ki',
  kiro: 'kr',
  openclaw: 'ow',
  opencode: 'oc',
  pi: 'pi',
  replit: 'rp',
  trae: 'tr',
  vtcode: 'vt',
  zed: 'zd',
  warp: 'wp',
}

/**
 * Ordered marker table. Order encodes detection priority for tie-breaking:
 * more specific signals precede generic ones (`cowork` before `claude-code`,
 * `cursor-cli` before `cursor`), matching the HF registry's first-match-wins
 * semantics. Presence is the signal unless {@link Marker.value} is set.
 */
const MARKERS: Marker[] = [
  { env: 'CLAUDE_CODE_IS_COWORK', agent: 'cowork' },
  { env: 'CLAUDECODE', agent: 'claude-code' },
  { env: 'CLAUDE_CODE', agent: 'claude-code' },
  { env: 'CODEX_SANDBOX', agent: 'codex' },
  { env: 'CODEX_CI', agent: 'codex' },
  { env: 'CODEX_THREAD_ID', agent: 'codex' },
  { env: 'GEMINI_CLI', agent: 'gemini-cli' },
  { env: 'COPILOT_MODEL', agent: 'github-copilot' },
  { env: 'COPILOT_ALLOW_ALL', agent: 'github-copilot' },
  { env: 'COPILOT_GITHUB_TOKEN', agent: 'github-copilot' },
  { env: 'ANTIGRAVITY_AGENT', agent: 'antigravity' },
  { env: 'AUGMENT_AGENT', agent: 'augment-cli' },
  { env: 'CLINE_ACTIVE', agent: 'cline' },
  { env: 'CRUSH', agent: 'crush' },
  { env: 'GOOSE_TERMINAL', agent: 'goose' },
  { env: 'HERMES_SESSION_ID', agent: 'hermes-agent' },
  { env: 'KILOCODE_FEATURE', agent: 'kilo-code' },
  { env: 'AGENT_CONTEXT_OUT', agent: 'kiro' },
  { env: 'OPENCLAW_SHELL', agent: 'openclaw' },
  { env: 'OPENCODE_CLIENT', agent: 'opencode' },
  { env: 'PI_CODING_AGENT', agent: 'pi' },
  { env: 'REPL_ID', agent: 'replit' },
  { env: 'TRAE_AI_SHELL_ID', agent: 'trae' },
  { env: 'VTCODE', agent: 'vtcode', value: '1' },
  { env: 'ZED_TERM', agent: 'zed' },
  // Cursor markers sit last: CURSOR_TRACE_ID is commonly inherited by child
  // processes, so it must lose to any concurrently-present harness marker.
  { env: 'CURSOR_AGENT', agent: 'cursor-cli' },
  { env: 'CURSOR_TRACE_ID', agent: 'cursor' },
  { env: 'TERM_PROGRAM', agent: 'warp', value: 'WarpTerminal' },
]

/**
 * Env var that carries the active LLM model id for each agent, sourced from
 * official harness documentation:
 * - `pi`            → `PI_MODEL`          https://pi.dev/docs/latest/environment-variables
 * - `claude-code`   → `ANTHROPIC_MODEL`   https://code.claude.com/docs/en/env-vars
 * - `cowork`        → `ANTHROPIC_MODEL`   (cowork is built on Claude Code; same var)
 * - `github-copilot`→ `COPILOT_MODEL`     https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
 */
const AGENT_MODEL_VARS: Partial<Record<AgentId, string>> = {
  pi: 'PI_MODEL',
  'claude-code': 'ANTHROPIC_MODEL',
  cowork: 'ANTHROPIC_MODEL',
  'github-copilot': 'COPILOT_MODEL',
}

/** Known model vendor for agents whose model var is provider-specific. */
const AGENT_MODEL_VENDOR: Partial<Record<AgentId, string>> = {
  'claude-code': 'anthropic',
  cowork: 'anthropic',
}

/**
 * Prefix → vendor lookup for values with no explicit `vendor/` segment.
 * ponytail: small prefix table, extend when telemetry shows unmapped vendors.
 */
const VENDOR_BY_PREFIX: Array<[RegExp, string]> = [
  [/^(gpt|o[134]|chatgpt|davinci|text-)/, 'openai'],
  [/^claude/, 'anthropic'],
  [/^gemini/, 'google'],
  [/^grok/, 'xai'],
  [/^llama/, 'meta'],
  [/^deepseek/, 'deepseek'],
  [/^qwen/, 'qwen'],
  [/^(mistral|mixtral|codestral)/, 'mistral'],
]

// Universal opt-in vars: the value IS the agent id (checked first).
// AI_AGENT accepts any value; AGENT is restricted to KnownAgent to avoid
// misattribution from generic AGENT env vars set by unrelated tooling.
function isKnownAgent (v: string): v is KnownAgent {
  return Object.hasOwn(AGENT_SHORT_CODES, v)
}

type Env = Record<string, string | undefined>

/**
 * Maps a generic parent marker to the more-specific child that subsumes it.
 * When both markers are present they describe one session, not two agents:
 * cowork ships the Claude Code markers, and cursor-cli inherits cursor's
 * CURSOR_TRACE_ID. Counting them separately splits the vote below
 * `minConfidence` and drops the session, so the parent vote is folded into
 * the child when the child is also present.
 */
const SUBSUMES: Partial<Record<KnownAgent, KnownAgent>> = {
  'claude-code': 'cowork',
  cursor: 'cursor-cli',
}

/**
 * Agents whose env vars are commonly inherited by child processes. When any
 * vote for a non-ambient agent is present, ambient votes are discarded so they
 * cannot suppress the real harness below minConfidence.
 */
const AMBIENT_AGENTS = new Set<AgentId>(['cursor', 'cursor-cli'])

/** Collects one agent vote per matching marker env var, in priority order. */
function collectVotes (env: Env): AgentId[] {
  const votes: AgentId[] = []
  for (const m of MARKERS) {
    const v = env[m.env]
    if (v == null || v === '') continue
    if (m.value != null && v !== m.value) continue
    votes.push(m.agent)
  }
  const present = new Set(votes)
  const hasDefinitive = votes.some((a) => !AMBIENT_AGENTS.has(a))
  const filtered = hasDefinitive ? votes.filter((a) => !AMBIENT_AGENTS.has(a)) : votes
  return filtered.map((a) => {
    const child = SUBSUMES[a as KnownAgent]
    return child != null && present.has(child) ? child : a
  })
}

/** Assembles a Detection, resolving the LLM model var for the given agent. */
function buildDetection (agent: AgentId, confidence: number, env: Env): Detection {
  const modelVar = AGENT_MODEL_VARS[agent]
  const rawLlm = modelVar != null ? env[modelVar] : undefined
  const llm = rawLlm ? resolveLlm(rawLlm, AGENT_MODEL_VENDOR[agent]) : undefined
  return { agent, confidence, ...(llm ? { llm } : {}) }
}

/**
 * Detects the coding-agent harness that spawned the current process from its
 * environment variables.
 *
 * Returns the {@link Detection} when a harness is identified with sufficient
 * confidence, or `null` when no agent is detected or confidence falls below
 * `minConfidence`. Neither outcome is an error.
 *
 * Confidence is the share of matched env vars that point at the winning agent:
 * all vars agreeing yields 1; two Claude vars and one Codex var yields 0.667.
 * Ties are broken by marker priority order.
 *
 * @param minConfidence lower bound (0–1, default 0.95) below which null is returned.
 * @param env environment to read; defaults to `process.env` (injectable for testing).
 */
export function detectAgent (
  minConfidence = 0.95,
  env: Env = process.env,
): Detection | null {
  // Universal opt-in vars override the marker table unconditionally: when set,
  // the caller has explicitly declared which harness is running and marker votes
  // must not dilute confidence or suppress the result.
  const aiAgent = env['AI_AGENT']
  if (aiAgent != null && aiAgent !== '') return buildDetection(aiAgent, 1, env)
  const agentEnv = env['AGENT']
  if (agentEnv != null && agentEnv !== '' && isKnownAgent(agentEnv)) return buildDetection(agentEnv, 1, env)

  const votes = collectVotes(env)
  if (votes.length === 0) return null
  const counts = new Map<AgentId, number>()
  for (const agent of votes) counts.set(agent, (counts.get(agent) ?? 0) + 1)

  // votes[] is already in priority order, so the first agent reaching the max
  // count wins ties.
  let agent = votes[0] as AgentId
  let best = 0
  for (const candidate of votes) {
    const c = counts.get(candidate) ?? 0
    if (c > best) {
      best = c
      agent = candidate
    }
  }

  const confidence = best / votes.length
  if (confidence < minConfidence) return null

  return buildDetection(agent, confidence, env)
}

/**
 * Splits a raw model id into a canonical `{ model, vendor }` pair.
 *
 * Vendor precedence: an explicit `vendor/model` segment wins, then the
 * agent-level vendor, then a prefix-table inference. Vendor is omitted when
 * none of those establish it, so downstream telemetry can group by vendor
 * and/or model without parsing strings.
 */
export function resolveLlm (raw: string, agentVendor?: string): LlmInfo {
  const slash = raw.indexOf('/')
  if (slash > 0 && slash < raw.length - 1) {
    const vendor = normalizeModelId(raw.slice(0, slash))
    const model = normalizeModelId(raw.slice(slash + 1))
    return vendor ? { model, vendor } : { model }
  }
  const model = normalizeModelId(raw)
  const normalizedAgentVendor = agentVendor != null ? normalizeModelId(agentVendor) : ''
  const vendor = normalizedAgentVendor || inferVendor(model)
  return vendor ? { model, vendor } : { model }
}

/** Infers a vendor from a model id prefix, or undefined if unrecognized. */
function inferVendor (model: string): string | undefined {
  for (const [re, vendor] of VENDOR_BY_PREFIX) if (re.test(model)) return vendor
  return undefined
}

/**
 * Normalizes a raw model id to a canonical lowercase, hyphen-separated form.
 * Trims surrounding whitespace and collapses internal whitespace to hyphens.
 */
export function normalizeModelId (raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}
