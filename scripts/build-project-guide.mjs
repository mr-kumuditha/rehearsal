import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { projectGuide } from './project-guide-template.mjs';
import { createRunPdf } from '../src/lib/report-pdf.ts';

const root = new URL('../', import.meta.url);
const path = relative => new URL(relative, root);
mkdirSync(path('docs/evidence/'), { recursive: true });
mkdirSync(path('public/docs/'), { recursive: true });
mkdirSync(path('work/pdf-review/'), { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
try {
  if (process.argv.includes('--capture')) {
    const origin = 'https://rehearsal-kumuditha.vercel.app';
    const initial = await fetch(origin + '/api/runs');
    assert.equal(initial.status, 200);
    const cookie = initial.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'A fresh workspace is required');
    const runs = [];
    for (const scenario of ['lost-response','duplicate-event','rate-limit','invalid-response']) {
      for (const strategy of ['baseline','recovery']) {
        const response = await fetch(origin + '/api/runs', { method:'POST', headers:{ Cookie:cookie, Origin:origin, 'Content-Type':'application/json' }, body:JSON.stringify({scenario,strategy}), signal:AbortSignal.timeout(30000) });
        assert.equal(response.status, 200);
        const messages = (await response.text()).trim().split('\n').map(line=>JSON.parse(line));
        const run = messages.at(-1).run;
        assert.ok(run);
        assert.equal(run.outcome, strategy === 'recovery' ? 'passed' : 'failed');
        assert.equal(run.transport, 'gateway-configured');
        runs.push(run);
      }
    }
    const evidence = { capturedAt:new Date().toISOString(), origin, sourceCommit:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(), runs };
    // Deliberately exclude the cookie and any request credentials.
    writeFileSync(path('docs/evidence/project-guide-runs.json'), JSON.stringify(evidence,null,2)+'\n');
    console.log('Captured eight real hosted baseline/recovery runs. No credentials saved.');
  }
  if (process.argv.includes('--capture') || process.argv.includes('--capture-ui')) {
    const ui = await browser.newPage({ viewport:{width:1440,height:1000}, reducedMotion:'reduce' });
    await ui.goto(process.env.GUIDE_UI_ORIGIN || 'http://127.0.0.1:3040', {waitUntil:'domcontentloaded'});
    await ui.getByRole('button',{name:'Run rehearsal'}).waitFor();
    await ui.getByRole('button',{name:'Run rehearsal'}).click();
    await ui.getByText('3/4 CHECKS PASSED').waitFor();
    await ui.getByRole('button',{name:'Run with recovery',exact:true}).click();
    await ui.getByText('4/4 CHECKS PASSED').waitFor();
    await ui.evaluate(()=>document.fonts.ready);
    await ui.screenshot({path:path('docs/evidence/guide-studio.png').pathname});
    await ui.getByRole('button',{name:'Compare strategies',exact:true}).click();
    await ui.getByRole('heading',{name:'Baseline behavior'}).waitFor();
    await ui.locator('.compare-grid').screenshot({path:path('docs/evidence/guide-compare.png').pathname});
    await ui.close();
    console.log('Captured the refreshed local studio and comparison interface.');
  }
  const evidence = JSON.parse(readFileSync(path('docs/evidence/project-guide-runs.json'),'utf8'));
  const data = file => 'data:image/png;base64,'+readFileSync(path(file)).toString('base64');
  let html = projectGuide({...evidence,screenshots:{studio:data('docs/evidence/guide-studio.png'),compare:data('docs/evidence/guide-compare.png')}});
  const font = readFileSync(path('public/fonts/dm-sans.woff2')).toString('base64');
  html = html.replace('<style>', `<style>@font-face{font-family:'Guide Sans';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 1000}`);
  writeFileSync(path('work/pdf-review/project-guide.html'),html);
  const page = await browser.newPage();
  await page.setContent(html,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  const overflow = await page.locator('.page').evaluateAll(pages=>pages.map((p,i)=>{
    const footer=p.querySelector('footer').getBoundingClientRect();
    const body=[...p.children].filter(c=>!['HEADER','FOOTER'].includes(c.tagName));
    const bottom=Math.max(...body.map(c=>c.getBoundingClientRect().bottom));
    return {page:i+1,overlap:Math.ceil(bottom-footer.top),overflow:p.scrollHeight-p.clientHeight};
  }).filter(x=>x.overlap>0||x.overflow>0));
  assert.deepEqual(overflow,[], 'Document content must not overlap the footer or spill off a page');
  const bytes = await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(),14);
  pdf.setTitle('Rehearsal — Visual Project Guide');
  pdf.setAuthor('Tharinda.dev');
  pdf.setSubject('Project architecture, recovery experiments, real observations and honest limits');
  pdf.setLanguage('en');
  writeFileSync(path('public/docs/rehearsal-project-guide.pdf'),await pdf.save());
  writeFileSync(path('work/pdf-review/sample-run.pdf'),await createRunPdf(evidence.runs.find(r=>r.strategy==='recovery')));
  console.log('Created 14-page project guide and an actual-run PDF sample. No layout overflow detected.');
} finally { await browser.close(); }
