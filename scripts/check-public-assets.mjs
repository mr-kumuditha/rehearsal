import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Fail the deployed build if an upload/ignore rule silently drops the guide.
const guide = readFileSync(new URL('../public/docs/rehearsal-project-guide.pdf', import.meta.url));
assert.equal(guide.subarray(0, 5).toString(), '%PDF-', 'The downloadable project guide must be a real PDF.');
assert.ok(guide.length > 1000, 'The project guide is unexpectedly empty.');
console.log('Public project PDF is present in the build input.');
