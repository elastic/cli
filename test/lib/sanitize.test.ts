/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeIndexName,
  sanitizeSnapshotName,
  sanitizeDataStreamType,
  sanitizeDataStreamDataset,
  sanitizeDataStreamNamespace,
  sanitizeFieldName,
  sanitizePipelineName,
  sanitizeRepositoryName,
  truncateUtf8,
} from '../../src/lib/sanitize.ts'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

describe('truncateUtf8', () => {
  it('returns the string unchanged when within byte limit', () => {
    assert.equal(truncateUtf8('hello', 255), 'hello')
  })

  it('truncates ASCII strings to the byte limit', () => {
    const long = 'a'.repeat(300)
    const result = truncateUtf8(long, 255)
    assert.equal(result.length, 255)
    assert.equal(Buffer.byteLength(result, 'utf-8'), 255)
  })

  it('does not split multi-byte characters', () => {
    // Each emoji is 4 bytes. 63 emojis = 252 bytes, 64 = 256 > 255.
    const emojis = '😀'.repeat(64)
    const result = truncateUtf8(emojis, 255)
    assert.equal(Buffer.byteLength(result, 'utf-8'), 252)
    assert.equal(result.length, 63 * 2) // each emoji is 2 UTF-16 code units
  })

  it('handles 2-byte characters at the boundary', () => {
    // 'ñ' is 2 bytes in UTF-8. 127 ñ = 254 bytes, 128 = 256 > 255.
    const input = 'ñ'.repeat(128)
    const result = truncateUtf8(input, 255)
    assert.equal(Buffer.byteLength(result, 'utf-8'), 254)
  })

  it('returns empty string for empty input', () => {
    assert.equal(truncateUtf8('', 255), '')
  })
})

// ---------------------------------------------------------------------------
// Index name / alias name
// ---------------------------------------------------------------------------

describe('sanitizeIndexName', () => {
  it('passes through a valid lowercase index name', () => {
    const r = sanitizeIndexName('my-index-001')
    assert.equal(r.sanitized, 'my-index-001')
    assert.deepEqual(r.changes, [])
  })

  it('lowercases the value', () => {
    const r = sanitizeIndexName('My-Index')
    assert.equal(r.sanitized, 'my-index')
    assert.ok(r.changes.some(c => /lowercase/i.test(c)))
  })

  it('strips forbidden characters', () => {
    const r = sanitizeIndexName('my\\index/name*with?bad"chars<>|and spaces,#:')
    assert.equal(r.sanitized, 'myindexnamewithbadcharsandspaces')
    assert.ok(r.changes.some(c => /stripped/i.test(c) || /removed/i.test(c)))
  })

  it('removes leading _, -, +', () => {
    const r = sanitizeIndexName('_-+my-index')
    assert.equal(r.sanitized, 'my-index')
    assert.ok(r.changes.some(c => /leading/i.test(c)))
  })

  it('truncates to 255 bytes', () => {
    const long = 'a'.repeat(300)
    const r = sanitizeIndexName(long)
    assert.equal(Buffer.byteLength(r.sanitized, 'utf-8'), 255)
    assert.ok(r.changes.some(c => /truncat/i.test(c)))
  })

  it('replaces "." with a safe alternative', () => {
    const r = sanitizeIndexName('.')
    assert.notEqual(r.sanitized, '.')
    assert.notEqual(r.sanitized, '')
    assert.ok(r.changes.some(c => /dot/i.test(c) || /reserved/i.test(c)))
  })

  it('replaces ".." with a safe alternative', () => {
    const r = sanitizeIndexName('..')
    assert.notEqual(r.sanitized, '..')
    assert.ok(r.changes.some(c => /dot/i.test(c) || /reserved/i.test(c)))
  })

  it('dot replacement is idempotent (sanitizing twice gives the same result)', () => {
    const first = sanitizeIndexName('.')
    const second = sanitizeIndexName(first.sanitized)
    assert.equal(second.sanitized, first.sanitized)
    assert.equal(second.changes.length, 0)
  })

  it('double-dot replacement is idempotent', () => {
    const first = sanitizeIndexName('..')
    const second = sanitizeIndexName(first.sanitized)
    assert.equal(second.sanitized, first.sanitized)
    assert.equal(second.changes.length, 0)
  })

  it('strips zero-width characters', () => {
    const r = sanitizeIndexName('my\u200Bindex\uFEFF')
    assert.equal(r.sanitized, 'myindex')
  })

  it('returns an error result when input sanitizes to empty', () => {
    const r = sanitizeIndexName('***')
    assert.equal(r.sanitized, '')
    assert.ok(r.changes.some(c => /empty/i.test(c)))
  })

  it('preserves dots in the middle of a name', () => {
    const r = sanitizeIndexName('my.index.name')
    assert.equal(r.sanitized, 'my.index.name')
  })

  it('strips newlines and other whitespace (issue #76 example)', () => {
    const r = sanitizeIndexName(' foo\nbar')
    assert.equal(r.sanitized, 'foobar')
    assert.ok(r.changes.some(c => /whitespace/i.test(c)))
  })
})

