import { readFile, writeFile, mkdir, rename, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { resolveSource, validatePdfHeader } from './source-utils.mjs';

const old = JSON.parse(await readFile('public/book.json', 'utf8'));
let spec;
try { spec = JSON.parse(await readFile('book.sources.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!spec) {
  if (!process.env.BOOK_SOURCE) throw new Error('Set BOOK_SOURCE or create book.sources.json with the cover, preface and chapters.');
  spec = { title: old.title, author: old.author, sources: [{ title: 'Start reading', source: process.env.BOOK_SOURCE }] };
}
if (!spec.title || !spec.author || !spec.sources?.length) throw new Error('Set the book title, author and at least one source.');
const merged = await PDFDocument.create();
const chapters = [];
const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
const useCache = process.argv.includes('--cached');
for (const item of spec.sources) {
  const typeset = spec.format === 'book' && item.kind === 'google-doc';
  const cachePath = typeset ? item.docxCachePath : item.cachePath;
  if (useCache && !cachePath) throw new Error(`No cached source configured for ${item.title}.`);
  const source = resolveSource(useCache ? cachePath : item.source, item.kind, Boolean(token), typeset ? 'docx' : 'pdf');
  let bytes;
  if (source.path) bytes = await readFile(source.path);
  else {
    const response = await fetch(source.url, { headers: source.google && token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Could not fetch ${item.title}: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (bytes.length > 100 * 1024 * 1024) throw new Error(`${item.title} exceeds the 100 MB source limit.`);
  if (typeset) {
    if (Buffer.from(bytes).subarray(0, 2).toString() !== 'PK') throw new Error(`${item.title} did not return a DOCX. Check Drive authorization.`);
    const temporary = await mkdtemp(join(tmpdir(), 'book-typeset-'));
    try {
      const input = join(temporary, 'source.docx'); const output = join(temporary, 'chapter.pdf');
      await writeFile(input, bytes);
      execFileSync(process.env.BOOK_PYTHON || 'python3', [fileURLToPath(new URL('./typeset-book.py', import.meta.url)), '--source', input, '--output', output, '--title', spec.title, '--author', spec.author, '--offset', String(merged.getPageCount())], { stdio: ['ignore', 'pipe', 'pipe'] });
      bytes = await readFile(output);
    } catch (error) {
      throw new Error(`Typesetting failed for ${item.title}. Check BOOK_PYTHON and scripts/requirements.txt. ${error.stderr?.toString() || error.message}`);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  validatePdfHeader(bytes);
  const input = await PDFDocument.load(bytes);
  if (!input.getPageCount()) throw new Error(`${item.title} contains no pages.`);
  chapters.push({ title: item.title, page: merged.getPageCount() + 1 });
  for (const page of await merged.copyPages(input, input.getPageIndices())) merged.addPage(page);
}
merged.setTitle(spec.title); merged.setAuthor(spec.author);
// Stable metadata keeps identical source exports from producing a new edition on each run.
merged.setCreationDate(new Date(0)); merged.setModificationDate(new Date(0));
const bytes = await merged.save();
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const name = `preview-${hash}.pdf`;
const next = { title: spec.title, author: spec.author, subtitle: spec.subtitle || '', format: spec.format || 'source', demo: false, version: hash, pdfUrl: `/book/${name}`, pageCount: merged.getPageCount(), chapters: spec.chapters || chapters };
for (const chapter of next.chapters) {
  if (!Number.isInteger(chapter.page) || chapter.page < 1 || chapter.page > next.pageCount) throw new Error(`Invalid page for ${chapter.title}.`);
}
await mkdir('public/book', { recursive: true });
await writeFile(`public/book/${name}`, bytes);
await writeFile('public/book/preview.pdf', bytes);
await writeFile('public/book.json.tmp', JSON.stringify(next, null, 2) + '\n');
await rename('public/book.json.tmp', 'public/book.json');
console.log(`Synced ${next.pageCount} pages from ${spec.sources.length} sources. Version: ${hash}`);
