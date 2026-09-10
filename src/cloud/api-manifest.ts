/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type { ApiRegistryMeta as CloudApiMeta } from '@elastic/schemas'
import { cloudManifest } from '@elastic/schemas/cloud/tools/manifest.js'

export const apiManifest = cloudManifest
