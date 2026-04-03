/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { catApis } from './cat.ts'
import { indicesApis } from './indices.ts'
import type { EsApiDefinition } from '../types.ts'

/** flat array of all registered Elasticsearch API definitions across all namespaces */
export const allApis: EsApiDefinition[] = [...catApis, ...indicesApis]
