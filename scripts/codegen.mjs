#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orchestrates regeneration of the ES and Cloud API bindings against the
 * upstream elastic/elastic-client-generator-js repo.
 *
 * Usage (from package.json scripts):
 *   node scripts/codegen.mjs es
 *   node scripts/codegen.mjs cloud
 *
 * Environment:
 *   CODEGEN_GENERATOR_DIR    Reuse an existing generator checkout (absolute
 *                            path). When unset, the script clones the repo
 *                            into a fresh temporary directory and installs
 *                            its dependencies.
 *   CODEGEN_GENERATOR_REF    Ref/branch/tag to clone (default: main).
 *   CODEGEN_ES_VERSION       Elasticsearch schema version (default: main).
 *
 * Design rationale:
 *   The upstream generator's npm scripts (`npm run zod`, `npm run cli-es`,
 *   `npm run cli-cloud`) share a single `output/` directory that each run
 *   wipes via `npm run clean`. This script runs them sequentially and copies
 *   the relevant files out of `output/` between runs, mapping them onto the
 *   repo layout at `src/es/apis/`, `src/es/apis/schemas/` and
 *   `src/cloud/apis/`.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GENERATOR_REPO = 'https://github.com/elastic/elastic-client-generator-js.git'

function run (command, args, opts = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...opts })
  if (result.status !== 0) {
    const cwd = opts.cwd ?? process.cwd()
    throw new Error(`Command failed (${command} ${args.join(' ')}) in ${cwd}: exit ${result.status ?? 'signal'}`)
  }
}

/**
 * Ensure a checkout of the generator exists and has its dependencies installed.
 * Returns an absolute path to it. When CODEGEN_GENERATOR_DIR is set the caller
 * is responsible for the checkout; this function only verifies it exists and
 * skips install (the caller should have installed). Otherwise a fresh temp
 * clone is produced and its dependencies installed via npm.
 */
function ensureGenerator () {
  const existing = process.env.CODEGEN_GENERATOR_DIR
  if (existing != null && existing.length > 0) {
    if (!existsSync(existing)) {
      throw new Error(`CODEGEN_GENERATOR_DIR="${existing}" does not exist`)
    }
    console.log(`[codegen] Using existing generator checkout: ${existing}`)
    return existing
  }

  const ref = process.env.CODEGEN_GENERATOR_REF ?? 'main'
  const dir = mkdtempSync(join(tmpdir(), 'elastic-client-generator-'))
  console.log(`[codegen] Cloning ${GENERATOR_REPO} @ ${ref} -> ${dir}`)
  run('git', ['clone', '--depth', '1', '--branch', ref, GENERATOR_REPO, dir])
  console.log('[codegen] Installing generator dependencies (npm install)')
  run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, shell: process.platform === 'win32' })
  return dir
}

/** Remove every file in `dir` matching `predicate`. Non-recursive. */
function clearDir (dir, predicate = () => true) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    return
  }
  for (const entry of readdirSync(dir)) {
    if (!predicate(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) continue // leave sub-directories alone
    rmSync(full, { force: true })
  }
}

/** Copy every *.ts file from `src` (non-recursive) into `dest`. */
function copyTsFiles (src, dest) {
  if (!existsSync(src)) throw new Error(`Expected generator output at ${src}`)
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    if (!entry.endsWith('.ts')) continue
    cpSync(join(src, entry), join(dest, entry))
  }
}

function generateEs (generatorDir) {
  const version = process.env.CODEGEN_ES_VERSION ?? 'main'
  const output = join(generatorDir, 'output')

  console.log(`[codegen] Step 1/2: Zod schemas (version: ${version})`)
  run('npm', ['run', 'zod', '--', '--version', version], { cwd: generatorDir, shell: process.platform === 'win32' })
  const schemasDest = join(REPO_ROOT, 'src', 'es', 'apis', 'schemas')
  clearDir(schemasDest, (entry) => entry.endsWith('.ts'))
  copyTsFiles(output, schemasDest)
  console.log(`[codegen]   wrote schemas -> ${schemasDest}`)

  console.log(`[codegen] Step 2/2: ES API namespace files (version: ${version})`)
  run('npm', ['run', 'cli-es', '--', '--version', version], { cwd: generatorDir, shell: process.platform === 'win32' })
  const apisDest = join(REPO_ROOT, 'src', 'es', 'apis')
  clearDir(apisDest, (entry) => entry.endsWith('.ts'))
  copyTsFiles(join(output, 'es', 'apis'), apisDest)
  // Generator emits the barrel as `output/es/index.ts`; the repo expects it
  // as `src/es/apis.ts` next to the `apis/` directory.
  const barrelSrc = join(output, 'es', 'index.ts')
  const barrelDest = join(REPO_ROOT, 'src', 'es', 'apis.ts')
  if (!existsSync(barrelSrc)) throw new Error(`Missing barrel: ${barrelSrc}`)
  cpSync(barrelSrc, barrelDest)
  console.log(`[codegen]   wrote APIs -> ${apisDest}`)
  console.log(`[codegen]   wrote barrel -> ${barrelDest}`)
}

function generateCloud (generatorDir) {
  const output = join(generatorDir, 'output')

  console.log('[codegen] Cloud API namespace files')
  // `npm run cli-cloud` does not call clean itself, so wipe any leftover
  // output from a previous step before running the generator.
  rmSync(output, { recursive: true, force: true })
  run('npm', ['run', 'cli-cloud'], { cwd: generatorDir, shell: process.platform === 'win32' })
  const apisDest = join(REPO_ROOT, 'src', 'cloud', 'apis')
  clearDir(apisDest, (entry) => entry.endsWith('.ts'))
  copyTsFiles(join(output, 'cloud', 'apis'), apisDest)
  const barrelSrc = join(output, 'cloud', 'apis.ts')
  const barrelDest = join(REPO_ROOT, 'src', 'cloud', 'apis.ts')
  if (!existsSync(barrelSrc)) throw new Error(`Missing barrel: ${barrelSrc}`)
  cpSync(barrelSrc, barrelDest)
  console.log(`[codegen]   wrote APIs -> ${apisDest}`)
  console.log(`[codegen]   wrote barrel -> ${barrelDest}`)
}

const target = process.argv[2]
if (target !== 'es' && target !== 'cloud') {
  console.error('Usage: node scripts/codegen.mjs <es|cloud>')
  process.exit(1)
}

try {
  const generatorDir = ensureGenerator()
  if (target === 'es') generateEs(generatorDir)
  else generateCloud(generatorDir)
  console.log(`[codegen] Done (${target}).`)
} catch (err) {
  console.error(`[codegen] Failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
