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

const yamlFiles = walkYamlFiles(testsDir)
console.log(`Found ${yamlFiles.length} YAML test files in ${testsDir}`)

mkdirSync(outputDir, { recursive: true })

let generated = 0
let skippedNotServerless = 0
let skippedNoActions = 0
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
console.log(`  Skipped (no CLI actions): ${skippedNoActions}`)

if (allSkippedActions.size > 0) {
  console.log(`  Unmapped actions:       ${[...allSkippedActions].sort().join(', ')}`)
}

console.log(`  Output:                 ${outputDir}/`)
console.log(`  Runner:                 ${outputDir}/run.sh`)
