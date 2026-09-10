/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type { ApiRegistryMeta as EsApiMeta } from '@elastic/schemas'

import { esManifest } from '@elastic/schemas/es/tools/manifest.js'
export const apiManifest = esManifest
