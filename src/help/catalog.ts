/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Frozen process exit codes and JSON `error.code` strings.
 * Process exit stays 1 for every failure until a later release implements 2-5.
 */

export interface ExitCode {
  code: number
  name: string
  status: 'stable' | 'reserved'
  description: string
}

export interface ErrorCode {
  code: string
  description: string
  /** Command agents should run after this error, if any. */
  probe?: string
}

export const STATUS_PROBE = 'elastic status --json'

export const EXIT_CODES: readonly ExitCode[] = [
  { code: 0, name: 'success', status: 'stable', description: 'Command succeeded.' },
  { code: 1, name: 'error', status: 'stable', description: 'Generic failure. Every current error uses this code.' },
  { code: 2, name: 'usage', status: 'reserved', description: 'Unknown command or option. Not used yet.' },
  { code: 3, name: 'validation', status: 'reserved', description: 'Input failed schema validation. Not used yet.' },
  { code: 4, name: 'auth_config', status: 'reserved', description: 'Auth or config problem. Not used yet.' },
  { code: 5, name: 'network', status: 'reserved', description: 'Transport or connection failure. Not used yet.' },
]

export const ERROR_CODES: readonly ErrorCode[] = [
  { code: 'missing_config', description: 'No config file, or no connection block for the service.' },
  { code: 'config_invalid', description: 'Config file exists but failed to parse or validate.' },
  { code: 'auth_required', description: 'Server returned 401.', probe: STATUS_PROBE },
  { code: 'not_found', description: 'Server returned 404.', probe: STATUS_PROBE },
  { code: 'transport_error', description: 'HTTP or client error other than 401/404.', probe: STATUS_PROBE },
  { code: 'connection_error', description: 'TCP/TLS failure reaching the server.', probe: STATUS_PROBE },
  { code: 'input_error', description: 'Handler rejected the request before sending it.' },
  { code: 'input_validation_failed', description: 'Flags or JSON input failed the command schema.' },
  { code: 'confirmation_required', description: 'Destructive command needs --yes.' },
  { code: 'command_blocked', description: 'Command policy blocked this invocation.' },
  { code: 'kibana_api_error', description: 'Kibana HTTP error.' },
  { code: 'cloud_api_error', description: 'Cloud HTTP error.' },
  { code: 'invalid_request', description: 'Cloud request could not be built.' },
  { code: 'credential_policy_error', description: 'Cloud credential policy rejected the request.' },
  { code: 'output_template_error', description: '--output-template failed to render.' },
  { code: 'missing_source', description: 'extension add needs a source.' },
  { code: 'missing_name', description: 'extension command needs a name.' },
]

export const HELP_TOPICS = [
  { name: 'exit-codes', description: 'Process exit codes and JSON error.code values' },
] as const

export function classifyConfigLoadError (message: string): 'missing_config' | 'config_invalid' {
  if (/no configuration file found/i.test(message)) return 'missing_config'
  if (/enoent/i.test(message)) return 'missing_config'
  return 'config_invalid'
}

export function formatExitCodesHelp (): string {
  const lines = [
    'Exit codes',
    '',
    ...EXIT_CODES.map((e) => {
      const reserved = e.status === 'reserved' ? ' (reserved)' : ''
      return `${e.code}  ${e.name}${reserved}\n   ${e.description}`
    }),
    '',
    'Process exit stays 1 for every failure. Do not branch on 2-5 yet.',
    '',
    'JSON error.code values (--json writes these to stderr)',
    '',
    ...ERROR_CODES.map((e) => {
      const probe = e.probe != null ? ` After this, run ${e.probe}.` : ''
      return `${e.code}\n   ${e.description}${probe}`
    }),
    '',
    `After auth_required or transport_error, run ${STATUS_PROBE}.`,
    '',
  ]
  return lines.join('\n')
}

export function formatTopicsHelp (): string {
  const lines = [
    'Help topics',
    '',
    ...HELP_TOPICS.map((t) => `  ${t.name}\n    ${t.description}`),
    '',
    'Run `elastic help <topic>` or `elastic help <topic> --json`.',
    '',
  ]
  return lines.join('\n')
}
