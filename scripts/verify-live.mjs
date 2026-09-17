import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL(process.argv[2]);
if (base.protocol !== 'https:') throw new Error('Live verification requires HTTPS.');
const expected = JSON.parse(await readFile('public/book.json', 'utf8'));
const get = async (path) => {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  assert.equal(response.status, 200, `${path} must return HTTP 200`);
  return response;
};
const html = await (await get('/')).text();
assert.match(html, /id="reader"/, 'The reader HTML must be served');
const live = await (await get(`/book.json?verify=${Date.now()}`)).json();
assert.equal(live.pdfUrl, expected.pdfUrl, 'The deployed edition must match the build');
assert.equal(live.pageCount, expected.pageCount);
const actualPdf = Buffer.from(await (await get(expected.pdfUrl)).arrayBuffer());
const expectedPdf = await readFile(`public${expected.pdfUrl}`);
assert.ok(actualPdf.equals(expectedPdf), 'The live PDF must match the committed edition');
console.log(`Verified ${base.origin}: reader and ${live.pageCount}-page PDF.`);
