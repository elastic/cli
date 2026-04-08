/**
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { deploymentApis } from './deployments.ts'
import { projectApis } from './projects.ts'
import type { CloudApiDefinition } from '../types.ts'

/** flat array of all registered Cloud API definitions across all namespaces */
export const allCloudApis: CloudApiDefinition[] = [...deploymentApis, ...projectApis]
