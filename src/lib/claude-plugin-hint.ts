/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Official directory id for the Elastic Claude plugin. See #821. */
export const CLAUDE_PLUGIN_HINT =
  '<claude-code-hint v="1" type="plugin" value="elastic@anthropic-plugin-directory" />\n'

/**
 * When Claude Code (or a child session it started) is running this process,
 * emit the one-line plugin hint on stderr so Claude can offer install.
 * Claude strips the line before the model sees tool output.
 *
 * @see https://code.claude.com/docs/en/plugin-hints
 */
export function emitClaudePluginHint (
  env: NodeJS.ProcessEnv = process.env,
  write: (s: string) => void = (s) => { process.stderr.write(s) },
): void {
  if (env.CLAUDECODE || env.CLAUDE_CODE_CHILD_SESSION) {
    write(CLAUDE_PLUGIN_HINT)
  }
}
