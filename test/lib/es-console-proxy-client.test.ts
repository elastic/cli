/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONSOLE_PROXY_PATH,
  EsConsoleProxyClient,
  consoleProxyUrl,
  proxiedEsStatus,
} from '../../src/lib/es-console-proxy-client.ts'
import { EsConnectionError, EsResponseError } from '../../src/lib/es-transport.ts'
import { clientHeaders } from '../../src/lib/meta.ts'

const KIBANA = 'https://kibana.example'

type FetchCall = { url: string, init: RequestInit }

/** Records every request and replies with the responder's result. */
function recordingClient (
  responder: (url: string) => Response | Promise<Response> | Error,
  auth?: { api_key: string } | { username: string, password: string },
): { client: EsConsoleProxyClient, calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const client = new EsConsoleProxyClient(KIBANA, auth)
  client._testSetFetch((async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: typeof url === 'string' ? url : url.toString(), init: init ?? {} })
    const r = await responder(typeof url === 'string' ? url : url.toString())
    if (r instanceof Error) throw r
    return r
  }) as unknown as typeof fetch)
  return { client, calls }
}

/** A proxied Elasticsearch reply: outer 200 plus the real ES status in the header. */
function proxied (body: string, esStatus = 200, contentType = 'application/json'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, 'x-console-proxy-status-code': String(esStatus) },
  })
}

describe('consoleProxyUrl', () => {
  it('encodes the Elasticsearch path into the path parameter', () => {
    const url = consoleProxyUrl(KIBANA, '/_cluster/health', 'GET')
    assert.equal(url, `${KIBANA}${CONSOLE_PROXY_PATH}?path=%2F_cluster%2Fhealth&method=GET`)
  })

  it('uppercases the method', () => {
    assert.match(consoleProxyUrl(KIBANA, '/_search', 'post'), /&method=POST$/)
  })

  it('strips trailing slashes from the Kibana url', () => {
    assert.match(consoleProxyUrl(`${KIBANA}///`, '/_search', 'GET'), new RegExp(`^${KIBANA}\\${CONSOLE_PROXY_PATH}`))
  })

  it('re-encodes an already-encoded path so Kibana\'s single decode restores it', () => {
    // An index named `my index` reaches us as `/my%20index/_search`; Kibana decodes the
    // query parameter once, which must yield that exact string back.
    const url = consoleProxyUrl(KIBANA, '/my%20index/_search', 'POST')
    assert.match(url, /path=%2Fmy%2520index%2F_search/)
    const decoded = new URL(url).searchParams.get('path')
    assert.equal(decoded, '/my%20index/_search')
  })

  it('encodes a literal space as %20 rather than +', () => {
    // URLSearchParams would form-encode this to `+`, which a percent-decoder reads as `+`.
    const url = consoleProxyUrl(KIBANA, '/my index/_search', 'POST')
    assert.match(url, /path=%2Fmy%20index%2F_search/)
    assert.ok(!url.includes('+'))
  })

  it('encodes path traversal and fragment characters', () => {
    const url = consoleProxyUrl(KIBANA, '/../_nodes?x=1#frag', 'GET')
    assert.ok(!url.includes('#'), 'fragment must not terminate the url')
    assert.match(url, /path=%2F\.\.%2F_nodes%3Fx%3D1%23frag/)
    assert.equal(new URL(url).searchParams.get('path'), '/../_nodes?x=1#frag')
  })

  it('preserves wildcards, which Elasticsearch needs verbatim', () => {
    assert.match(consoleProxyUrl(KIBANA, '/logs-*/_search', 'POST'), /path=%2Flogs-\*%2F_search/)
  })

  it('handles an empty path', () => {
    assert.equal(consoleProxyUrl(KIBANA, '', 'GET'), `${KIBANA}${CONSOLE_PROXY_PATH}?path=&method=GET`)
  })
})

describe('proxiedEsStatus', () => {
  it('reads the proxy status header', () => {
    assert.equal(proxiedEsStatus(proxied('{}', 404)), 404)
  })

  it('falls back to the outer status when the header is absent', () => {
    assert.equal(proxiedEsStatus(new Response('{}', { status: 200 })), 200)
  })

  it('falls back when the header is not a usable number', () => {
    for (const value of ['', 'abc', '0', '-1', '2.5']) {
      const response = new Response('{}', {
        status: 201,
        headers: { 'x-console-proxy-status-code': value },
      })
      assert.equal(proxiedEsStatus(response), 201, `header value ${JSON.stringify(value)}`)
    }
  })
})

