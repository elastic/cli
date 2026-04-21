/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { allApis } from '../../src/es/apis.ts'
import { parseTestFile, isServerless } from './parser.ts'
import { generateScript, generateRunner } from './generator.ts'

const { values } = parseArgs({
  options: {
    'tests-dir': { type: 'string' },
    output: { type: 'string', default: 'test/functional/es' }
  },
  strict: true
})

const testsDir = values['tests-dir']
const outputDir = values.output ?? 'test/functional/es'

if (testsDir == null) {
  console.error('Usage: npx tsx codegen/functional/index.ts --tests-dir <path-to-elasticsearch-clients-tests/tests>')
  process.exit(1)
}

function walkYamlFiles (dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...walkYamlFiles(full))
    } else if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
      files.push(full)
    }
  }
  return files
}

// Tests that require an enterprise/trial license or security to be enabled.
// Skipped until CI runs an ES instance with the appropriate license.
// See: https://www.elastic.co/subscriptions
const SKIP_ENTERPRISE: Set<string> = new Set([
  // ML — requires platinum/enterprise license
  'machine_learning/10_trained_model.yml',
  'machine_learning/30_trained_model_stack.yml',
  'machine_learning/calendar_crud.yml',
  'machine_learning/calendar_job.yml',
  'machine_learning/data_frame_analytics.yml',
  'machine_learning/data_frame_evaluate.yml',
  'machine_learning/datafeed_crud.yml',
  'machine_learning/jobs_crud.yml',
  'machine_learning/jobs_reset.yml',
  'machine_learning/model_snapshots.yml',
  'machine_learning/post_data.yml',
  'machine_learning/preview_datafeed.yml',
  'machine_learning/revert_model_snapshot.yml',
  'machine_learning/start_stop_datafeed.yml',
  'machine_learning/trained_model_aliases.yml',
  'machine_learning/update_model_snapshot.yml',
  'machine_learning/upgrade_job_snapshot.yml',
  // Inference — requires platinum/enterprise license
  'inference/10_basic.yml',
  // Query rules — requires trial/enterprise license
  'query_rules/10_query_rules.yml',
  'query_rules/20_rulesets.yml',
  'query_rules/30_test.yml',
  // Search applications — requires trial/platinum license
  'search_application/10_basic.yml',
  'search_application/20_behavioral_analytics.yml',
  // Security — requires xpack.security.enabled=true
  'security/10_api_key_basic.yml',
  'security/20_authenticate.yml',
  // Enterprise Search connectors — blocked on basic license
  'entsearch/20_connector.yml',
  'entsearch/50_connector_updates.yml',
])

const yamlFiles = walkYamlFiles(testsDir)
console.log(`Found ${yamlFiles.length} YAML test files in ${testsDir}`)

mkdirSync(outputDir, { recursive: true })

let generated = 0
let skippedNotServerless = 0
let skippedNoActions = 0
let skippedEnterprise = 0
const scriptPaths: string[] = []
const allSkippedActions = new Set<string>()

for (const yamlFile of yamlFiles) {
  const relPath = relative(testsDir, yamlFile)
  const content = readFileSync(yamlFile, 'utf-8')
  const testFile = parseTestFile(content, relPath)

  if (!isServerless(testFile)) {
    skippedNotServerless++
    continue
  }

  // Skip tests that are explicitly excluded from stack (stack: false in YAML).
  // These are serverless-only tests that cannot pass against a standard ES.
  if (testFile.requires.stack === false) {
    skippedNotServerless++
    continue
  }

  if (SKIP_ENTERPRISE.has(relPath)) {
    skippedEnterprise++
    continue
  }

  const result = generateScript(testFile, allApis)

  for (const action of result.skippedActions) {
    allSkippedActions.add(action)
  }

  if (result.skipped) {
    skippedNoActions++
    continue
  }

  const scriptName = relPath.replace(/\.ya?ml$/, '.sh')
  const scriptPath = join(outputDir, scriptName)
  mkdirSync(dirname(scriptPath), { recursive: true })
  writeFileSync(scriptPath, result.script, { mode: 0o755 })

  scriptPaths.push(scriptName)
  generated++
}

// Write the runner script
const runner = generateRunner(scriptPaths)
writeFileSync(join(outputDir, 'run.sh'), runner, { mode: 0o755 })

console.log('')
console.log('=== Summary ===')
console.log(`  Generated:              ${generated} scripts`)
console.log(`  Skipped (not serverless): ${skippedNotServerless}`)
console.log(`  Skipped (enterprise):     ${skippedEnterprise}`)
console.log(`  Skipped (no CLI actions): ${skippedNoActions}`)

if (allSkippedActions.size > 0) {
  console.log(`  Unmapped actions:       ${[...allSkippedActions].sort().join(', ')}`)
}

console.log(`  Output:                 ${outputDir}/`)
console.log(`  Runner:                 ${outputDir}/run.sh`)
