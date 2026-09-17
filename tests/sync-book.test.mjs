import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';

test('Merges sources in order, computes contents, and preserves the manifest on failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'book-sync-test-'));
  try {
    await mkdir(join(dir, 'public/book'), { recursive: true });
    await writeFile(join(dir, 'public/book.json'), JSON.stringify({ demo: true }));
    for (const [name, count] of [['cover', 1], ['preface', 2], ['chapter-one', 3]]) {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < count; i++) pdf.addPage([400 + i, 600]);
      await writeFile(join(dir, `${name}.pdf`), await pdf.save());
    }
    const spec = { title: 'Test edition', author: 'Test author', sources: ['cover', 'preface', 'chapter-one'].map(name => ({ title: name, source: `${name}.pdf` })) };
    await writeFile(join(dir, 'book.sources.json'), JSON.stringify(spec));
    execFileSync(process.execPath, [resolve('scripts/sync-book.mjs')], { cwd: dir });
    const manifest = await readFile(join(dir, 'public/book.json'), 'utf8');
    const result = JSON.parse(manifest);
    assert.equal(result.demo, false);
    assert.equal(result.pageCount, 6);
    assert.deepEqual(result.chapters.map(x => x.page), [1, 2, 4]);
    const saved = await readFile(join(dir, 'public', result.pdfUrl));
    assert.equal((await PDFDocument.load(saved)).getPageCount(), 6);
    assert.deepEqual(await readFile(join(dir, 'public/book/preview.pdf')), saved);
    execFileSync(process.execPath, [resolve('scripts/sync-book.mjs')], { cwd: dir });
    assert.equal(await readFile(join(dir, 'public/book.json'), 'utf8'), manifest, 'Unchanged sources keep the same edition');
    await writeFile(join(dir, 'chapter-one.pdf'), '<html>Sign in</html>');
    assert.throws(() => execFileSync(process.execPath, [resolve('scripts/sync-book.mjs')], { cwd: dir, stdio: 'pipe' }));
    assert.equal(await readFile(join(dir, 'public/book.json'), 'utf8'), manifest);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
