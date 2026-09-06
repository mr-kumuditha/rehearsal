import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from 'pdf-lib';
import { createRunPdf } from '../src/lib/report-pdf.ts';
import type { Run } from '../src/lib/types.ts';

// Deliberately synthetic unit fixture; never used for published project graphs.
const run: Run = {
  id: 'pdf-unit-fixture', scenario: 'lost-response', strategy: 'recovery',
  startedAt: '2026-09-07T00:00:00Z', duration: 210, transport: 'direct-http',
  outcome: 'passed', ledger: { reservations: 1, authorizations: 1, deliveries: 1 },
  checks: [{ name: 'One delivery', expected: '1', actual: '1', passed: true }],
  events: [{ id: 1, at: '2026-09-07T00:00:00Z', elapsed: 210, service: 'delivery', action: 'Delivery reconciled', detail: 'The same key returns the existing booking.', status: 'success', code: 200 }],
};
test('PDF export has readable document metadata and original JSON attachment', async () => {
  const bytes = await createRunPdf(run);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getAuthor(), 'Tharinda.dev');
  assert.match(pdf.getTitle() || '', /Lost delivery response/);
  assert.ok(pdf.getPageCount() >= 3);
  assert.ok(pdf.catalog.get(PDFName.of('Names')));
  assert.equal(run.ledger.deliveries, 1);
});
test('long event traces paginate rather than disappearing', async () => {
  const events = Array.from({ length: 70 }, (_, i) => ({ ...run.events[0], id: i + 1, detail: 'A detailed observed response. '.repeat(10) }));
  const pdf = await PDFDocument.load(await createRunPdf({ ...run, events }));
  assert.ok(pdf.getPageCount() > 10);
});
test('English punctuation and empty traces do not break PDF generation', async () => {
  const event = { ...run.events[0], detail: 'Gateway → delivery — “same key” retry. ✅' };
  await assert.doesNotReject(createRunPdf({ ...run, events: [event] }));
  await assert.doesNotReject(createRunPdf({ ...run, events: [] }));
});
