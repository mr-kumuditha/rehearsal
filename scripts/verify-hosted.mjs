import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
const origin='https://rehearsal-kumuditha.vercel.app';
// This private cookie is a workspace capability. Never include it in published evidence.
mkdirSync(new URL('../work/',import.meta.url),{recursive:true});
const statePath=new URL('../work/hosted-acceptance.json',import.meta.url);
if(process.argv.includes('--after-restart')) {
  const state=JSON.parse(readFileSync(statePath,'utf8'));
  const response=await fetch(origin+'/api/runs',{headers:{Cookie:state.cookie}});
  assert.equal(response.status,200);
  const reports=await response.json();
  assert.deepEqual(reports.map(r=>r.id).sort(),state.ids.sort());
  console.log(JSON.stringify({restartPersistence:'passed',reports:reports.length}));
} else {
  const initial=await fetch(origin+'/api/runs');
  assert.equal(initial.status,200);
  const cookie=initial.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  assert.deepEqual(await initial.json(),[]);
  const results=[];
  for(const scenario of ['lost-response','duplicate-event','rate-limit','invalid-response']) {
    for(const strategy of ['baseline','recovery']) {
      const response=await fetch(origin+'/api/runs',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({scenario,strategy})});
      assert.equal(response.status,200);
      const messages=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
      const run=messages.at(-1).run;
      assert.ok(run);
      assert.equal(run.outcome,strategy==='recovery'?'passed':'failed');
      assert.equal(run.transport,'gateway-configured');
      assert.ok(messages.some(m=>m.type==='event'));
      results.push({id:run.id,scenario,strategy,outcome:run.outcome});
      console.log(JSON.stringify({scenario,strategy,outcome:run.outcome,events:messages.length-1}));
    }
  }
  const history=await (await fetch(origin+'/api/runs',{headers:{Cookie:cookie}})).json();
  assert.equal(history.length,8);
  const other=await (await fetch(origin+'/api/runs')).json();
  assert.deepEqual(other,[]);
  writeFileSync(statePath,JSON.stringify({cookie,ids:results.map(r=>r.id)}),{mode:0o600});
  console.log(JSON.stringify({savedReports:history.length,visitorIsolation:'passed'}));
}
