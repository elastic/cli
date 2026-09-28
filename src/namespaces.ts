/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'
import { registerHelpCommand, helpTopicResult } from './help-topics.ts'

export function registerNamespaces (program: Command): void {
  registerHelpCommand(program).action(async (topic: string | undefined) => {
    const json = (program.opts().json as boolean | undefined) ?? false
    const result = helpTopicResult(topic, json)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.code !== 0) process.exitCode = result.code
  })
}
