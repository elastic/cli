/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export function isAuthStatus (status: number): boolean {
  return status === 401 || status === 403
}

export function setupNextCommand (tty = process.stderr.isTTY === true): string {
  if (tty) return 'Run `elastic config context add`, then `elastic status`.'
  return 'Set ELASTIC_CLI_CONFIG_FILE to a YAML file with current_context and contexts.<name> (elasticsearch.url and auth). Or run `elastic config context add`.'
}

export function withSetupHint (detail: string, tty = process.stderr.isTTY === true): string {
  const trimmed = detail.replace(/\s+$/, '')
  return `${trimmed} ${setupNextCommand(tty)}`
}

export function formatAuthFailure (status: number): string {
  return `request failed with status ${status}. Run \`elastic status --json\` and \`elastic config context edit\`.`
}

export function withAuthHint (detail: string, status: number): string {
  if (!isAuthStatus(status)) return detail
  return `${detail.replace(/\s+$/, '')} Run \`elastic status --json\` and \`elastic config context edit\`.`
}
