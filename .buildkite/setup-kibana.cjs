// Copyright Elasticsearch B.V. and contributors
// SPDX-License-Identifier: Apache-2.0
//
// Runs inside a Node.js container on the same Docker network as Elasticsearch.
// Waits for ES to be fully ready (cluster health + security index), then sets
// the kibana_system password so Kibana can connect as that user.
const http = require('http');

const ES_PASSWORD = process.env.ES_PASSWORD || 'changeme';
const KB_PASSWORD = process.env.KB_PASSWORD || ES_PASSWORD;
const auth = 'Basic ' + Buffer.from(`elastic:${ES_PASSWORD}`).toString('base64');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'elasticsearch',
        port: 9200,
        path,
        method,
        headers: {
          Authorization: auth,
          ...(data && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }),
        },
      },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.setTimeout(5000, () => { req.destroy(new Error('request timed out')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function summarize(body) {
  const s = typeof body === 'string' ? body : JSON.stringify(body);
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

async function retry(fn, label, maxRetries = 180, intervalMs = 2000) {
  let lastReason = '(no response observed)';
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fn();
      return;
    } catch (e) {
      lastReason = e.message;
    }
    if (i > 0 && i % 15 === 0) console.log(`  still waiting for ${label}... (${i}/${maxRetries}) — last: ${lastReason}`);
    await delay(intervalMs);
  }
  throw new Error(`${label} did not become ready in time. Last seen: ${lastReason}`);
}

async function main() {
  console.log('Waiting for Elasticsearch cluster health...');
  await retry(async () => {
    const { status, body } = await request('GET', '/_cluster/health');
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${summarize(body)}`);
    if (!['green', 'yellow'].includes(body.status)) throw new Error(`cluster status=${body.status || 'unknown'}`);
  }, 'ES cluster health');
  console.log('ES cluster is up');

  console.log('Waiting for ES security index...');
  await retry(async () => {
    const { status, body } = await request('POST', '/_security/api_key', { name: 'setup-check', expiration: '1m' });
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${summarize(body)}`);
  }, 'ES security index', 60);
  console.log('ES security index is ready');

  console.log('Setting kibana_system password...');
  const { status } = await request('POST', '/_security/user/kibana_system/_password', { password: KB_PASSWORD });
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
  console.log('kibana_system password configured');
}

main().catch(e => { console.error('Setup failed:', e.message); process.exit(1); });
