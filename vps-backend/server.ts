import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { endpoints, runRehearsal } from '../src/lib/engine.ts';
import { listRuns, saveRun } from '../src/lib/store.ts';
import { scenarios } from '../src/lib/types.ts';
import { startSandbox } from '../sandbox/server.ts';
import { gatewayHeaders, gatewayServices, gatewayTransport } from '../src/lib/gateway.ts';

// This service is reached only by the web app's server-side proxy.
// The three providers stay on loopback and retain real HTTP behavior.
export function createBackend(token: string, bases = endpoints()) {
  if (token.length < 32) throw new Error('BACKEND_TOKEN must contain at least 32 characters.');
  const digest=(value:string)=>createHash('sha256').update(value).digest();
  const expected=digest(`Bearer ${token}`);
  const active=new Set<string>();
  return createServer(async (req,res)=>{
    const reply=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    const path=new URL(req.url || '/', 'http://backend').pathname;
    if (path === '/ready' && req.method === 'GET') return reply(200,{status:'ready'});
    if (!timingSafeEqual(expected,digest(req.headers.authorization || ''))) return reply(401,{error:'Unauthorized'});
    if (path === '/health' && req.method === 'GET') {
      const services=await Promise.all(Object.entries(bases).map(async ([name,url])=>{
        try {const response=await fetch(`${url}/health`,{headers:await gatewayHeaders(name),signal:AbortSignal.timeout(3000)});return {name,online:response.ok,address:gatewayServices().some(service => service === name) ? `Gateway → ${name} sandbox` : `Hosted ${name} sandbox`};}
        catch {return {name,online:false,address:`Hosted ${name} sandbox`};}
      }));
      return reply(200,{services,transport:gatewayTransport(),gatewayServices:gatewayServices(),location:'hosted',ballerina:false});
    }
    const workspace=req.headers['x-rehearsal-workspace'];
    if (typeof workspace !== 'string' || !/^[a-f0-9-]{36}$/.test(workspace)) return reply(400,{error:'Valid workspace required'});
    if (path !== '/runs') return reply(404,{error:'Not found'});
    if (req.method === 'GET') {
      try {return reply(200,listRuns(workspace));} catch {return reply(503,{error:'Report storage is unavailable'});}
    }
    if (req.method !== 'POST') return reply(405,{error:'Method not allowed'});
    if (active.size >= 4 || active.has(workspace)) return reply(429,{error:'A rehearsal is already running. Try again shortly.'});
    let input;
    try {
      let raw='';
      for await (const chunk of req) {raw+=chunk;if(raw.length>1024) return reply(413,{error:'Request too large'});}
      input=JSON.parse(raw);
    } catch {return reply(400,{error:'Invalid JSON'});}
    if (!input || !scenarios.some(s=>s.id===input.scenario) || !['baseline','recovery'].includes(input.strategy)) return reply(400,{error:'Choose a valid scenario and strategy'});
    // Recheck after body parsing, because another request may have started.
    if (active.size >= 4 || active.has(workspace)) return reply(429,{error:'A rehearsal is already running. Try again shortly.'});
    active.add(workspace);
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const send=(message:unknown)=>{if(!res.destroyed)res.write(JSON.stringify(message)+'\n');};
    try {
      const run=await runRehearsal(input.scenario,input.strategy,event=>send({type:'event',event}),bases);
      saveRun(run,workspace);
      send({type:'result',run});
    } catch {send({type:'error',message:'The rehearsal could not finish. No completed report was saved.'});}
    finally {active.delete(workspace);res.end();}
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server=createBackend(process.env.BACKEND_TOKEN || '');
  await startSandbox();
  server.listen(Number(process.env.PORT || 4320),process.env.HOST || '127.0.0.1',()=>console.log('Rehearsal backend ready; providers are loopback-only.'));
}
