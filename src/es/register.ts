/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'

export function register (_program: Command): void {
  // es namespace commands registered here
}

export function registerEsCommandsLazy (_program: Command): void {
  // lazy registration of es namespace commands
}
