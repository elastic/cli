/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dereferences sidecar-file `$ref` pointers in a JSON Schema object.
 *
 * @elastic/schemas splits large/shared type definitions into sidecar files
 * (e.g. `./_types.json#/$defs/_types__Ids`, or `_defs.json#/$defs/Foo` for
 * cloud schemas) to avoid duplicating them across every request schema.
 * Downstream consumers like `extractSchemaArgs` only understand
 * same-document refs (`#/$defs/Name`); this reassembles a single
 * self-contained schema so they never need file-system/package awareness.
 */

import { createRequire } from 'node:module'

const schemaRequire = createRequire(import.meta.url)

export type SchemaLoader = () => Promise<unknown>

let schemaLoaders: Record<string, SchemaLoader> = {}

/**
 * Registers literal `import()` loaders so `bun build --compile` can embed
 * `@elastic/schemas` files. Call this from the binary entry before loading
 * the CLI. Node tests leave this empty and fall through to `createRequire`.
 */
export function setSchemaLoaders (loaders: Record<string, SchemaLoader>): void {
  schemaLoaders = loaders
}

function unwrapSchemaModule <T> (subpath: string, mod: unknown): T {
  if (subpath.endsWith('.json') && mod != null && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: T }).default
  }
  return mod as T
}

/**
 * Loads a CommonJS module or JSON file from `@elastic/schemas` by subpath.
 *
 * Compiled binaries use registered `import()` loaders (string literals the
 * bundler can see). Node uses `require` via the package's `require` export
 * condition.
 */
export async function requireSchemaModule <T = Record<string, unknown>> (subpath: string): Promise<T> {
  if (!subpath.startsWith('@elastic/schemas/')) {
    throw new Error(`refusing to load schema module ${subpath}`)
  }
  const load = schemaLoaders[subpath]
  if (load != null) return unwrapSchemaModule<T>(subpath, await load())
  return schemaRequire(subpath) as T
}

/** Fragment prefix of a same-document ref, i.e. one pointing into the schema's own `$defs`. */
const SAME_DOC_PREFIX = '#/$defs/'

/** Parses an external (sidecar-file) $ref into its filename and def name. Returns null for same-document refs. */
function parseExternalRef (ref: string): { filename: string, defName: string } | null {
  const hashIdx = ref.indexOf('#')
  if (hashIdx < 1) return null
  const fragment = ref.slice(hashIdx + 1)
  if (!fragment.startsWith('/$defs/')) return null
  return {
    filename: ref.slice(0, hashIdx).replace(/^\.\//, ''),
    defName: fragment.slice('/$defs/'.length),
  }
}

/** Invokes `visit` for every `$ref` string found anywhere in a JSON value. */
function forEachRef (node: unknown, visit: (ref: string) => void): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) forEachRef(item, visit)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') visit(value)
    else forEachRef(value, visit)
  }
}

/** Collects the distinct sidecar filenames referenced anywhere in a JSON value. */
function collectExternalRefFiles (node: unknown): Set<string> {
  const out = new Set<string>()
  forEachRef(node, (ref) => {
    const parsed = parseExternalRef(ref)
    if (parsed != null) out.add(parsed.filename)
  })
  return out
}

/** Collects the def names referenced by same-document (`#/$defs/Name`) refs in a JSON value. */
function collectSameDocRefs (node: unknown): Set<string> {
  const out = new Set<string>()
  forEachRef(node, (ref) => {
    if (ref.startsWith(SAME_DOC_PREFIX)) out.add(ref.slice(SAME_DOC_PREFIX.length))
  })
  return out
}

/**
 * Keeps only the entries of `defs` that are transitively reachable from
 * `roots` via same-document refs. `loadSidecar` may return a large file's
 * entire (memoized, shared) $defs map -- most of it irrelevant to any one
 * schema -- so this keeps each schema's own $defs limited to what it
 * actually uses instead of ballooning every command's input schema.
 */
function pruneUnreachableDefs (defs: Record<string, unknown>, roots: Set<string>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  const queue = [...roots]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const name = queue.shift()!
    if (seen.has(name)) continue
    seen.add(name)
    const def = defs[name]
    if (def === undefined) continue
    kept[name] = def
    for (const nested of collectSameDocRefs(def)) {
      if (!seen.has(nested)) queue.push(nested)
    }
  }
  return kept
}

/** Deep-clones a JSON value, rewriting sidecar $refs to same-document form (`#/$defs/Name`). */
function rewriteExternalRefs (node: unknown): unknown {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(rewriteExternalRefs)
  const obj = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string') {
      const parsed = parseExternalRef(value)
      out[key] = parsed != null ? `${SAME_DOC_PREFIX}${parsed.defName}` : value
    } else {
      out[key] = rewriteExternalRefs(value)
    }
  }
  return out
}

/**
 * Wraps a raw sidecar-file loader into one that resolves and memoizes each
 * file's `$defs`, keyed by filename, for use as the `loadSidecar` argument to
 * `resolveSidecarRefs`.
 *
 * A file's result is the union of its own `$defs` and those of every file
 * transitively reachable through its refs, all rewritten to same-document
 * form. Sidecar files are mutually recursive in practice (`_types.json` and
 * `_types.query_dsl.json` reference each other), so the closure is walked
 * breadth-first rather than by recursive descent: every member of a cycle
 * must end up with the complete union, not one truncated where the cycle was
 * cut.
 *
 * Each file is loaded and rewritten at most once. That is the expensive part
 * (`_types.json` alone holds hundreds of shared ES types), so hoisting it out
 * of the per-schema resolution path is what keeps registering thousands of API
 * definitions fast.
 */
