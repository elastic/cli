/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locates the elastic CLI this extension orchestrates.
 *
 * The in-tree MVP re-execs itself via `process.execPath` plus `process.argv[1]`.
 * An extension is a separate process with no handle on its parent and no
 * `ELASTIC_CLI_BIN` in the environment, so the binary is resolved from PATH and
 * version-probed up front -- a missing or unrunnable CLI must fail before the
 * flow starts provisioning, not midway through.
 */

import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { QuickstartError } from './errors.ts'

/** The resolved CLI and the version it reported. */
export interface CliBin {
  path: string
  version: string
}

export interface ResolveDeps {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  /** Runs `<path> version --json` and resolves its stdout. */
  probe: (path: string) => Promise<string>
}

function isExecutable (p: string): boolean {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Resolves `bin` against PATH, applying PATHEXT suffixes on Windows. */
export function whichBin (bin: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | undefined {
  const pathVar = env.PATH ?? env.Path ?? ''
  const exts = platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase())
    : ['']
  for (const dir of pathVar.split(delimiter)) {
    if (dir.length === 0) continue
    for (const ext of exts) {
      const candidate = join(dir, bin + ext)
      if (platform === 'win32' ? existsSync(candidate) : isExecutable(candidate)) return candidate
    }
  }
  return undefined
}

/** Spawns `<path> version --json` and returns stdout. */
export function probeVersion (path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(path, ['version', '--json'], { shell: false, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
    child.on('error', (err) => { reject(err) })
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`exited with code ${code ?? 'null'}`))
    })
  })
}

export function productionResolveDeps (): ResolveDeps {
  return { env: process.env, platform: process.platform, probe: probeVersion }
}

const NOT_FOUND_STEPS = [
  'Install the CLI globally: npm install -g @elastic/cli',
  'Or point this extension at an existing binary: elastic quickstart --cli-bin /path/to/elastic',
]

/**
 * Resolves and version-probes the parent CLI.
 *
 * @param explicit  Path from `--cli-bin`, which skips PATH resolution.
 */
export async function resolveCliBin (
  explicit: string | undefined,
  deps: ResolveDeps = productionResolveDeps(),
): Promise<CliBin> {
  let path: string
  if (explicit != null) {
    if (!isExecutable(explicit)) {
      throw new QuickstartError('cli_not_executable', `--cli-bin "${explicit}" is not an executable file.`)
    }
    path = explicit
  } else {
    const found = whichBin('elastic', deps.env, deps.platform)
    if (found == null) {
      throw new QuickstartError('cli_not_found', 'Could not find the `elastic` CLI on PATH.', NOT_FOUND_STEPS)
    }
    path = found
  }

  let stdout: string
  try {
    stdout = await deps.probe(path)
  } catch (err) {
    throw new QuickstartError(
      'cli_probe_failed',
      `Could not run "${path} version --json": ${err instanceof Error ? err.message : String(err)}`,
      NOT_FOUND_STEPS,
    )
  }

  let version: unknown
  try {
    version = (JSON.parse(stdout.trim()) as { version?: unknown }).version
  } catch {
    throw new QuickstartError('cli_probe_failed', `"${path} version --json" did not return JSON.`, NOT_FOUND_STEPS)
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new QuickstartError('cli_probe_failed', `"${path} version --json" returned no version field.`, NOT_FOUND_STEPS)
  }

  return { path, version }
}
