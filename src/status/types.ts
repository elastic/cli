/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EsCheck, KbCheck, CloudCheck } from './checks.ts'

/** Aggregate result returned by the `elastic status` command. */
export interface StatusResult {
  context: string
  services: {
    elasticsearch?: EsCheck
    kibana?: KbCheck
    cloud?: CloudCheck
  }
  /** Project metadata stored on the context by project create --save-as. */
  project?: {
    project_id?: string
    project_type?: string
    region_id?: string
  }
}