describe('EsConsoleProxyClient.request', () => {
  it('posts to the Console proxy with the Elasticsearch method in the query', async () => {
    const { client, calls } = recordingClient(() => proxied('{"ok":true}'))
    await client.request({ method: 'GET', path: '/_cluster/health' })

    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, `${KIBANA}${CONSOLE_PROXY_PATH}?path=%2F_cluster%2Fhealth&method=GET`)
    // The outer request is always POST; the ES method travels as a query parameter.
    assert.equal(calls[0]!.init.method, 'POST')
    assert.equal(calls[0]!.init.redirect, 'error')
  })

  it('keeps GET as the Elasticsearch method even with a body', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({ method: 'GET', path: '/_search', body: { size: 0 } })

    assert.match(calls[0]!.url, /&method=GET$/)
    assert.equal(calls[0]!.init.method, 'POST')
    assert.equal(calls[0]!.init.body, '{"size":0}')
  })

  it('folds the Elasticsearch querystring into the path parameter', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({
      method: 'POST',
      path: '/logs-*/_search',
      querystring: { size: 0, terminate_after: 1, ignored: undefined },
    })

    const path = new URL(calls[0]!.url).searchParams.get('path')
    assert.equal(path, '/logs-*/_search?size=0&terminate_after=1')
    assert.ok(!path!.includes('ignored'), 'undefined querystring values are skipped')
  })

  it('sends the headers Kibana requires', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'), { api_key: 'secret-key' })
    await client.request({ method: 'GET', path: '/' })

    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], 'ApiKey secret-key')
    assert.equal(headers['kbn-xsrf'], 'true')
    // Without this header Kibana rejects the route with a misleading 400.
    assert.equal(headers['x-elastic-internal-origin'], 'Kibana')
    assert.equal(headers['Accept'], 'application/json')
    const meta = clientHeaders()
    assert.equal(headers['x-elastic-client-meta'], meta['x-elastic-client-meta'])
    assert.equal(headers['user-agent'], meta['user-agent'])
  })

  it('encodes basic auth', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'), { username: 'u', password: 'p' })
    await client.request({ method: 'GET', path: '/' })

    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], `Basic ${Buffer.from('u:p').toString('base64')}`)
  })

  it('omits Authorization when no auth is configured', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({ method: 'GET', path: '/' })

    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Authorization'], undefined)
  })

  it('serializes an object body as JSON', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({ method: 'POST', path: '/_search', body: { query: { match_all: {} } } })

    const headers = calls[0]!.init.headers as Record<string, string>
    assert.equal(headers['Content-Type'], 'application/json')
    assert.equal(calls[0]!.init.body, '{"query":{"match_all":{}}}')
  })

  it('passes a string body through unchanged', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({ method: 'POST', path: '/_search', body: '{"raw":1}' })

    assert.equal(calls[0]!.init.body, '{"raw":1}')
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Content-Type'], 'application/json')
  })

  it('sends a bulk body as NDJSON, taking precedence over body', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    const ndjson = '{"index":{}}\n{"a":1}\n'
    await client.request({ method: 'POST', path: '/_bulk', body: { ignored: true }, bulkBody: ndjson })

    assert.equal(calls[0]!.init.body, ndjson)
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Content-Type'], 'application/x-ndjson')
  })

  it('sends no body when none is given', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({ method: 'GET', path: '/' })

    assert.equal(calls[0]!.init.body, undefined)
    assert.equal((calls[0]!.init.headers as Record<string, string>)['Content-Type'], undefined)
  })

  it('lets caller headers override the defaults', async () => {
    const { client, calls } = recordingClient(() => proxied('{}'))
    await client.request({ method: 'GET', path: '/' }, { headers: { 'Accept': 'text/plain' } })

    assert.equal((calls[0]!.init.headers as Record<string, string>)['Accept'], 'text/plain')
  })

  it('returns the parsed Elasticsearch body', async () => {
    const { client } = recordingClient(() => proxied('{"hits":{"total":{"value":7}}}'))
    const result = await client.request<{ hits: { total: { value: number } } }>(
      { method: 'POST', path: '/_search' }
    )

    assert.equal(result.hits.total.value, 7)
  })

  it('returns raw text for non-JSON responses, keeping cat APIs usable', async () => {
    const { client } = recordingClient(() => proxied('green open logs-1\n', 200, 'text/plain'))
    const result = await client.request({ method: 'GET', path: '/_cat/indices' })

    assert.equal(result, 'green open logs-1\n')
  })

  it('returns an empty object for an empty body', async () => {
    const { client } = recordingClient(() => proxied(''))
    assert.deepEqual(await client.request({ method: 'GET', path: '/' }), {})
  })

  it('returns the payload when Kibana mislabels a non-JSON body as JSON', async () => {
    const { client } = recordingClient(() => proxied('<html>gateway</html>'))
    assert.equal(await client.request({ method: 'GET', path: '/' }), '<html>gateway</html>')
  })

  it('throws EsResponseError with the real Elasticsearch status from the header', async () => {
    const body = { error: { type: 'index_not_found_exception' }, status: 404 }
    // The outer response is 200: only the header carries the true status.
    const { client } = recordingClient(() => proxied(JSON.stringify(body), 404))

    await assert.rejects(
      () => client.request({ method: 'POST', path: '/missing/_search' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 404)
        assert.deepEqual(err.body, body)
        return true
      }
    )
  })

  it('reports HEAD as found or missing using the proxied status', async () => {
    const { client: found } = recordingClient(() => proxied('', 200))
    assert.equal(await found.request({ method: 'HEAD', path: '/logs-1' }), true)

    const { client: missing } = recordingClient(() => proxied('', 404))
    assert.equal(await missing.request({ method: 'HEAD', path: '/nope' }), false)
  })

  it('throws for a HEAD failure that is not a 404', async () => {
    const { client } = recordingClient(() => proxied('{"error":"boom"}', 500))
    await assert.rejects(
      () => client.request({ method: 'HEAD', path: '/logs-1' }),
      (err: unknown) => {
        assert.ok(err instanceof EsResponseError)
        assert.equal(err.statusCode, 500)
        return true
      }
    )
  })

  it('wraps a transport failure as EsConnectionError', async () => {
    const { client } = recordingClient(() => new Error('getaddrinfo ENOTFOUND kibana.example'))
    await assert.rejects(
      () => client.request({ method: 'GET', path: '/' }),
      (err: unknown) => {
        assert.ok(err instanceof EsConnectionError)
        assert.match(err.message, /ENOTFOUND/)
        return true
      }
    )
  })

  it('reports a Kibana rejection as a connection failure, not an ES response', async () => {
    // Kibana refused the request, so the Elasticsearch call never happened.
    const { client } = recordingClient(() => new Response('nope', { status: 502 }))
    await assert.rejects(
      () => client.request({ method: 'GET', path: '/' }),
      (err: unknown) => {
        assert.ok(err instanceof EsConnectionError)
        assert.match(err.message, /Kibana rejected the Elasticsearch request \(HTTP 502\)/)
        assert.match(err.message, /nope/)
        return true
      }
    )
  })

  it('hints at the Console proxy when Kibana reports the route as unavailable', async () => {
    const body = JSON.stringify({
      statusCode: 400,
      message: 'uri [/api/console/proxy] with method [post] exists but is not available with the current configuration',
    })
    const { client } = recordingClient(() => new Response(body, { status: 400 }))

    await assert.rejects(
      () => client.request({ method: 'GET', path: '/' }),
      (err: unknown) => {
        assert.ok(err instanceof EsConnectionError)
        assert.match(err.message, /console\.ui\.enabled/)
        return true
      }
    )
  })

  it('hints at the kibana credentials on an auth failure', async () => {
    for (const status of [401, 403]) {
      const { client } = recordingClient(() => new Response('denied', { status }))
      await assert.rejects(
        () => client.request({ method: 'GET', path: '/' }),
        (err: unknown) => {
          assert.match((err as Error).message, /kibana credentials/)
          return true
        }
      )
    }
  })

  it('warns once when Kibana is addressed over plaintext HTTP', () => {
    const original = process.stderr.write.bind(process.stderr)
    const written: string[] = []
    process.stderr.write = ((chunk: string) => { written.push(chunk); return true }) as typeof process.stderr.write
    try {
      new EsConsoleProxyClient('http://kibana.example')
      new EsConsoleProxyClient('http://localhost:5601')
    } finally {
      process.stderr.write = original
    }

    assert.equal(written.length, 1, 'loopback hosts must not warn')
    assert.match(written[0]!, /plaintext HTTP/)
  })
})
