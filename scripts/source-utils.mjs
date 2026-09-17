export function resolveSource(source, kind = 'pdf', hasToken = false, exportFormat = 'pdf') {
  if (!/^https?:\/\//i.test(source)) return { path: source };
  const url = new URL(source);
  if (url.protocol !== 'https:') throw new Error('Sources must use HTTPS.');
  const google = ['drive.google.com', 'docs.google.com'].includes(url.hostname);
  if (!google) return { url: url.href, google: false };
  const id = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Could not read the Google Drive file ID.');
  const doc = kind === 'google-doc' || url.hostname === 'docs.google.com';
  const mime = exportFormat === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
  if (hasToken) return { url: doc ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(mime)}` : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`, google: true };
  return { url: doc ? `https://docs.google.com/document/d/${id}/export?format=${exportFormat}` : `https://drive.google.com/uc?export=download&id=${id}`, google: true };
}
export function validatePdfHeader(bytes) {
  if (!Buffer.from(bytes).subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    throw new Error('Source did not return a PDF. Check sharing permissions or use a Drive read token.');
  }
}
