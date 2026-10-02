/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentInfo } from '@elastic/agent-env'
import { detectAgent } from '@elastic/agent-env'

const agent: AgentInfo | null = detectAgent()

export function clientHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (agent) {
    headers['x-elastic-agent'] = agent.name
  }
  return headers
}
