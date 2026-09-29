/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseVersionHint, isAvailable } from '../../src/lib/availability.ts'

// ---------------------------------------------------------------------------
// parseVersionHint
// ---------------------------------------------------------------------------

describe('parseVersionHint', () => {
  it('returns "serverless" for the literal string "serverless"', () => {
    assert.equal(parseVersionHint('serverless'), 'serverless')
  })

  it('returns [major, minor] tuple for major.minor', () => {
    assert.deepEqual(parseVersionHint('9.2'), [9, 2])
    assert.deepEqual(parseVersionHint('8.14'), [8, 14])
    assert.deepEqual(parseVersionHint('7.7'), [7, 7])
  })

  it('returns [major, minor] tuple for major.minor.patch (patch discarded)', () => {
    assert.deepEqual(parseVersionHint('9.2.3'), [9, 2])
    assert.deepEqual(parseVersionHint('8.14.0'), [8, 14])
  })

  it('returns undefined for v-prefix', () => {
    assert.equal(parseVersionHint('v9.2'), undefined)
  })

  it('returns undefined for bare major only', () => {
    assert.equal(parseVersionHint('9'), undefined)
  })

  it('returns undefined for four-part version', () => {
    assert.equal(parseVersionHint('9.2.3.4'), undefined)
  })

  it('returns undefined for arbitrary strings', () => {
    assert.equal(parseVersionHint('foo'), undefined)
    assert.equal(parseVersionHint(''), undefined)
    assert.equal(parseVersionHint('latest'), undefined)
  })
})

// ---------------------------------------------------------------------------
// isAvailable — helpers
// ---------------------------------------------------------------------------

/** Build a stack-only x-availability with an optional `since` */
function stackOnly (since?: string): unknown {
  return { stack: since != null ? { since } : {} }
}

/** Build a serverless-only x-availability */
function serverlessOnly (): unknown {
  return { serverless: {} }
}

/** Build x-availability available on both */
function both (since?: string): unknown {
  return {
    stack: since != null ? { since } : {},
    serverless: {},
  }
}

// ---------------------------------------------------------------------------
// isAvailable — no target (undefined)
// ---------------------------------------------------------------------------

describe('isAvailable — no target', () => {
  it('returns true when target is undefined, regardless of x-availability', () => {
    assert.equal(isAvailable(stackOnly('9.0.0'), undefined), true)
    assert.equal(isAvailable(serverlessOnly(), undefined), true)
    assert.equal(isAvailable(both(), undefined), true)
    assert.equal(isAvailable(undefined, undefined), true)
    assert.equal(isAvailable(null, undefined), true)
    assert.equal(isAvailable('garbage', undefined), true)
  })
})

// ---------------------------------------------------------------------------
// isAvailable — absent x-availability
// ---------------------------------------------------------------------------

describe('isAvailable — absent x-availability', () => {
  const stackTarget: [number, number] = [9, 2]

  it('returns true when x-availability is undefined', () => {
    assert.equal(isAvailable(undefined, stackTarget), true)
  })

  it('returns true when x-availability is null', () => {
    assert.equal(isAvailable(null, stackTarget), true)
  })

  it('returns true for serverless target with absent x-availability', () => {
    assert.equal(isAvailable(undefined, 'serverless'), true)
  })
})

// ---------------------------------------------------------------------------
// isAvailable — flavor gate
// ---------------------------------------------------------------------------

describe('isAvailable — flavor gate (stack target)', () => {
  const target: [number, number] = [9, 2]

  it('includes stack-only properties for a stack target', () => {
    assert.equal(isAvailable(stackOnly(), target), true)
  })

  it('excludes serverless-only properties for a stack target', () => {
    assert.equal(isAvailable(serverlessOnly(), target), false)
  })

  it('includes properties available on both flavors for a stack target', () => {
    assert.equal(isAvailable(both(), target), true)
  })
})

describe('isAvailable — flavor gate (serverless target)', () => {
  it('excludes stack-only properties for a serverless target', () => {
    assert.equal(isAvailable(stackOnly(), 'serverless'), false)
  })

  it('includes serverless-only properties for a serverless target', () => {
    assert.equal(isAvailable(serverlessOnly(), 'serverless'), true)
  })

  it('includes properties available on both flavors for a serverless target', () => {
    assert.equal(isAvailable(both(), 'serverless'), true)
  })
})

// ---------------------------------------------------------------------------
// isAvailable — version gate (stack targets only)
// ---------------------------------------------------------------------------

