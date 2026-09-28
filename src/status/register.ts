/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'

export function registerStatusCommand (program: Command): void {
  program
    .command('status')
    .description('Check the status of the Elastic stack')
    .option('--json', 'output as JSON')
    .action(async (_options) => {
      // status command implementation
    })
}
