/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type { ApiRegistryMeta as KbApiMeta } from '@elastic/schemas'

import { kibanaManifest } from '@elastic/schemas/kibana/tools/manifest.js'
export const kbApiManifest = kibanaManifest
