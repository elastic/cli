#!/usr/bin/env node
/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orchestrates regeneration of the ES and Kibana API bindings against
 * the upstream elastic/elastic-client-generator-js repo.
 *
 * Usage (from package.json scripts):
 *   node scripts/codegen.mjs es
 *   node scripts/codegen.mjs kibana
 *
 * Cloud API bindings are imported directly from @elastic/schemas; no
 * code generation is required for the cloud command tree.
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
 *   The upstream generator emits `output/es/manifest.ts` and
 *   `output/kibana/manifest.ts` which this script copies to
 *   `src/es/api-manifest.ts` and `src/kb/api-manifest.ts` respectively.
 *   Per-namespace schema files are lazy-loaded from @elastic/schemas at
 *   runtime.
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

  console.log(`[codegen] Step 1/3: Zod schemas (version: ${version})`)
  run('npm', ['run', 'zod', '--', '--version', version], { cwd: generatorDir, shell: process.platform === 'win32' })
  const schemasDest = join(REPO_ROOT, 'src', 'es', 'apis', 'schemas')
  clearDir(schemasDest, (entry) => entry.endsWith('.ts'))
  copyTsFiles(output, schemasDest)
  console.log(`[codegen]   wrote schemas -> ${schemasDest}`)

  console.log(`[codegen] Step 2/3: ES API namespace files (version: ${version})`)
  run('npm', ['run', 'cli-es', '--', '--version', version], { cwd: generatorDir, shell: process.platform === 'win32' })
  const apisDest = join(REPO_ROOT, 'src', 'es', 'apis')
  clearDir(apisDest, (entry) => entry.endsWith('.ts'))
  copyTsFiles(join(output, 'es', 'apis'), apisDest)
  console.log(`[codegen]   wrote APIs -> ${apisDest}`)
  // The generator also emits `output/es/index.ts` as a flat barrel re-exporting
  // every namespace, but `src/es/apis.ts` is a hand-written lazy loader on
  // `main` (see #218). We deliberately skip copying the barrel.

  console.log('[codegen] Step 3/3: Copy src/es/api-manifest.ts from generator output')
  const manifestSrc = join(output, 'es', 'manifest.ts')
  if (!existsSync(manifestSrc)) throw new Error(`Missing manifest: ${manifestSrc}`)
  cpSync(manifestSrc, join(REPO_ROOT, 'src', 'es', 'api-manifest.ts'))
  console.log(`[codegen]   wrote manifest -> ${join(REPO_ROOT, 'src', 'es', 'api-manifest.ts')}`)
}


function generateKibana (generatorDir) {
  const output = join(generatorDir, 'output')

  console.log('[codegen] Step 1/2: Kibana API namespace files')
  // The kibana entrypoint self-wipes `output/kibana/` before writing, so we
  // don't need to clean anything ourselves.
  run('npm', ['run', 'cli-kibana'], { cwd: generatorDir, shell: process.platform === 'win32' })
  const apisDest = join(REPO_ROOT, 'src', 'kb', 'apis')
  clearDir(apisDest, (entry) => entry.endsWith('.ts'))
  copyTsFiles(join(output, 'kibana', 'apis'), apisDest)
  console.log(`[codegen]   wrote APIs -> ${apisDest}`)
  // `output/kibana/apis.ts` (a flat barrel) is intentionally NOT copied —
  // `src/kb/apis.ts` is the hand-written lazy loader added by #266.

  console.log('[codegen] Step 2/2: Copy src/kb/api-manifest.ts from generator output')
  const kbManifestSrc = join(output, 'kibana', 'manifest.ts')
  if (!existsSync(kbManifestSrc)) throw new Error(`Missing manifest: ${kbManifestSrc}`)
  cpSync(kbManifestSrc, join(REPO_ROOT, 'src', 'kb', 'api-manifest.ts'))
  console.log(`[codegen]   wrote manifest -> ${join(REPO_ROOT, 'src', 'kb', 'api-manifest.ts')}`)
}

const target = process.argv[2]
if (target !== 'es' && target !== 'kibana') {
  console.error('Usage: node scripts/codegen.mjs <es|cloud|kibana>')
  process.exit(1)
}

try {
  const generatorDir = ensureGenerator()
  if (target === 'es') generateEs(generatorDir)
  else generateKibana(generatorDir)
  console.log(`[codegen] Done (${target}).`)
} catch (err) {
  console.error(`[codegen] Failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
