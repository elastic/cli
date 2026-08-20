/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isSafeSchemaFilename, quoteSpecifier } from '../../scripts/generate-schema-loaders.mjs'

describe('isSafeSchemaFilename', () => {
  it('accepts dotted schema filenames', () => {
    assert.equal(isSafeSchemaFilename('search.js', '.js'), true)
    assert.equal(isSafeSchemaFilename('_types.json', '.json'), true)
    assert.equal(isSafeSchemaFilename('ml.evaluate_data_frame.js', '.js'), true)
    assert.equal(isSafeSchemaFilename('cat.aliases.request.json', '.json'), true)
  })

  it('rejects traversal, HTML, and empty names', () => {
    assert.equal(isSafeSchemaFilename('../package.json', '.json'), false)
    assert.equal(isSafeSchemaFilename('foo</script>.js', '.js'), false)
    assert.equal(isSafeSchemaFilename('foo#bar.js', '.js'), false)
    assert.equal(isSafeSchemaFilename('foo?.js', '.js'), false)
    assert.equal(isSafeSchemaFilename('', '.js'), false)
    assert.equal(isSafeSchemaFilename('search.js', '.json'), false)
  })
})

describe('quoteSpecifier', () => {
  it('keeps slashes so bun can see the package specifier', () => {
    const spec = '@elastic/schemas/es/json/_types.json'
    assert.equal(quoteSpecifier(spec), JSON.stringify(spec))
  })

  it('unicode-escapes script-breaking characters after stringify', () => {
    const quoted = quoteSpecifier('foo</script>bar')
    assert.equal(quoted.includes('<'), false)
    assert.equal(quoted.includes('>'), false)
    assert.equal(quoted.includes('\\u003C'), true)
    assert.equal(quoted.includes('\\u003E'), true)
  })
})
