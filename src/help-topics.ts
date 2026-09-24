/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'

export const HELP_TOPIC_NAMES = ['formatting', 'environment', 'exit-codes'] as const
export type HelpTopicName = (typeof HELP_TOPIC_NAMES)[number]

export const HELP_TOPICS: Record<HelpTopicName, string> = {
  formatting: `Output flags (global)

--json                 Print the response as JSON (pretty-printed).
--output-fields <list> Keep only these fields (comma-separated, dot-notation).
--output-template <s>  Render each object with a Mustache-like template, e.g. "{{id}}: {{name}}".
                       Use {{.}} for the raw value.

Default text (no --json):
  array of flat objects  table
  array of primitives    one value per line
  everything else        pretty JSON

--help --json prints machine-readable help (command tree, or the leaf JSON Schema).
Flag order does not matter: elastic --json --help and elastic --help --json are the same.
`,
  environment: `Config file

Precedence: --config-file, then ELASTIC_CLI_CONFIG_FILE, then the home directory.
Discovery names (first readable wins): .elasticrc, .elasticrc.json, .elasticrc.yaml, .elasticrc.yml

Environment

ELASTIC_CLI_CONFIG_FILE   Config path (same as --config-file)
ELASTIC_CLI_TELEMETRY     false/0/no/off disables anonymous telemetry (overrides config)
ELASTIC_NO_BANNER         1 hides the startup logo
NO_COLOR                  set (any value) disables color on the logo
ELASTIC_CLOUD_ADMIN_API   Override the Cloud admin API base URL

Secrets

elastic config stores secrets in the OS store when one is available:
  macOS    Keychain (security)
  Linux    libsecret (secret-tool) or pass
  Windows  Credential Manager
The YAML then holds $(keychain:...) expressions. Pass --inline-secrets to keep secrets in the file.
`,
  'exit-codes': `Exit codes

0  success
1  error (usage, validation, missing config, auth, API, aborted confirmation)

2-63 are reserved. Do not rely on them yet; every failure is 1 today.
`,
}

export const LEARN_MORE = `
LEARN MORE
  elastic help formatting     output flags and default rendering
  elastic help environment    config file, env vars, keychain
  elastic help exit-codes     process exit codes
`

export function isHelpTopicName (name: string): name is HelpTopicName {
  return (HELP_TOPIC_NAMES as readonly string[]).includes(name)
}

export function formatHelpTopicIndex (): string {
  return [
    'Usage: elastic help <topic>',
    '',
    'Topics:',
    '  formatting     output flags and default rendering',
    '  environment    config file, env vars, keychain',
    '  exit-codes     process exit codes',
    '',
  ].join('\n')
}

export type HelpTopicResult = {
  stdout: string
  stderr: string
  code: number
}

export function helpTopicResult (topic: string | undefined, json: boolean): HelpTopicResult {
  if (topic == null || topic === '') {
    if (json) return { stdout: JSON.stringify({ topics: [...HELP_TOPIC_NAMES] }) + '\n', stderr: '', code: 0 }
    return { stdout: formatHelpTopicIndex(), stderr: '', code: 0 }
  }
  if (!isHelpTopicName(topic)) {
    return {
      stdout: '',
      stderr: `Error: unknown help topic "${topic}". Topics: ${HELP_TOPIC_NAMES.join(', ')}\n`,
      code: 1,
    }
  }
  const body = HELP_TOPICS[topic]
  if (json) return { stdout: JSON.stringify({ topic, body }) + '\n', stderr: '', code: 0 }
  return { stdout: body.endsWith('\n') ? body : `${body}\n`, stderr: '', code: 0 }
}

export function registerHelpCommand (program: Command): Command {
  program.addHelpCommand(false)
  return program
    .command('help')
    .description('Print a help topic (formatting, environment, exit-codes)')
    .argument('[topic]', 'formatting, environment, or exit-codes')
}
