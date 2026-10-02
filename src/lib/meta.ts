/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectAgent, AgentInfo } from '@elastic/agent-env'

/**
 * Returns metadata about the current process environment, including
 * which coding-agent harness (if any) spawned this process.
 */
export interface Meta {
  agent: AgentInfo | null
}

export function getMeta(): Meta {
  return {
    agent: detectAgent(),
  }
}
