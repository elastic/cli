#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates an exhaustive NOTICE.txt from all production dependencies.
 *
 * For each dependency the output includes:
 *   - package name and version
 *   - SPDX license identifier
 *   - full text of the license file
 *   - full text of the NOTICE file (if present)
 *
 * Usage:
 *   node scripts/generate-notice.mjs            # writes NOTICE.txt
 *   node scripts/generate-notice.mjs --check    # exits 1 if NOTICE.txt is stale
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const outPath = resolve(rootDir, 'NOTICE.txt')

const check = process.argv.includes('--check')

function getLicenseData () {
  const raw = execSync('npx license-checker --production --json', {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  })
  return JSON.parse(raw)
}

function readFileSafe (filePath) {
  try {
    return readFileSync(filePath, 'utf8').trimEnd()
  } catch {
    return null
  }
}

function generate () {
  const data = getLicenseData()

  const lines = []
  lines.push('Elastic CLI')
  lines.push('Copyright 2025-2026 Elasticsearch B.V.')
  lines.push('')
  lines.push('This product includes software developed by Elastic')
  lines.push('(https://www.elastic.co/).')
  lines.push('')
  lines.push('='.repeat(72))
  lines.push('Third-party software notices and licenses')
  lines.push('='.repeat(72))

  const entries = Object.entries(data)
    .filter(([name]) => !name.startsWith('@elastic/cli@'))
    .sort(([a], [b]) => a.localeCompare(b))

  for (const [nameVersion, info] of entries) {
    lines.push('')
    lines.push('-'.repeat(72))
    lines.push(nameVersion)
    lines.push(`License: ${info.licenses}`)
    if (info.repository) {
      lines.push(`Repository: ${info.repository}`)
    }
    if (info.publisher) {
      let pub = info.publisher
      if (info.email) pub += ` <${info.email}>`
      if (info.url) pub += ` (${info.url})`
      lines.push(`Publisher: ${pub}`)
    }
    lines.push('-'.repeat(72))

    if (info.noticeFile) {
      const notice = readFileSafe(info.noticeFile)
      if (notice) {
        lines.push('')
        lines.push('NOTICE:')
        lines.push(notice)
      }
    }

    if (info.licenseFile) {
      const lic = readFileSafe(info.licenseFile)
      if (lic) {
        lines.push('')
        lines.push(lic)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

const content = generate()

if (check) {
  const existing = readFileSafe(outPath) ?? ''
  if (existing.trimEnd() !== content.trimEnd()) {
    console.error('NOTICE.txt is out of date. Run: node scripts/generate-notice.mjs')
    process.exit(1)
  }
  console.log('NOTICE.txt is up to date.')
} else {
  writeFileSync(outPath, content + '\n', 'utf8')
  const count = (content.match(/^-{72}$/gm) ?? []).length
  console.log(`NOTICE.txt generated with ${count} dependency entries.`)
}