export function createSidecarResolver (
  loadRawSidecar: (filename: string) => Promise<Record<string, unknown>>
): (filename: string) => Promise<Record<string, unknown>> {
  const rawFiles = new Map<string, Promise<Record<string, unknown>>>()
  const resolved = new Map<string, Promise<Record<string, unknown>>>()

  function loadRaw (filename: string): Promise<Record<string, unknown>> {
    let pending = rawFiles.get(filename)
    if (pending == null) {
      pending = loadRawSidecar(filename)
      rawFiles.set(filename, pending)
    }
    return pending
  }

  async function resolveFile (filename: string): Promise<Record<string, unknown>> {
    const merged: Record<string, unknown> = {}
    const seen = new Set([filename])
    const queue = [filename]
    while (queue.length > 0) {
      const raw = await loadRaw(queue.shift()!)
      const ownDefs = (raw['$defs'] as Record<string, unknown> | undefined) ?? {}
      Object.assign(merged, rewriteExternalRefs(ownDefs) as Record<string, unknown>)
      for (const file of collectExternalRefFiles(raw)) {
        if (seen.has(file)) continue
        seen.add(file)
        queue.push(file)
      }
    }
    return merged
  }

  return (filename: string): Promise<Record<string, unknown>> => {
    let pending = resolved.get(filename)
    if (pending == null) {
      pending = resolveFile(filename)
      resolved.set(filename, pending)
    }
    return pending
  }
}

/**
 * Resolves all sidecar-file `$ref`s in `schema` into a self-contained schema
 * whose `$defs` includes every definition referenced by `schema` itself,
 * with all matching `$ref`s rewritten to same-document form.
 *
 * Returns `schema` unchanged (same reference) when it has no sidecar refs.
 *
 * @param loadSidecar Returns the fully-resolved `$defs` map for a sidecar
 *   file, keyed by def name, with any of *that file's own* external refs
 *   already flattened in and rewritten to same-document form. Typically the
 *   function returned by `createSidecarResolver`, so each file's (expensive,
 *   definition-independent) expansion work happens once and is shared
 *   across every schema that references it.
 */
export async function resolveSidecarRefs (
  schema: Record<string, unknown>,
  loadSidecar: (filename: string) => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const files = collectExternalRefFiles(schema)
  if (files.size === 0) return schema

  const rewrittenSchema = rewriteExternalRefs(schema) as Record<string, unknown>

  // Start from the schema's *rewritten* own defs: they can themselves point at
  // sidecar files, and a def kept with an unrewritten ref would still name a
  // file the consumer cannot resolve.
  const mergedDefs: Record<string, unknown> = { ...(rewrittenSchema['$defs'] as Record<string, unknown> | undefined ?? {}) }
  for (const filename of files) {
    Object.assign(mergedDefs, await loadSidecar(filename))
  }

  return { ...rewrittenSchema, $defs: pruneUnreachableDefs(mergedDefs, collectSameDocRefs(rewrittenSchema)) }
}

/**
 * Builds the definition rewriter used by the API barrels: it resolves any
 * sidecar `$ref`s in a definition's `input` schema into a self-contained one,
 * loading sidecar files from `jsonSubpath` (e.g.
 * `@elastic/schemas/es/json`). Definitions without sidecar refs -- and their
 * `input` schemas -- are returned untouched.
 *
 * Sidecar loading and expansion is memoized across every definition passed to
 * the returned function, so create one per subpath and reuse it.
 */
export function createDefinitionResolver <T extends { input?: Record<string, unknown> }> (
  jsonSubpath: string
): (def: T) => Promise<T> {
  const loadSidecar = createSidecarResolver(async (filename) =>
    requireSchemaModule<Record<string, unknown>>(`${jsonSubpath}/${filename}`)
  )

  return async (def: T): Promise<T> => {
    if (def.input == null) return def
    const input = await resolveSidecarRefs(def.input, loadSidecar)
    return input === def.input ? def : { ...def, input }
  }
}

/**
 * Resolves a top-level `$ref` (e.g. `{"$ref": "#/$defs/DeleteApiKeysRequest", "$defs": {...}}`)
 * into its effective object schema, preserving `$defs` so nested `$ref`s
 * inside the resolved target still resolve.
 *
 * Some `@elastic/schemas` cloud definitions have no top-level `properties`
 * key at all — the whole request shape lives behind a root `$ref` into
 * `$defs` instead. Consumers that only look at `schema.properties` silently
 * see an empty schema for these. Call this before reading `properties`/
 * `required` off any cloud `input` schema.
 *
 * Returns `schema` unchanged if it already has top-level `properties` or no
 * `$ref`. Only same-document refs (`#/$defs/Name`) are supported here —
 * sidecar (external-file) refs must already be resolved via
 * `resolveSidecarRefs` before this runs.
 *
 * @throws {Error} if `schema` has a root `$ref` that does not resolve to an
 *   object with a `properties` key, so a silently-empty schema never reaches
 *   downstream CLI-flag derivation or request building.
 */
export function resolveRootRef (schema: Record<string, unknown>): Record<string, unknown> {
  const ref = schema['$ref']
  if (schema['properties'] != null || typeof ref !== 'string') return schema

  if (!ref.startsWith(SAME_DOC_PREFIX)) {
    throw new Error(`unsupported root $ref "${ref}": expected a same-document ref (${SAME_DOC_PREFIX}Name)`)
  }

  const defs = (schema['$defs'] as Record<string, unknown> | undefined) ?? {}
  const defName = ref.slice(SAME_DOC_PREFIX.length)
  const target = defs[defName]
  if (target == null || typeof target !== 'object' || Array.isArray(target) || (target as Record<string, unknown>)['properties'] == null) {
    throw new Error(`root $ref "${ref}" does not resolve to an object schema with properties`)
  }

  return { ...(target as Record<string, unknown>), $defs: defs }
}