// ---------------------------------------------------------------------------
// Snapshot name
// ---------------------------------------------------------------------------

describe('sanitizeSnapshotName', () => {
  it('passes through a valid snapshot name', () => {
    const r = sanitizeSnapshotName('daily-backup-001')
    assert.equal(r.sanitized, 'daily-backup-001')
    assert.deepEqual(r.changes, [])
  })

  it('lowercases the value', () => {
    const r = sanitizeSnapshotName('MySnapshot')
    assert.equal(r.sanitized, 'mysnapshot')
  })

  it('strips all whitespace (not just leading/trailing)', () => {
    const r = sanitizeSnapshotName('my snapshot name')
    assert.equal(r.sanitized, 'mysnapshotname')
  })

  it('removes leading _ only (not - or +)', () => {
    const r = sanitizeSnapshotName('_snapshot')
    assert.equal(r.sanitized, 'snapshot')

    const r2 = sanitizeSnapshotName('-snapshot')
    assert.equal(r2.sanitized, '-snapshot')

    const r3 = sanitizeSnapshotName('+snapshot')
    assert.equal(r3.sanitized, '+snapshot')
  })

  it('strips the same forbidden characters as index names', () => {
    const r = sanitizeSnapshotName('snap\\shot/with*bad?chars')
    assert.equal(r.sanitized, 'snapshotwithbadchars')
  })

  it('truncates to 255 bytes', () => {
    const long = 'a'.repeat(300)
    const r = sanitizeSnapshotName(long)
    assert.equal(Buffer.byteLength(r.sanitized, 'utf-8'), 255)
  })

  it('dot replacement is idempotent', () => {
    const first = sanitizeSnapshotName('.')
    const second = sanitizeSnapshotName(first.sanitized)
    assert.equal(second.sanitized, first.sanitized)
    assert.equal(second.changes.length, 0)
  })
})

// ---------------------------------------------------------------------------
// Data stream components
// ---------------------------------------------------------------------------

describe('sanitizeDataStreamType', () => {
  it('passes through a valid type', () => {
    const r = sanitizeDataStreamType('logs')
    assert.equal(r.sanitized, 'logs')
    assert.deepEqual(r.changes, [])
  })

  it('strips forbidden characters including hyphens', () => {
    const r = sanitizeDataStreamType('my-log\\type')
    assert.equal(r.sanitized, 'mylogtype')
  })

  it('strips spaces, commas, hash, colon', () => {
    const r = sanitizeDataStreamType('my type,with#extras:here')
    assert.equal(r.sanitized, 'mytypewithextrashere')
  })
})

