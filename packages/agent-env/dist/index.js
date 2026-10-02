/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detect the coding-agent harness that spawned this process by inspecting
 * well-known environment variables.
 *
 * Returns an AgentInfo object when a known agent is detected, or
 * `null` when the process was not spawned by a recognised harness.
 */
export function detectAgent() {
  // Claude Code / claude-code CLI
  if (process.env['CLAUDE_CODE'] || (process.env['ANTHROPIC_API_KEY'] && process.env['CLAUDE_CODE_ENTRYPOINT'])) {
    return { name: 'claude-code' };
  }

  // GitHub Copilot agent
  if (process.env['COPILOT_AGENT'] || process.env['GITHUB_COPILOT_TOKEN']) {
    return { name: 'github-copilot' };
  }

  // Cursor editor agent
  if (process.env['CURSOR_TRACE_ID'] || process.env['CURSOR_AGENT']) {
    return { name: 'cursor' };
  }

  // Cody agent (Sourcegraph)
  if (process.env['CODY_AGENT']) {
    return { name: 'cody' };
  }

  // Aider
  if (process.env['AIDER_MODEL'] || process.env['AIDER']) {
    return { name: 'aider' };
  }

  // Continue.dev
  if (process.env['CONTINUE_AGENT']) {
    return { name: 'continue' };
  }

  // Devin (Cognition)
  if (process.env['DEVIN_AGENT'] || process.env['DEVIN_ID']) {
    return { name: 'devin' };
  }

  // SWE-agent
  if (process.env['SWE_AGENT']) {
    return { name: 'swe-agent' };
  }

  return null;
}