describe('isAvailable — version gate (stack target [9, 2])', () => {
  const target: [number, number] = [9, 2]

  it('includes when since is older than target (major.minor)', () => {
    assert.equal(isAvailable(stackOnly('9.0.0'), target), true)
    assert.equal(isAvailable(stackOnly('8.14.0'), target), true)
    assert.equal(isAvailable(stackOnly('7.7.0'), target), true)
  })

  it('includes when since is equal to target', () => {
    assert.equal(isAvailable(stackOnly('9.2.0'), target), true)
    assert.equal(isAvailable(stackOnly('9.2.99'), target), true) // patch ignored
  })

  it('excludes when since minor is newer than target minor (same major)', () => {
    assert.equal(isAvailable(stackOnly('9.3.0'), target), false)
    assert.equal(isAvailable(stackOnly('9.10.0'), target), false)
  })

  it('excludes when since major is newer than target major', () => {
    assert.equal(isAvailable(stackOnly('10.0.0'), target), false)
  })

  it('includes when since is absent from stack block', () => {
    assert.equal(isAvailable(stackOnly(), target), true)
  })
})

describe('isAvailable — version gate (serverless target skips version check)', () => {
  it('does not apply version gate for a serverless target', () => {
    // Even a very new since should not exclude a serverless-capable API
    assert.equal(isAvailable(both('99.99.0'), 'serverless'), true)
    assert.equal(isAvailable(serverlessOnly(), 'serverless'), true)
  })
})

// ---------------------------------------------------------------------------
// isAvailable — malformed x-availability (fail open)
// ---------------------------------------------------------------------------

describe('isAvailable — malformed x-availability', () => {
  const stackTarget: [number, number] = [9, 2]

  it('returns true for a non-object x-availability', () => {
    assert.equal(isAvailable(42, stackTarget), true)
    assert.equal(isAvailable('bad', stackTarget), true)
    assert.equal(isAvailable([], stackTarget), true)
    assert.equal(isAvailable(true, stackTarget), true)
  })

  it('returns true when since is malformed', () => {
    assert.equal(isAvailable({ stack: { since: 'not-a-version' } }, stackTarget), true)
    assert.equal(isAvailable({ stack: { since: '' } }, stackTarget), true)
    assert.equal(isAvailable({ stack: { since: 99 } }, stackTarget), true)
  })

  it('returns true when stack block is not an object', () => {
    assert.equal(isAvailable({ stack: 'bad' }, stackTarget), true)
  })
})

// ---------------------------------------------------------------------------
// filterSchemaByAvailability
// ---------------------------------------------------------------------------

import { filterSchemaByAvailability } from '../../src/lib/availability.ts'

describe('filterSchemaByAvailability', () => {
  it('returns schema unchanged when target is undefined', () => {
    const s = { type: 'object', properties: { a: { type: 'string' } } }
    assert.deepEqual(filterSchemaByAvailability(s, undefined), s)
  })

  it('filters out properties that fail availability check', () => {
    const s = {
      type: 'object',
      properties: {
        a: { type: 'string', 'x-availability': { serverless: {} } },
        b: { type: 'string', 'x-availability': { stack: {} } },
      },
    }
    const result = filterSchemaByAvailability(s, 'serverless')
    const props = result['properties'] as Record<string, unknown>
    assert.ok('a' in props, 'serverless prop must survive for serverless target')
    assert.ok(!('b' in props), 'stack-only prop must be removed for serverless target')
  })

  it('prunes required array for filtered-out properties', () => {
    const s = {
      type: 'object',
      properties: {
        a: { type: 'string', 'x-availability': { serverless: {} } },
        b: { type: 'string', 'x-availability': { stack: {} } },
      },
      required: ['a', 'b'],
    }
    const result = filterSchemaByAvailability(s, 'serverless')
    assert.deepEqual(result['required'], ['a'])
  })

  it('passes through properties without x-availability (fail open)', () => {
    const s = { type: 'object', properties: { a: { type: 'string' } } }
    const result = filterSchemaByAvailability(s, [9, 2] as [number, number])
    const props = result['properties'] as Record<string, unknown>
    assert.ok('a' in props)
  })

  it('returns schema unchanged when no properties field', () => {
    const s = { type: 'string' }
    const result = filterSchemaByAvailability(s, [9, 2] as [number, number])
    assert.deepEqual(result, s)
  })

  it('keeps required intact when it is absent from schema', () => {
    const s = {
      type: 'object',
      properties: { a: { type: 'string', 'x-availability': { stack: {} } } },
    }
    const result = filterSchemaByAvailability(s, [9, 0] as [number, number])
    assert.ok(!('required' in result), 'required should not appear if it was not in original schema')
  })
})
