/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OptionDefinition, ParsedResult } from '../factory-core.ts'

/** The `--accept-experimental` flag that experimental commands declare to suppress their warning. */
export const ACCEPT_EXPERIMENTAL_OPTION: OptionDefinition = {
  long: 'accept-experimental',
  type: 'boolean',
  description: 'Acknowledge that this command is experimental and may change or be removed; suppresses the warning',
}

/** What an experimental command's warning says about it. */
export interface ExperimentalNotice {
  /** Command named in the warning, e.g. `docs search`. */
  label: string
  /** Completes "is experimental and …", e.g. `in active development`. */
  status: string
  /** Optional sentence shown before the suppression instructions. */
  advice?: string
}

/**
 * Writes the experimental warning to `stderr`, yellow when stderr is a TTY, unless the
 * invocation passed `--accept-experimental` or `--json`.
 *
 * @param parsed - the command's parsed result; only `options` is read
 * @param stderr - where the warning goes; commands with an injectable stderr pass theirs
 */
export function warnIfExperimental (
  parsed: Pick<ParsedResult, 'options'>,
  notice: ExperimentalNotice,
  stderr: { write: (s: string) => boolean } = process.stderr,
): void {
  if (parsed.options['accept-experimental'] === true || parsed.options['json'] === true) return
  const suppress = 'Pass --accept-experimental to suppress this warning.'
  const text =
    `Warning: "${notice.label}" is experimental and ${notice.status}.\n` +
    `         ${notice.advice != null ? `${notice.advice} ${suppress}` : suppress}\n\n`
  stderr.write(process.stderr.isTTY === true ? `\x1b[33m${text}\x1b[0m` : text)
}
