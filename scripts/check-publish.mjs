import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
const config = JSON.parse(await readFile('public/book.json', 'utf8'));
if (config.demo) throw new Error('Publishing is blocked while the sample manuscript is active. Sync the real book first.');
if (!config.author || !config.title) throw new Error('A title and author are required.');
if (!/^\/book\/preview-[a-f0-9]+\.pdf$/.test(config.pdfUrl)) throw new Error('Publish a versioned, local PDF.');
const pdf = await PDFDocument.load(await readFile(`public${config.pdfUrl}`));
if (pdf.getPageCount() !== config.pageCount) throw new Error('The PDF and reader manifest disagree.');
console.log(`Ready to publish ${config.title}: ${config.pageCount} pages.`);
