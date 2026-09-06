import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import { scenarios } from './types.ts';
import type { Run } from './types.ts';

// Pure browser-compatible rendering: no report or credential is uploaded for export.
export async function createRunPdf(run: Run): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const ink = rgb(.13, .19, .17), green = rgb(.13, .43, .36);
  const muted = rgb(.35, .41, .38), pale = rgb(.93, .96, .93);
  const orange = rgb(.66, .28, .15), line = rgb(.84, .89, .85);
  const white = rgb(1, 1, 1);
  const scenario = scenarios.find(s => s.id === run.scenario);
  const title = scenario?.name || run.scenario;
  doc.setTitle(`Rehearsal | ${title} | ${run.strategy}`);
  doc.setAuthor('Tharinda.dev');
  doc.setSubject(`Observed sandbox report ${run.id}; not a production guarantee.`);
  doc.setLanguage('en');
  doc.setCreator('Rehearsal by Tharinda.dev');
  const clean = (s: string) => s.replace(/[→↔]/g, ' -> ').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\n]/g, ' ');
  function text(p: PDFPage, s: string, x: number, top: number, size = 10, font: PDFFont = regular, color = ink) {
    p.drawText(clean(s), { x, y: 842 - top - size, size, font, color });
  }
  function rect(p: PDFPage, x: number, top: number, width: number, height: number, color = pale) {
    p.drawRectangle({ x, y: 842 - top - height, width, height, color });
  }
  function wrap(s: string, width: number, size = 10, font: PDFFont = regular) {
    const lines: string[] = []; let current = '';
    for (const word of clean(s).split(/\s+/)) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (current) { lines.push(current); current = ''; }
        for (const ch of word) {
          if (font.widthOfTextAtSize(current + ch, size) > width) { lines.push(current); current = ''; }
          current += ch;
        }
      } else if (font.widthOfTextAtSize(current ? `${current} ${word}` : word, size) > width) {
        lines.push(current); current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    if (current) lines.push(current);
    return lines;
  }
  function paragraph(p: PDFPage, s: string, top: number, width = 499, size = 10, x = 48, color = muted) {
    const lines = wrap(s, width, size);
    lines.forEach((s, i) => text(p, s, x, top + i * (size + 5), size, regular, color));
    return lines.length * (size + 5);
  }
  function page(section: string) {
    const p = doc.addPage([595, 842]);
    rect(p, 0, 0, 595, 7, green);
    text(p, 'rehearsal.', 48, 32, 21, bold);
    text(p, 'ENGINEERING EVIDENCE / ' + section, 48, 71, 8, mono, green);
    p.drawLine({ start: { x: 48, y: 742 }, end: { x: 547, y: 742 }, thickness: .6, color: line });
    return p;
  }
  const passed = run.checks.filter(c => c.passed).length;
  let p = page('RUN SUMMARY');
  text(p, title, 48, 120, 25, bold);
  text(p, `${run.strategy === 'baseline' ? 'Baseline' : 'Recovery'} strategy  /  ${run.outcome.toUpperCase()}`, 48, 160, 11, bold, run.outcome === 'passed' ? green : orange);
  paragraph(p, scenario?.fault || 'Observed HTTP sandbox experiment.', 190);
  rect(p, 48, 242, 499, 95, green);
  text(p, `${passed}/${run.checks.length}`, 66, 259, 30, bold, white);
  text(p, 'business checks passed', 66, 304, 9, regular, white);
  text(p, `${run.duration} ms`, 260, 267, 20, bold, white);
  text(p, 'observed execution', 260, 304, 9, regular, white);
  text(p, String(run.events.length), 432, 267, 20, bold, white);
  text(p, 'events', 432, 304, 9, regular, white);
  text(p, `RUN ${run.id}`, 48, 358, 8, mono);
  text(p, `Started: ${run.startedAt}`, 48, 378, 9, regular, muted);
  text(p, `Transport: ${run.transport}`, 48, 398, 9, regular, muted);
  text(p, 'What the business checks found', 48, 441, 17, bold);
  let y = 477;
  for (const check of run.checks) {
    const expected = wrap(`Expected: ${check.expected}  |  Observed: ${check.actual}`, 417, 9);
    const height = 33 + expected.length * 13;
    if (y + height > 748) { p = page('BUSINESS CHECKS / CONTINUED'); y = 124; }
    text(p, check.passed ? 'PASS' : 'FAIL', 48, y, 9, bold, check.passed ? green : orange);
    text(p, check.name, 99, y, 10, bold);
    expected.forEach((s, i) => text(p, s, 99, y + 19 + i * 13, 9, regular, muted));
    y += height;
  }
  p = page('VISUAL EVIDENCE');
  text(p, 'Count the effects, not just the replies.', 48, 121, 22, bold);
  paragraph(p, 'Committed operations in this run. The target is one of each. Bars show counts, not success rates.', 158);
  const ledger = [['Stock reservations', run.ledger.reservations], ['Payment authorizations', run.ledger.authorizations], ['Delivery bookings', run.ledger.deliveries]] as const;
  const scale = Math.max(2, ...ledger.map(([, count]) => count));
  ledger.forEach(([label, count], i) => {
    const top = 218 + i * 57;
    text(p, label, 48, top, 10, bold);
    rect(p, 224, top, 270, 18);
    if (count > 0) rect(p, 224, top, 270 * count / scale, 18, count === 1 ? green : orange);
    text(p, String(count), 510, top, 12, bold);
  });
  text(p, 'Observed event timeline', 48, 415, 17, bold);
  text(p, 'Elapsed milliseconds since the run started; not animation timing.', 48, 445, 9, regular, muted);
  const shown = run.events.slice(0, 12);
  const max = Math.max(1, run.duration, ...shown.map(e => e.elapsed));
  shown.forEach((event, i) => {
    const top = 480 + i * 18;
    text(p, `${String(event.id).padStart(2, '0')} ${event.service}`, 48, top, 8, mono, muted);
    rect(p, 185, top + 3, 270, 5);
    if (event.elapsed > 0) rect(p, 185, top + 3, 270 * event.elapsed / max, 5, event.status === 'error' ? orange : green);
    text(p, `+${event.elapsed} ms`, 470, top, 8, mono);
  });
  paragraph(p, run.events.length > 12 ? 'First 12 events shown. Every event appears in the complete trace on the following pages.' : 'Every event is described in the complete trace on the following pages.', 716, 499, 9);
  p = page('COMPLETE TRACE'); y = 122;
  for (const event of run.events) {
    const details = wrap(event.detail, 470, 10);
    const height = 62 + details.length * 15;
    if (y + height > 746) { p = page('COMPLETE TRACE / CONTINUED'); y = 122; }
    text(p, `${String(event.id).padStart(2, '0')}  +${event.elapsed}ms  ${event.service.toUpperCase()}  ${event.status.toUpperCase()}${event.code ? `  HTTP ${event.code}` : ''}`, 48, y, 8, mono, event.status === 'error' ? orange : green);
    text(p, event.action, 48, y + 18, 12, bold);
    details.forEach((s, i) => text(p, s, 48, y + 39 + i * 15, 10, regular, muted));
    text(p, event.at, 48, y + height - 14, 7, mono, muted);
    y += height + 13;
  }
  if (y + 103 > 746) { p = page('READING THE EVIDENCE'); y = 126; }
  text(p, 'Read this report with its limits.', 48, y, 12, bold);
  paragraph(p, 'Isolated sandbox only: no real money or deliveries. Provider ledgers are memory-only. This report records one run, not a production benchmark or an exactly-once guarantee. Gateway-configured records routing settings; separate policy tests establish enforcement. Original JSON is embedded as an attachment and is also available from the studio.', y + 25, 499, 9);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: 48, y: 56 }, end: { x: 547, y: 56 }, thickness: .6, color: line });
    text(p, 'Developed by Tharinda.dev', 48, 799, 8, bold, green);
    text(p, `${i + 1} / ${pages.length}   |   ${run.id.slice(0, 8)}`, 423, 799, 8, mono, muted);
  });
  await doc.attach(new TextEncoder().encode(JSON.stringify(run, null, 2)), `rehearsal-${run.id}.json`, { mimeType: 'application/json', description: 'Original observed run evidence' });
  return doc.save();
}
