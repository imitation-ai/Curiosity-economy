import './style.css';
import { PageFlip } from 'page-flip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { initAnalytics, track } from './analytics';

GlobalWorkerOptions.workerSrc = workerUrl;
const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let pdf, book, config, current = 0, reading = false, textMode = false, renderSequence = 0;
let pages = [], drawing = Promise.resolve(), readingTask, lastTracked = -1;
let selectedPage = null;
const painted = new Map();

function announceError(message) {
  $('status').hidden = false;
  $('status').textContent = message;
}

function updatePosition(index) {
  selectedPage = null;
  current = Math.min(Math.max(index, 0), pdf.numPages - 1);
  const spread = !reading && book?.getOrientation() === 'landscape' && current > 0 && current < pdf.numPages - 1;
  if (book && $('book')) $('book').style.transform = current === 0 && book.getOrientation() === 'landscape' ? `translateX(-${book.getSettings().width / 2}px)` : '';
  $('page-label').textContent = spread ? `Pages ${current + 1}–${Math.min(current + 2, pdf.numPages)} of ${pdf.numPages}` : `Page ${current + 1} of ${pdf.numPages}`;
  $('page-range').value = current + 1;
  $('prev').disabled = current === 0;
  $('next').disabled = spread ? current + 2 >= pdf.numPages : current >= pdf.numPages - 1;
  $('contents').querySelectorAll('button').forEach((button) => {
    button.removeAttribute('aria-current');
    if (Number(button.dataset.page) === current + 1) button.setAttribute('aria-current', 'page');
  });
  if (current !== lastTracked) {
    track('book-page-view', { page: current + 1, total_pages: pdf.numPages, edition: config.version });
    lastTracked = current;
  }
  if (reading) void paintReading(); else queuePages();
}

async function paintPage(index) {
  if (painted.has(index) || !pages[index]) return;
  const page = await pdf.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, devicePixelRatio || 1) * 500 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  canvas.setAttribute('aria-label', `Page ${index + 1}`);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  pages[index].replaceChildren(canvas);
  painted.set(index, canvas);
}

function queuePages() {
  drawing = drawing.then(async () => {
    const focus = current;
    for (const i of [focus, focus + 1, focus - 1, focus + 2, focus - 2, focus + 3]) {
      if (i >= 0 && i < pdf.numPages) await paintPage(i);
    }
    for (const [i, canvas] of painted) {
      if (Math.abs(i - current) > 5) {
        canvas.width = 0; canvas.height = 0; canvas.remove(); painted.delete(i);
      }
    }
  }).catch(() => announceError('A page could not be displayed. Try Reading view or download the PDF.'));
}

