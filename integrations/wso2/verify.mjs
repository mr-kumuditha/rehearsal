// Read-only quota probes and isolated sandbox writes; no real bookings or payments.
// Export NODE_EXTRA_CA_CERTS before starting Node, then run on the VPS:
// node --env-file=/etc/rehearsal/gateway.env integrations/wso2/verify.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.DELIVERY_URL;
assert.equal(base, 'https://localhost:8243/rehearsal/delivery/1.0.0');
const get = (path, headers = {}) => fetch(base + path, { headers, signal: AbortSignal.timeout(10000) });
const summary = { checkedAt: new Date().toISOString(), version: '4.7.0' };
for (const [name, headers] of [['missingToken', {}], ['invalidToken', { Authorization: 'Bearer invalid-rehearsal-test-token' }]]) {
  const response = await get('/health', headers);
  const body = await response.json();
  assert.equal(response.status, 401);
  summary[name] = { status: response.status, code: body.code };
}
const tokenResponse = await fetch(process.env.GATEWAY_TOKEN_URL, {
  method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${process.env.GATEWAY_CLIENT_ID}:${process.env.GATEWAY_CLIENT_SECRET}`).toString('base64')}` },
  body: new URLSearchParams({ grant_type: 'client_credentials' }), signal: AbortSignal.timeout(10000),
});
assert.equal(tokenResponse.status, 200);
const { access_token } = await tokenResponse.json();
assert.ok(access_token);
const headers = { Authorization: `Bearer ${access_token}`, 'X-Rehearsal-Run': randomUUID(), 'Content-Type': 'application/json' };
const health = await get('/health', headers);
assert.equal(health.status, 200);
assert.equal((await health.json()).service, 'delivery');
summary.validToken = { status: 200 };
const execute = () => fetch(base + '/execute', { method: 'POST', headers, body: JSON.stringify({ key: 'gateway-proof', scenario: 'rate-limit' }), signal: AbortSignal.timeout(10000) });
const first = await execute();
assert.equal(first.status, 429);
assert.equal(first.headers.get('retry-after'), '1');
assert.equal((await first.json()).error, 'Sandbox quota reached');
summary.providerQuota = { status: 429, retryAfter: '1', source: 'sandbox' };
await new Promise(resolve => setTimeout(resolve, 1100));
assert.equal((await execute()).status, 201);
const replay = await execute();
assert.equal(replay.status, 200);
assert.equal((await replay.json()).replayed, true);
const ledger = await get('/ledger', headers);
assert.equal((await ledger.json()).operations.length, 1);
summary.stableOperationKey = { committedDeliveries: 1, replayed: true };
const attempts = [];
for (let i = 0; i < 12; i++) {
  const response = await fetch('https://localhost:8243/rehearsal/gateway-probe/1.0.0/health', { headers, signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  attempts.push({ status: response.status, ...(body.code ? { code: body.code } : {}) });
  if (response.status === 429) break;
  assert.equal(response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(attempts.some(a => a.status === 429 && String(a.code).startsWith('9008')));
assert.equal((await fetch('http://127.0.0.1:4313/health')).status, 200);
assert.equal((await get('/health', headers)).status, 200);
summary.gatewayQuota = { attempts, directProviderHealth: 200, mainDeliveryApiHealth: 200 };
console.log(JSON.stringify(summary, null, 2));
