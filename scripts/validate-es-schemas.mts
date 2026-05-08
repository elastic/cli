/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validates that every built-in Elasticsearch API schema can be registered
 * without throwing (i.e., all Zod types are JSON-Schema-serializable).
 *
 * Run via the unit tests in a dedicated child process so the ~5 GB of Zod
 * schema closures don't compete with the shared test-runner heap.
 *
 * Usage:
 *   node --max-old-space-size=6144 --import tsx/esm scripts/validate-es-schemas.mts
 */

import { loadAllEsApis } from '../src/es/apis.ts'
import { registerEsCommands } from '../src/es/register.ts'

const allApis = await loadAllEsApis()
registerEsCommands(allApis)
