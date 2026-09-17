import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSource, validatePdfHeader } from '../scripts/source-utils.mjs';
test('Drive PDF links become download URLs', () => {
  assert.equal(resolveSource('https://drive.google.com/file/d/abc-123/view').url, 'https://drive.google.com/uc?export=download&id=abc-123');
});
test('Private documents use Drive export API', () => {
  assert.equal(resolveSource('https://docs.google.com/document/d/abc/edit', 'google-doc', true).url, 'https://www.googleapis.com/drive/v3/files/abc/export?mimeType=application%2Fpdf');
});
test('Book typesetting requests DOCX from public and private Google Docs', () => {
  const source = 'https://docs.google.com/document/d/abc/edit';
  assert.equal(resolveSource(source, 'google-doc', false, 'docx').url, 'https://docs.google.com/document/d/abc/export?format=docx');
  const authenticated = new URL(resolveSource(source, 'google-doc', true, 'docx').url);
  assert.equal(authenticated.searchParams.get('mimeType'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
test('Credentials are not sent to arbitrary PDF hosts', () => {
  assert.equal(resolveSource('https://example.com/book.pdf', 'pdf', true).google, false);
});
test('Reject login pages in place of PDFs', () => {
  assert.throws(() => validatePdfHeader(Buffer.from('<html>Sign in</html>')), /did not return a PDF/);
  assert.doesNotThrow(() => validatePdfHeader(Buffer.from('%PDF-1.7')));
});
test('Reject non-TLS remote sources and invalid Drive links', () => {
  assert.throws(() => resolveSource('http://example.com/book.pdf'), /HTTPS/);
  assert.throws(() => resolveSource('https://drive.google.com/drive/home'), /file ID/);
});