describe('sanitizeDataStreamDataset', () => {
  it('passes through a valid dataset', () => {
    const r = sanitizeDataStreamDataset('nginx.access')
    assert.equal(r.sanitized, 'nginx.access')
    assert.deepEqual(r.changes, [])
  })

  it('strips hyphens', () => {
    const r = sanitizeDataStreamDataset('my-dataset')
    assert.equal(r.sanitized, 'mydataset')
  })
})

describe('sanitizeDataStreamNamespace', () => {
  it('passes through a valid namespace', () => {
    const r = sanitizeDataStreamNamespace('production')
    assert.equal(r.sanitized, 'production')
    assert.deepEqual(r.changes, [])
  })

  it('allows hyphens (unlike type/dataset)', () => {
    const r = sanitizeDataStreamNamespace('my-namespace')
    assert.equal(r.sanitized, 'my-namespace')
    assert.deepEqual(r.changes, [])
  })

  it('strips other forbidden characters', () => {
    const r = sanitizeDataStreamNamespace('my namespace*with|bad')
    assert.equal(r.sanitized, 'mynamespacewithbad')
  })
})

// ---------------------------------------------------------------------------
// Field name
// ---------------------------------------------------------------------------

describe('sanitizeFieldName', () => {
  it('passes through a valid field name', () => {
    const r = sanitizeFieldName('message')
    assert.equal(r.sanitized, 'message')
    assert.deepEqual(r.changes, [])
  })

  it('trims leading and trailing whitespace', () => {
    const r = sanitizeFieldName('  message  ')
    assert.equal(r.sanitized, 'message')
    assert.ok(r.changes.some(c => /trim/i.test(c) || /whitespace/i.test(c)))
  })

  it('warns when dots are present (but preserves them)', () => {
    const r = sanitizeFieldName('host.name')
    assert.equal(r.sanitized, 'host.name')
    assert.ok(r.changes.some(c => /dot/i.test(c)))
  })

  it('returns an error for empty input', () => {
    const r = sanitizeFieldName('')
    assert.equal(r.sanitized, '')
    assert.ok(r.changes.some(c => /empty/i.test(c)))
  })

  it('returns an error for whitespace-only input', () => {
    const r = sanitizeFieldName('   ')
    assert.equal(r.sanitized, '')
    assert.ok(r.changes.some(c => /empty/i.test(c)))
  })

  it('strips zero-width characters', () => {
    const r = sanitizeFieldName('my\u200Bfield')
    assert.equal(r.sanitized, 'myfield')
  })
})

// ---------------------------------------------------------------------------
// Pipeline name
// ---------------------------------------------------------------------------

describe('sanitizePipelineName', () => {
  it('applies the same rules as index names', () => {
    const r = sanitizePipelineName('My\\Pipeline*Name')
    assert.equal(r.sanitized, 'mypipelinename')
  })

  it('removes leading _-+ characters', () => {
    const r = sanitizePipelineName('_my-pipeline')
    assert.equal(r.sanitized, 'my-pipeline')
  })

  it('truncates to 255 bytes', () => {
    const long = 'p'.repeat(300)
    const r = sanitizePipelineName(long)
    assert.equal(Buffer.byteLength(r.sanitized, 'utf-8'), 255)
  })
})

// ---------------------------------------------------------------------------
// Repository name
// ---------------------------------------------------------------------------

describe('sanitizeRepositoryName', () => {
  it('passes through a valid repository name', () => {
    const r = sanitizeRepositoryName('my-backup-repo')
    assert.equal(r.sanitized, 'my-backup-repo')
    assert.deepEqual(r.changes, [])
  })

  it('strips invalid filename characters', () => {
    const r = sanitizeRepositoryName('my\\repo/with*bad?chars"<>|:')
    assert.equal(r.sanitized, 'myrepowithbadchars')
  })

  it('preserves case (unlike index names)', () => {
    const r = sanitizeRepositoryName('MyRepo')
    assert.equal(r.sanitized, 'MyRepo')
  })

  it('strips zero-width characters', () => {
    const r = sanitizeRepositoryName('my\u200Brepo')
    assert.equal(r.sanitized, 'myrepo')
  })
})
