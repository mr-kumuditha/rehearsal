import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {gatewayHeaders, gatewayServices, gatewayTransport} from '../src/lib/gateway.ts';

const nativeFetch=globalThis.fetch;
const envNames=['GATEWAY_SERVICES','GATEWAY_TOKEN','GATEWAY_TOKEN_URL','GATEWAY_CLIENT_ID','GATEWAY_CLIENT_SECRET'];
afterEach(()=>{globalThis.fetch=nativeFetch;for(const name of envNames)delete process.env[name];});
function oauth(id:string) {
  process.env.GATEWAY_SERVICES='delivery';
  process.env.GATEWAY_TOKEN_URL='https://gateway.example/oauth2/token';
  process.env.GATEWAY_CLIENT_ID=id;
  process.env.GATEWAY_CLIENT_SECRET='test-secret';
}
test('gateway credentials are attached only to the selected provider',async()=>{
  process.env.GATEWAY_TOKEN='test-only-token';
  assert.deepEqual(gatewayServices(),['delivery']);
  assert.deepEqual(await gatewayHeaders('inventory'),{});
  assert.deepEqual(await gatewayHeaders('payment'),{});
  assert.deepEqual(await gatewayHeaders('delivery'),{Authorization:'Bearer test-only-token'});
  assert.equal(gatewayTransport(),'gateway-configured');
});
test('concurrent gateway requests share one OAuth refresh',async()=>{
  oauth('concurrent');
  let requests=0;
  globalThis.fetch=async (url,options)=>{
    requests++;
    assert.equal(String(url),'https://gateway.example/oauth2/token');
    assert.equal(options?.redirect,'error');
    assert.equal(String(options?.body),'grant_type=client_credentials');
    return Response.json({access_token:'short-test-token',expires_in:3600});
  };
  const headers=await Promise.all(Array.from({length:5},()=>gatewayHeaders('delivery')));
  assert.ok(headers.every(h=>h.Authorization==='Bearer short-test-token'));
  await gatewayHeaders('delivery');
  assert.equal(requests,1);
});
test('failed OAuth refresh cannot fall back to unauthenticated execution',async()=>{
  oauth('failure');
  globalThis.fetch=async()=>new Response('',{status:401});
  await assert.rejects(gatewayHeaders('delivery'),/Gateway token request failed/);
  globalThis.fetch=async()=>Response.json({access_token:'replacement',expires_in:3600});
  assert.equal((await gatewayHeaders('delivery')).Authorization,'Bearer replacement');
});
test('expired credentials are refreshed before the next request',async()=>{
  oauth('expiration');
  let count=0;
  globalThis.fetch=async()=>Response.json({access_token:`token-${++count}`,expires_in:0.01});
  await gatewayHeaders('delivery');
  await new Promise(r=>setTimeout(r,20));
  assert.equal((await gatewayHeaders('delivery')).Authorization,'Bearer token-2');
});
test('malformed token responses and insecure token endpoints are rejected',async()=>{
  oauth('malformed');
  globalThis.fetch=async()=>Response.json({access_token:'bad',expires_in:'unknown'});
  await assert.rejects(gatewayHeaders('delivery'),/invalid token response/);
  process.env.GATEWAY_TOKEN_URL='http://gateway.example/token';
  await assert.rejects(gatewayHeaders('delivery'),/must use HTTPS/);
});