async function paintReading() {
  const sequence = ++renderSequence;
  readingTask?.cancel();
  try {
    const page = await pdf.getPage(current + 1);
    if (sequence !== renderSequence) return;
    $('reading-page').hidden = textMode;
    $('page-text').hidden = !textMode;
    if (textMode) {
      const content = await page.getTextContent();
      if (sequence !== renderSequence) return;
      $('page-text').textContent = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('') || 'This page contains artwork or scanned text. Use the page view to read it.';
      return;
    }
    const width = Math.min(740, $('reading-page').clientWidth) * Number($('zoom').value) / 100;
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(2, devicePixelRatio || 1);
    const viewport = page.getViewport({ scale: width / base.width * ratio });
    const canvas = $('reading-canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${width}px`; canvas.style.height = `${viewport.height / ratio}px`;
    readingTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    await readingTask.promise;
  } catch (error) {
    if (error.name !== 'RenderingCancelledException') announceError('This page could not be rendered. You can still download the PDF.');
  }
}

function goTo(index, animated = true) {
  if (!pdf) return;
  const page = Math.max(0, Math.min(pdf.numPages - 1, index));
  if (reading) updatePosition(page);
  else if (animated && !reducedMotion) book.flip(page);
  else { book.turnToPage(page); selectedPage = page; }
}

function turn(direction) {
  if (!pdf) return;
  if (reading) goTo(current + direction);
  else if (reducedMotion) direction > 0 ? book.turnToNextPage() : book.turnToPrevPage();
  else direction > 0 ? book.flipNext() : book.flipPrev();
}

async function init() {
  try {
    const response = await fetch('/book.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Book configuration is unavailable.');
    config = await response.json();
    $('title').textContent = config.title;
    $('byline').textContent = config.author ? `By ${config.author} · Preface & chapters 1–3` : 'A little of the book. A world to discover.';
    document.title = `${config.title} · Read the opening chapters`;
    if (config.subtitle) document.querySelector('meta[name="description"]').content = `${config.subtitle} Read the preface and first three chapters by ${config.author}.`;
    $('copyright').textContent = config.author ? `© ${new Date().getFullYear()} ${config.author}` : 'The opening chapters';
    $('demo-banner').hidden = !config.demo;
    const pdfUrl = new URL(config.pdfUrl, location.origin);
    if (pdfUrl.origin !== location.origin || !pdfUrl.pathname.startsWith('/book/')) throw new Error('The preview PDF must be hosted with the reader.');
    $('download').href = pdfUrl.href; $('download').hidden = false;
    $('download').download = `${config.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-preview.pdf`;
    pdf = await getDocument({ url: pdfUrl.href, isEvalSupported: false, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' }).promise;
    $('status').hidden = true; $('stage').hidden = false;
    const first = await pdf.getPage(Math.min(2, pdf.numPages)); const bounds = first.getViewport({ scale: 1 });
    const aspect = bounds.height / bounds.width;
    const stage = $('stage');
    stage.style.setProperty('--page-aspect', aspect);
    function dimensions() {
      const mobile = stage.clientWidth < 720;
      const availableHeight = stage.clientHeight - 48;
      const availableWidth = stage.clientWidth - 40;
      const width = Math.floor(Math.min(availableHeight / aspect, availableWidth / (mobile ? 1 : 2)));
      return { width: Math.max(100, width), height: Math.max(140, Math.floor(width * aspect)) };
    }
    pages = Array.from({ length: pdf.numPages }, (_, i) => {
      const el = document.createElement('div'); el.className = 'page';
      el.setAttribute('aria-label', `Book page ${i + 1}`);
      if (i === 0) el.dataset.density = 'hard';
      const label = document.createElement('span'); label.className = 'page-placeholder'; label.textContent = `Page ${i + 1}`;
      el.append(label); $('book').append(el); return el;
    });
    function mountBook() {
      const { width, height } = dimensions();
      $('book').style.width = `${width * (stage.clientWidth < 720 ? 1 : 2)}px`;
      $('book').style.height = `${height}px`;
      book = new PageFlip($('book'), { width, height, size: 'fixed', showCover: true, usePortrait: true, autoSize: false, maxShadowOpacity: .3, flippingTime: reducedMotion ? 1 : 850, mobileScrollSupport: true, showPageCorners: !reducedMotion, useMouseEvents: true, swipeDistance: 25, startPage: current });
      book.on('flip', event => updatePosition(event.data));
      book.on('changeOrientation', () => updatePosition(book.getCurrentPageIndex()));
      book.loadFromHTML(pages); updatePosition(current);
    }
    mountBook();
    let resizeTimer;
    const resize = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (reading || !stage.clientHeight) return;
        const next = dimensions();
        if (next.width === book.getSettings().width && next.height === book.getSettings().height) return;
        // destroy removes the container, so retain page elements and rebuild it.
        book.destroy();
        const container = document.createElement('div'); container.id = 'book'; stage.append(container);
        pages.forEach(el => { el.removeAttribute('style'); container.append(el); });
        mountBook();
      }, 150);
    });
    resize.observe(stage);
    $('page-range').max = pdf.numPages; $('page-range').disabled = false;
    const chapters = config.chapters?.length ? config.chapters : [{ title: 'Start reading', page: 1 }];
    for (const chapter of chapters) {
      if (chapter.page < 1 || chapter.page > pdf.numPages) continue;
      const button = document.createElement('button'); button.dataset.page = chapter.page;
      const label = document.createElement('span'); label.textContent = chapter.title;
      const number = document.createElement('small'); number.textContent = `p. ${chapter.page}`;
      button.append(label, number);
      button.onclick = () => { goTo(chapter.page - 1, false); closeContents(); track('book-chapter-open', { chapter: chapter.title }); };
      $('contents').append(button);
    }
    if (!config.demo) initAnalytics();
    track('book-open', { edition: config.version });
    updatePosition(0);
  } catch (error) {
    announceError('The preview couldn’t be opened. Please reload the page, or use Download PDF if available.');
    console.error(error);
  }
}

function closeContents() { $('contents').hidden = true; $('contents-toggle').setAttribute('aria-expanded', 'false'); }
$('contents-toggle').onclick = () => { const open = $('contents').hidden; $('contents').hidden = !open; $('contents-toggle').setAttribute('aria-expanded', String(open)); };
document.addEventListener('click', event => { if (!$('contents').contains(event.target) && !$('contents-toggle').contains(event.target)) closeContents(); });
$('prev').onclick = () => turn(-1); $('next').onclick = () => turn(1);
$('page-range').oninput = event => goTo(Number(event.target.value) - 1, false);
$('view-toggle').onclick = () => {
  if (!pdf) return;
  if (!reading && selectedPage !== null) current = selectedPage;
  reading = !reading;
  $('stage').hidden = reading; $('reading-view').hidden = !reading;
  $('view-toggle').setAttribute('aria-pressed', String(reading));
  $('view-toggle').querySelector('span').textContent = reading ? 'Flipbook view' : 'Reading view';
  if (!reading) book.turnToPage(current);
  updatePosition(reading ? current : book.getCurrentPageIndex());
  track('book-view-change', { view: reading ? 'reading' : 'flipbook' });
};
$('zoom').oninput = () => { $('zoom-value').textContent = `${$('zoom').value}%`; void paintReading(); };
$('text-toggle').onclick = () => { textMode = !textMode; $('text-toggle').setAttribute('aria-pressed', String(textMode)); $('text-toggle').textContent = textMode ? 'Page view' : 'Text view'; void paintReading(); };
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('reader').requestFullscreen(); }
  catch { $('view-toggle').click(); }
};
if (!document.fullscreenEnabled) $('fullscreen').hidden = true;
document.addEventListener('fullscreenchange', () => $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit full screen' : 'Enter full screen'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeContents(); return; }
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
});
$('download').onclick = () => track('book-pdf-download', { edition: config?.version });
window.addEventListener('resize', () => { if (reading && pdf) void paintReading(); });
void init();
