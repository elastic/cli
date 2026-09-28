/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'
import { register as registerEs } from './es/register.ts'
import { register as registerStatus } from './status/register.ts'
import { register as registerHelp } from './help/register.ts'
import { register as registerKibana } from './kibana/register.ts'
import { register as registerFleet } from './fleet/register.ts'
import { register as registerConnectors } from './connectors/register.ts'

export interface Namespace {
  name: string
  register: (program: Command) => void
}

export const NAMESPACES: Namespace[] = [
  {
    name: 'es',
    register: registerEs,
  },
  {
    name: 'status',
    register: registerStatus,
  },
  {
    name: 'help',
    register: registerHelp,
  },
  {
    name: 'kibana',
    register: registerKibana,
  },
  {
    name: 'fleet',
    register: registerFleet,
  },
  {
    name: 'connectors',
    register: registerConnectors,
  },
]
