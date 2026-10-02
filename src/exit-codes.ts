/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
  AUTH_ERROR: 2,
  NOT_FOUND: 3,
  CONFLICT: 4,
  FORBIDDEN: 5,
} as const)

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES]

const EXIT_CODE_DESCRIPTIONS: Array<{ code: number; label: string; description: string }> = [
  { code: 0, label: 'success', description: 'Command completed successfully.' },
  { code: 1, label: 'error', description: 'General error (invalid arguments, API failure, etc.).' },
  { code: 2, label: 'auth-error', description: 'Authentication or credential error.' },
  { code: 3, label: 'not-found', description: 'Requested resource was not found.' },
  { code: 4, label: 'conflict', description: 'Resource conflict (e.g. already exists).' },
  { code: 5, label: 'forbidden', description: 'Permission denied.' },
]

export function formatExitCodesHelp (): string {
  const lines: string[] = [
    'EXIT CODES',
    '',
  ]

  for (const { code, label, description } of EXIT_CODE_DESCRIPTIONS) {
    lines.push(`${code}  ${label}  ${description}`)
  }

  lines.push('')
  lines.push('Codes 6-63 are reserved for future use by this CLI.')
  lines.push('Codes 64-78 follow BSD sysexits(3) conventions.')
  lines.push('Codes 126+ are reserved by the shell.')

  return lines.join('\n')
}
