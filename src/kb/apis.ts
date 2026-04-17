/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { lensApis } from './apis/lens.ts'
import type { KbApiDefinition } from './types.ts'

/** All Kibana API definitions for the `kb` command group. */
export const allKbApis: KbApiDefinition[] = [
  ...lensApis,
]
