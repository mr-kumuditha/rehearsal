import type { Service } from './types.ts';

type Provider = Exclude<Service, 'workflow'>;
type CachedToken = { value: string; expiresAt: number };
let cache: CachedToken | undefined;
let pending: Promise<string> | undefined;
let configuration = '';

export function gatewayServices(): Provider[] {
  if (!process.env.GATEWAY_TOKEN && !process.env.GATEWAY_TOKEN_URL) return [];
  const names = (process.env.GATEWAY_SERVICES || 'delivery').split(',').map(s => s.trim());
  if (names.some(s => !['inventory', 'payment', 'delivery'].includes(s))) {
    throw new Error('GATEWAY_SERVICES must name valid sandbox providers.');
  }
  return [...new Set(names)] as Provider[];
}

export function gatewayTransport() {
  return gatewayServices().length ? 'gateway-configured' as const : 'direct-http' as const;
}

export async function gatewayHeaders(service: string): Promise<Record<string, string>> {
  if (!gatewayServices().includes(service as Provider)) return {};
  if (process.env.GATEWAY_TOKEN) return { Authorization: `Bearer ${process.env.GATEWAY_TOKEN}` };
  const url = process.env.GATEWAY_TOKEN_URL;
  const clientId = process.env.GATEWAY_CLIENT_ID;
  const secret = process.env.GATEWAY_CLIENT_SECRET;
  if (!url || !clientId || !secret) throw new Error('Gateway OAuth credentials are incomplete.');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('The gateway token endpoint must use HTTPS without URL credentials.');
  }
  const identity = JSON.stringify([url, clientId, secret]);
  if (configuration !== identity) {
    configuration = identity;
    cache = undefined;
    pending = undefined;
  }
  if (cache && Date.now() < cache.expiresAt) return { Authorization: `Bearer ${cache.value}` };
  if (!pending) {
    const request = (async () => {
      const response = await fetch(target, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`Gateway token request failed (${response.status}).`);
      const body = await response.json();
      if (typeof body.access_token !== 'string' || !body.access_token ||
          !Number.isFinite(Number(body.expires_in)) || Number(body.expires_in) <= 0) {
        throw new Error('Gateway returned an invalid token response.');
      }
      if (configuration === identity) {
        // Refresh early, but do not cache short-lived credentials past their lifetime.
        cache = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in) * 900 };
      }
      return body.access_token as string;
    })();
    pending = request;
    void request.finally(() => { if (pending === request) pending = undefined; }).catch(() => {});
  }
  return { Authorization: `Bearer ${await pending}` };
}
