/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ConnectionError, toConnectionError } from '../../src/lib/http-errors.ts'
import { EsClient } from '../../src/lib/es-client.ts'
import { KibanaClient } from '../../src/lib/kibana-client.ts'
import { CloudClient } from '../../src/lib/cloud-client.ts'
import { createEsHandler } from '../../src/es/handler.ts'
import { createKbHandler } from '../../src/kb/handler.ts'
import { createCloudHandler } from '../../src/cloud/handler.ts'
import type { HandlerResult, ParsedResult } from '../../src/factory.ts'

// the shapes Node's fetch rejects with (verified on Node 22+)
function fetchFailed (code: string | undefined, message: string): TypeError {
  return new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) })
}

const TLS_MISMATCH = fetchFailed(
  'ERR_SSL_WRONG_VERSION_NUMBER',
  '0024305F3D7F0000:error:0A00010B:SSL routines:tls_validate_record_header:wrong version number:../deps/openssl/openssl/ssl/record/methods/tlsany_meth.c:78:\n'
)
const DNS_FAILURE = fetchFailed('ENOTFOUND', 'getaddrinfo ENOTFOUND nope.invalid')

describe('toConnectionError', () => {
  it('appends the cause code and message to the fetch message', () => {
    const err = toConnectionError(TLS_MISMATCH)
    assert.ok(err instanceof ConnectionError)
    assert.equal(err.cause, TLS_MISMATCH)
    assert.equal(
      err.message,
      'fetch failed: ERR_SSL_WRONG_VERSION_NUMBER: 0024305F3D7F0000:error:0A00010B:SSL routines:tls_validate_record_header:wrong version number:../deps/openssl/openssl/ssl/record/methods/tlsany_meth.c:78:'
    )
  })

  it('does not repeat a code the cause message already names', () => {
    assert.equal(toConnectionError(DNS_FAILURE).message, 'fetch failed: getaddrinfo ENOTFOUND nope.invalid')
  })

  it('keeps a cause message that has no code', () => {
    assert.equal(toConnectionError(fetchFailed(undefined, 'bad port')).message, 'fetch failed: bad port')
  })

  it('uses the message alone when there is no cause', () => {
    assert.equal(toConnectionError(new TypeError('fetch failed')).message, 'fetch failed')
  })

  it('coerces non-Error rejections to string', () => {
    assert.equal(toConnectionError('boom').message, 'boom')
  })
})

interface ProductCase {
  product: string
  run: (rejection: unknown) => Promise<HandlerResult>
}

const parsed: ParsedResult = { options: {}, input: {} }

function rejectWith (rejection: unknown): typeof fetch {
  return (() => Promise.reject(rejection)) as typeof fetch
}

const products: ProductCase[] = [
  {
    product: 'es',
    run: async (rejection) => {
      const client = new EsClient('https://localhost:9200')
      client._testSetFetch(rejectWith(rejection))
      const def = { name: 'info', description: 'Info', method: 'GET' as const, path: '/' }
      return await createEsHandler(def, [], {
        getEsClient: () => client,
        buildRequestParams: () => ({ method: 'GET', path: '/' }),
      })(parsed)
    },
  },
  {
    product: 'kb',
    run: async (rejection) => {
      const client = new KibanaClient('https://localhost:5601')
      client._testSetFetch(rejectWith(rejection))
      const def = { name: 'get', namespace: 'spaces', description: 'List spaces', method: 'GET' as const, path: '/api/spaces/space' }
      return await createKbHandler(def, {
        getKibanaClient: () => client,
        buildKibanaRequestParams: () => ({ method: 'GET', path: '/api/spaces/space' }),
      })(parsed)
    },
  },
  {
    product: 'cloud',
    run: async (rejection) => {
      const client = new CloudClient('https://localhost:8443', 'k')
      client._testSetFetch(rejectWith(rejection))
      const def = { name: 'list-deployments', namespace: 'deployments', description: 'List', method: 'GET' as const, path: '/api/v1/deployments', destructive: false, readOnly: true }
      return await createCloudHandler(def, {
        getCloudClient: () => client,
        buildCloudRequestParams: () => ({ method: 'GET', path: '/api/v1/deployments' }),
      })(parsed)
    },
  },
]

describe('fetch rejections in every product handler', () => {
  for (const { product, run } of products) {
    it(`${product}: reports a DNS failure as connection_error with the cause`, async () => {
      assert.deepEqual(await run(DNS_FAILURE), {
        error: { code: 'connection_error', message: 'fetch failed: getaddrinfo ENOTFOUND nope.invalid' },
      })
    })

    it(`${product}: adds the TLS hint when https:// hits a plain-HTTP server`, async () => {
      const { error } = await run(TLS_MISMATCH) as { error: { code: string; message: string } }
      assert.equal(error.code, 'connection_error')
      assert.match(error.message, /wrong version number/)
      assert.match(error.message, /Hint: this looks like a TLS\/SSL error/)
    })
  }
})
