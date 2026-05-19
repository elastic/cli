/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineGroup } from '../../factory.ts'
import type { OpaqueCommandHandle } from '../../factory.ts'
import { createEsqlPreviewUrlCommand } from './esql-preview-url.ts'

export function registerKbEsqlHelpers (): OpaqueCommandHandle {
  return defineGroup(
    { name: 'esql', description: 'ES|QL helper commands for Kibana' },
    createEsqlPreviewUrlCommand()
  )
}
