import { randomUUID } from 'node:crypto';

export const hosted = () => Boolean(process.env.BACKEND_URL || process.env.VERCEL);

export async function proxyBackend(request: Request, path: '/health' | '/runs') {
  const base = process.env.BACKEND_URL;
  const token = process.env.BACKEND_TOKEN;
  if (!base || !token) return Response.json({error:'The hosted HTTP backend is not connected yet.'},{status:503});
  let url: URL;
  try {
    url = new URL(base);
    if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw Error();
    if (url.username || url.password) throw Error();
  } catch { return Response.json({error:'Backend configuration is invalid.'},{status:503}); }
  const cookie = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('rehearsal_workspace='))?.slice(20);
  const workspace = cookie && /^[a-f0-9-]{36}$/.test(cookie) ? cookie : randomUUID();
  try {
    const upstream = await fetch(new URL(path, url), {
      method:request.method,
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`, 'X-Rehearsal-Workspace':workspace},
      ...(request.method === 'POST' ? {body:await request.text()} : {}),
      cache:'no-store', signal:AbortSignal.timeout(path === '/health' ? 5000 : 25000),
    });
    const headers = new Headers({'Content-Type':upstream.headers.get('Content-Type') || 'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    headers.set('Set-Cookie',`rehearsal_workspace=${workspace}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === 'https:' || process.env.VERCEL ? '; Secure' : ''}`);
    return new Response(upstream.body,{status:upstream.status,headers});
  } catch { return Response.json({error:'The hosted HTTP backend is unavailable. Please try again shortly.'},{status:503}); }
}

export function sameOrigin(request: Request) {
  const origin=request.headers.get('origin');
  if (!origin) return true;
  try {
    const source=new URL(origin);
    const hosts=['localhost','127.0.0.1','[::1]',process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL];
    if (process.env.APP_ORIGIN) hosts.push(new URL(process.env.APP_ORIGIN).hostname);
    return ['http:','https:'].includes(source.protocol) && hosts.includes(source.hostname) && source.host === request.headers.get('host');
  } catch { return false; }
}
