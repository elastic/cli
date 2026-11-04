/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Strips ANSI SGR escape sequences. Exported for tests guarding the no-ANSI contract.
 *
 * Kept in a dependency-free module so lightweight paths (logo, banners, status)
 * can honor color settings without loading the table renderer.
 */
export function stripAnsi (value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001B\[[\d;]*m/g, '')
}

/**
 * Returns true when ANSI colors may be emitted for the given TTY state.
 *
 * `NO_COLOR` (set to any value) always wins. `FORCE_COLOR` (set to anything
 * except `'0'`) forces colors on, otherwise colors follow the TTY state.
 */
export function colorsEnabled (isTTY: boolean): boolean {
  if (process.env.NO_COLOR !== undefined) return false
  const force = process.env.FORCE_COLOR
  if (force !== undefined && force !== '0') return true
  return isTTY
}
