// Run on the private VPS with NODE_EXTRA_CA_CERTS pointing to its gateway certificate.
// Credentials and resumable provisioning state never leave /etc/rehearsal.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = 'https://localhost:9443';
const statePath = '/etc/rehearsal/apim-provision.json';
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
const password = readFileSync('/etc/rehearsal/apim-admin.env', 'utf8')
  .split('\n').find(line => line.startsWith('APIM_ADMIN_PASSWORD=')).split('=')[1];
const basic = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
let token;
async function request(path, method = 'GET', body, authorization = `Bearer ${token}`) {
  const form = body instanceof FormData || body instanceof URLSearchParams;
  const response = await fetch(origin + path, {
    method, headers: { Authorization: authorization, ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(30000), redirect: 'error',
  });
  const text = await response.text();
  if (!response.ok) {
    // Do not print response bodies: credential endpoints may include secrets.
    let code; try { code = JSON.parse(text).code; } catch {}
    throw new Error(`${method} ${path}: HTTP ${response.status}, code ${code ?? 'unavailable'}`);
  }
  return text ? JSON.parse(text) : {};
}
if (!state.client) {
  state.client = await request('/client-registration/v0.17/register', 'POST', {
    callbackUrl: 'https://localhost', clientName: 'RehearsalProvisioner', owner: 'admin',
    grantType: 'password refresh_token', saasApp: true,
  }, basic('admin', password)); save();
}
const auth = await request('/oauth2/token', 'POST', new URLSearchParams({
  grant_type: 'password', username: 'admin', password,
  scope: 'apim:api_view apim:api_create apim:api_publish apim:api_manage apim:subscribe apim:app_manage apim:admin apim:tier_manage',
}), basic(state.client.clientId, state.client.clientSecret));
token = auth.access_token;
if (!token) throw new Error('Provisioning token was not issued.');
console.log('Authenticated to the private control plane.');
const admin = '/api/am/admin/v4';
const pub = '/api/am/publisher/v4';
const dev = '/api/am/devportal/v3';
const policyName = 'RehearsalProbe2PerMin';
const policies = await request(`${admin}/throttling/policies/advanced`);
if (!policies.list.some(p => p.policyName === policyName)) {
  await request(`${admin}/throttling/policies/advanced`, 'POST', {
    policyName, displayName: 'Rehearsal probe: two requests per minute',
    description: 'Read-only gateway enforcement check; never applied to delivery experiments.',
    defaultLimit: { type: 'REQUESTCOUNTLIMIT', requestCount: { timeUnit: 'min', unitTime: 1, requestCount: 2 } },
    conditionalGroups: [],
  });
}
state.apis ??= {};
for (const [kind, name, context, quota] of [
  ['delivery', 'RehearsalDelivery', '/rehearsal/delivery', 'Unlimited'],
  ['probe', 'RehearsalGatewayProbe', '/rehearsal/gateway-probe', policyName],
]) {
  let api = state.apis[kind];
  if (!api) {
    const existing = await request(`${pub}/apis?query=${encodeURIComponent(`name:${name}`)}`);
    api = existing.list.find(a => a.name === name && a.version === '1.0.0');
    if (!api) {
      const form = new FormData();
      form.set('inlineAPIDefinition', readFileSync(fileURLToPath(new URL(`./${kind}.openapi.json`, import.meta.url)), 'utf8'));
      form.set('additionalProperties', JSON.stringify({
        name, context, version: '1.0.0', type: 'HTTP', transport: ['https'],
        policies: ['Unlimited'], apiThrottlingPolicy: quota,
        securityScheme: ['oauth2', 'oauth_basic_auth_api_key_mandatory'],
        visibility: 'PUBLIC', subscriptionAvailability: 'CURRENT_TENANT',
        enableSchemaValidation: false,
        endpointConfig: { endpoint_type: 'http', production_endpoints: { url: 'http://127.0.0.1:4313' } },
      }));
      api = await request(`${pub}/apis/import-openapi`, 'POST', form);
    }
    state.apis[kind] = { id: api.id }; save(); api = state.apis[kind];
  }
  if (!api.revision) {
    const revision = await request(`${pub}/apis/${api.id}/revisions`, 'POST', { description: 'Route the real Rehearsal sandbox through OAuth-protected HTTPS.' });
    api.revision = revision.id; save();
  }
  if (!api.deployed) {
    await request(`${pub}/apis/${api.id}/deploy-revision?revisionId=${api.revision}`, 'POST', [{ name: 'Default', vhost: 'localhost', displayOnDevportal: true }]);
    api.deployed = true; save();
  }
  const details = await request(`${pub}/apis/${api.id}`);
  if (details.lifeCycleStatus !== 'PUBLISHED') await request(`${pub}/apis/change-lifecycle?apiId=${api.id}&action=Publish`, 'POST');
  console.log(`${name}: published, revision deployed.`);
}
if (!state.applicationId) {
  const apps = await request(`${dev}/applications`);
  const app = apps.list.find(a => a.name === 'RehearsalRuntime') || await request(`${dev}/applications`, 'POST', {
    name: 'RehearsalRuntime', throttlingPolicy: 'Unlimited', tokenType: 'JWT',
    description: 'Client-credentials access for the private Rehearsal HTTP runner.',
  });
  state.applicationId = app.applicationId; save();
}
const subscriptions = await request(`${dev}/subscriptions?applicationId=${state.applicationId}`);
for (const api of Object.values(state.apis)) {
  if (!subscriptions.list.some(s => s.apiId === api.id)) await request(`${dev}/subscriptions`, 'POST', {
    applicationId: state.applicationId, apiId: api.id, throttlingPolicy: 'Unlimited',
  });
}
if (!state.keys) {
  state.keys = await request(`${dev}/applications/${state.applicationId}/generate-keys`, 'POST', {
    keyType: 'PRODUCTION', keyManager: 'Resident Key Manager',
    grantTypesToBeSupported: ['client_credentials'], scopes: ['default'], validityTime: '3600', additionalProperties: {},
  }); save();
}
if (!state.keys.consumerKey || !state.keys.consumerSecret) throw new Error('Runtime keys are incomplete.');
const values = {
  DELIVERY_URL: 'https://localhost:8243/rehearsal/delivery/1.0.0', GATEWAY_SERVICES: 'delivery',
  GATEWAY_TOKEN_URL: `${origin}/oauth2/token`, GATEWAY_CLIENT_ID: state.keys.consumerKey,
  GATEWAY_CLIENT_SECRET: state.keys.consumerSecret,
  NODE_EXTRA_CA_CERTS: '/usr/local/share/ca-certificates/rehearsal-apim.crt',
};
for (const value of Object.values(values)) if (/[\s"'\\]/.test(value)) throw new Error('Unsafe environment value.');
writeFileSync('/etc/rehearsal/gateway.env', Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
console.log('Runtime credentials saved privately. The backend has not been restarted.');
