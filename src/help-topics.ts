/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command } from 'commander'
import { formatExitCodesHelp } from './exit-codes.js'

export const HELP_TOPIC_NAMES = Object.freeze(['formatting', 'environment', 'exit-codes'] as const)
export type HelpTopicName = typeof HELP_TOPIC_NAMES[number]

export function isHelpTopicName (name: string): name is HelpTopicName {
  return (HELP_TOPIC_NAMES as readonly string[]).includes(name)
}

function buildHelpTopics (): Record<HelpTopicName, string> {
  return {
    formatting: [
      'OUTPUT FORMATTING',
      '',
      'By default the CLI prints human-readable tables. Pass one of the flags below to',
      'change the output format for any command that returns structured data.',
      '',
      '  --json                    Print raw JSON output.',
      '  --output-fields <fields>  Comma-separated list of fields to include in output.',
      '  --output-template <tmpl>  Handlebars template string for each result row.',
      '',
      'You can also inspect the JSON schema for any command:',
      '',
      '  elastic <command> --help --json',
      '',
      'Result shape (table columns, JSON keys) is driven by the command schema.',
    ].join('\n'),

    environment: [
      'ENVIRONMENT VARIABLES',
      '',
      '  ELASTIC_CLI_CONFIG_FILE   Path to an alternate config file.',
      '                            Default: ~/.elasticrc.yml',
      '',
      '  ELASTIC_CLI_TELEMETRY     Set to "false" to opt out of telemetry.',
      '',
      '  ELASTIC_NO_BANNER         Set to "1" to suppress the startup banner.',
      '',
      '  NO_COLOR                  Disable ANSI color output (honoured automatically).',
      '',
      'CONFIG FILE',
      '',
      '  ~/.elasticrc.yml stores default profile settings and credentials.',
      '  Credentials are stored in the system keychain when available.',
    ].join('\n'),

    'exit-codes': formatExitCodesHelp(),
  }
}

let _helpTopics: Record<HelpTopicName, string> | undefined

export const HELP_TOPICS: Record<HelpTopicName, string> = new Proxy({} as Record<HelpTopicName, string>, {
  get (_target, prop: string) {
    if (!_helpTopics) _helpTopics = buildHelpTopics()
    return _helpTopics[prop as HelpTopicName]
  },
  ownKeys () {
    if (!_helpTopics) _helpTopics = buildHelpTopics()
    return Reflect.ownKeys(_helpTopics)
  },
  getOwnPropertyDescriptor (_target, prop: string) {
    if (!_helpTopics) _helpTopics = buildHelpTopics()
    return Object.getOwnPropertyDescriptor(_helpTopics, prop)
  },
  has (_target, prop: string) {
    if (!_helpTopics) _helpTopics = buildHelpTopics()
    return prop in _helpTopics
  },
})

export function getLearnMore (): string {
  return [
    'LEARN MORE',
    '',
    '  elastic help formatting',
    '  elastic help environment',
    '  elastic help exit-codes',
    '',
    '  elastic <command> --help --json',
    '  elastic cli-schema',
  ].join('\n')
}

export const LEARN_MORE: string = getLearnMore()

export function formatHelpTopicIndex (): string {
  return [
    'Available help topics:',
    '',
    ...HELP_TOPIC_NAMES.map((n) => `  ${n}`),
    '',
    'Usage: elastic help <topic>',
  ].join('\n')
}

export function helpTopicResult (
  name: string | undefined,
  json: boolean,
): { code: number; stdout: string; stderr: string } {
  if (name === undefined) {
    if (json) {
      return { code: 0, stdout: JSON.stringify({ topics: [...HELP_TOPIC_NAMES] }) + '\n', stderr: '' }
    }
    return { code: 0, stdout: formatHelpTopicIndex() + '\n', stderr: '' }
  }
  if (!isHelpTopicName(name)) {
    return { code: 1, stdout: '', stderr: `unknown help topic: ${name}\n` }
  }
  const body = HELP_TOPICS[name]
  if (json) {
    return { code: 0, stdout: JSON.stringify({ topic: name, body }) + '\n', stderr: '' }
  }
  return { code: 0, stdout: body + '\n', stderr: '' }
}

export function registerHelpCommand (program: Command): Command {
  return program
    .command('help [topic]')
    .description('Show help for a topic (formatting, environment, exit-codes)')
    .action((topic: string | undefined) => {
      const json = !!(program.opts() as Record<string, unknown>).json
      const result = helpTopicResult(topic, json)
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
      process.exitCode = result.code
    })
}
