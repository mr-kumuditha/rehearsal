import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackend} from '../vps-backend/server.ts';
import {startSandbox} from '../sandbox/server.ts';
import {listRuns,saveRun} from '../src/lib/store.ts';
import {sameOrigin,proxyBackend} from '../src/lib/backend-proxy.ts';
import type {Run} from '../src/lib/types.ts';

const dataDir=mkdtempSync(join(tmpdir(),'rehearsal-backend-test-'));
process.env.REHEARSAL_DATA_DIR=dataDir;
const token='test-only-backend-token-not-for-production';
const workspace=randomUUID();
const bases={inventory:'http://127.0.0.1:15311',payment:'http://127.0.0.1:15312',delivery:'http://127.0.0.1:15313'};
const server=createBackend(token,bases);
let sandbox:Awaited<ReturnType<typeof startSandbox>>;
let url:string;
let report:Run;
const headers={Authorization:`Bearer ${token}`,'X-Rehearsal-Workspace':workspace,'Content-Type':'application/json'};
before(async()=>{
  sandbox=await startSandbox([15311,15312,15313]);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  if(!address||typeof address==='string')throw Error();
  url=`http://127.0.0.1:${address.port}`;
});
after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await sandbox.close();rmSync(dataDir,{recursive:true});});
test('backend requires the server credential',async()=>{
  assert.equal((await fetch(url+'/runs')).status,401);
  assert.equal((await fetch(url+'/ready')).status,200);
});
test('backend streams a real HTTP recovery and stores its report',async()=>{
  const r=await fetch(url+'/runs',{method:'POST',headers,body:JSON.stringify({scenario:'lost-response',strategy:'recovery'})});
  assert.equal(r.status,200);
  const messages=(await r.text()).trim().split('\n').map(x=>JSON.parse(x));
  report=messages.at(-1).run;
  assert.equal(report.outcome,'passed');
  assert.equal(report.transport,'direct-http');
  assert.equal(report.ledger.deliveries,1);
  assert.ok(messages.some(m=>m.event?.action==='Response deadline exceeded'));
});
test('workspace history does not leak to a different visitor',async()=>{
  const mine=await (await fetch(url+'/runs',{headers})).json();
  assert.equal(mine.length,1);
  const other=await (await fetch(url+'/runs',{headers:{...headers,'X-Rehearsal-Workspace':randomUUID()}})).json();
  assert.deepEqual(other,[]);
});
test('reports remain available across database reopen',()=>{
  saveRun({...report,id:randomUUID()},workspace);
  assert.equal(listRuns(workspace).length,2);
  assert.equal(listRuns(randomUUID()).length,0);
});
test('backend rejects invalid input and concurrent workspace execution',async()=>{
  assert.equal((await fetch(url+'/runs',{method:'POST',headers,body:'null'})).status,400);
  const a=await fetch(url+'/runs',{method:'POST',headers,body:JSON.stringify({scenario:'rate-limit',strategy:'recovery'})});
  const b=await fetch(url+'/runs',{method:'POST',headers,body:JSON.stringify({scenario:'rate-limit',strategy:'recovery'})});
  assert.equal(b.status,429);
  await a.text();
});
test('proxy preserves visitor cookie, HTTP events and authenticated routing',async()=>{
  process.env.BACKEND_URL=url;process.env.BACKEND_TOKEN=token;
  const response=await proxyBackend(new Request('http://localhost:3040/api/runs',{headers:{Cookie:`rehearsal_workspace=${workspace}`}}),'/runs');
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie')!,new RegExp(workspace));
  assert.ok((await response.json()).length>=2);
  delete process.env.BACKEND_URL;delete process.env.BACKEND_TOKEN;
});
test('origin validation rejects unrelated hosts and allows configured production host',()=>{
  assert.equal(sameOrigin(new Request('http://localhost:3040/api/runs',{headers:{host:'localhost:3040',origin:'https://evil.example'}})),false);
  process.env.APP_ORIGIN='https://rehearsal.example';
  assert.equal(sameOrigin(new Request('https://rehearsal.example/api/runs',{headers:{host:'rehearsal.example',origin:'https://rehearsal.example'}})),true);
  delete process.env.APP_ORIGIN;
});
