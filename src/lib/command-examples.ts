/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hand-authored `Examples` blocks for high-traffic commands.
 *
 * Generated `--help` is schema descriptions only, which is correct for 200+
 * generated endpoints and wrong for the commands people run first. This map
 * covers that short list; everything else stays generated. Keep entries
 * copy-pasteable: one happy path, one `--json`, one `--dry-run` where the
 * command mutates. Keys are CLI dot-paths (e.g. `es.indices.create`).
 */
const EXAMPLES: Record<string, string[]> = {
  'es.search': [
    'elastic stack es search --index my-index --q "error" --size 5',
    'elastic stack es search --index my-index --q "error" --json',
  ],
  'es.indices.create': [
    'elastic stack es indices create --index my-index --dry-run',
    'elastic stack es indices create --index my-index --json --dry-run',
  ],
  'es.indices.delete': [
    'elastic stack es indices delete --index my-index --dry-run',
    'elastic stack es indices delete --index my-index --json --dry-run',
  ],
  'es.cat.indices': [
    'elastic stack es cat indices --health green',
    'elastic stack es cat indices --json',
  ],
  'cloud.elasticsearch-projects.create-elasticsearch-project': [
    'elastic cloud serverless projects search create --name demo --region-id aws-us-east-1 --dry-run',
    'elastic cloud serverless projects search create --name demo --region-id aws-us-east-1 --save-as demo',
  ],
}

/** Examples for a generated command path, if the short list covers it. */
export function commandExamples (dotPath: string): string[] | undefined {
  return EXAMPLES[dotPath]
}

/** Formats examples for Commander `addHelpText`. */
export function formatExamples (examples: string[]): string {
  return ['Examples:', ...examples.map((e) => `  $ ${e}`)].join('\n')
}
