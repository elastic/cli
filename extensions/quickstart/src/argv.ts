/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Flag parsing.
 *
 * Extensions receive raw argv, so Commander's parsing, validation, and help
 * are not available. Two MVP controls became flags here because the host's
 * environment allowlist drops them before the child starts: `ELASTIC_ENV`
 * (now `--env`) and `NO_COLOR` / `FORCE_COLOR` (now `--no-color`).
 *
 * `--help` is accepted but rarely reachable: the host skips extension dispatch
 * whenever `--help` or `-h` appears anywhere in argv and prints the root CLI
 * help instead. `elastic quickstart help` is the form that works.
 */

import { QuickstartError } from './errors.ts'

/** Cloud environments the flow can target. Unknown values are a hard error. */
export const CLOUD_ENV_NAMES = ['prod', 'qa'] as const
export type CloudEnvName = (typeof CLOUD_ENV_NAMES)[number]

export interface QuickstartArgs {
  /** Force agent mode and machine-readable output. */
  json: boolean
  /** Render usage and exit. */
  help: boolean
  /** Validate inputs and exit without provisioning anything. */
  dryRun: boolean
  /** False when the user opted out of ANSI styling. */
  color: boolean
  /** Target Cloud environment; `prod` unless `--env` says otherwise. */
  env: CloudEnvName
  /** Explicit path to the parent CLI, bypassing PATH resolution. */
  cliBin?: string
}

function requireValue (flag: string, value: string | undefined): string {
  if (value == null || value.startsWith('-')) {
    throw new QuickstartError('missing_flag_value', `${flag} requires a value.`)
  }
  return value
}

function parseEnvName (raw: string): CloudEnvName {
  const normalised = raw.trim().toLowerCase()
  const match = CLOUD_ENV_NAMES.find((name) => name === normalised)
  if (match == null) {
    throw new QuickstartError(
      'bad_env',
      `Unknown --env "${raw}". Expected one of: ${CLOUD_ENV_NAMES.join(', ')}.`,
    )
  }
  return match
}

/**
 * Parses the argument list the host forwards after the command name.
 *
 * Unknown flags are rejected rather than ignored: a silently dropped flag in a
 * provisioning flow is a wrong-environment or wrong-account incident.
 */
export function parseArgs (argv: readonly string[]): QuickstartArgs {
  const args: QuickstartArgs = {
    json: false,
    help: false,
    dryRun: false,
    color: true,
    env: 'prod',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    switch (arg) {
      case 'help':
      case '--help':
      case '-h':
        args.help = true
        break
      case '--json':
        args.json = true
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--no-color':
        args.color = false
        break
      case '--env':
        args.env = parseEnvName(requireValue('--env', argv[++i]))
        break
      case '--cli-bin':
        args.cliBin = requireValue('--cli-bin', argv[++i])
        break
      default:
        throw new QuickstartError(
          'unknown_argument',
          `Unrecognised argument "${arg}". Run \`elastic quickstart help\` for usage.`,
        )
    }
  }

  return args
}

/** Usage text. Printed by `elastic quickstart help`. */
export function usage (): string {
  return [
    'elastic quickstart — create a Vector DB project and explore search features.',
    '',
    'Usage:',
    '  elastic quickstart [options]',
    '  elastic quickstart help',
    '',
    'Options:',
    '  --json            emit the agent runbook as JSON and exit',
    '  --env <name>      target Cloud environment (prod, qa) [default: prod]',
    '  --cli-bin <path>  path to the elastic CLI to orchestrate [default: resolved from PATH]',
    '  --no-color        disable ANSI styling',
    '  --dry-run         validate inputs and exit without creating anything',
    '  help              show this message',
    '',
    'Agents: run `elastic quickstart --json` and follow the runbook.',
    '',
    'Note: `elastic quickstart --help` prints the root CLI help, not this message.',
    'The CLI skips extension dispatch when --help appears in the arguments.',
    '',
  ].join('\n')
}
