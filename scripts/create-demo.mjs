import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile, mkdir } from 'node:fs/promises';
const pdf = await PDFDocument.create();
const serif = await pdf.embedFont(StandardFonts.TimesRoman);
const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
const sans = await pdf.embedFont(StandardFonts.Helvetica);
const paper = rgb(.98, .966, .929), ink = rgb(.17, .21, .17), gold = rgb(.8, .70, .49);
const width = 480, height = 680;
const center = (page, text, y, font, size, color) => page.drawText(text, { x: (width - font.widthOfTextAtSize(text, size)) / 2, y, font, size, color });
const cover = pdf.addPage([width, height]);
cover.drawRectangle({ x: 0, y: 0, width, height, color: ink });
cover.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: gold, borderWidth: .6 });
center(cover, 'T H E   O P E N I N G   C H A P T E R S', 596, sans, 8, gold);
center(cover, 'A first', 440, serif, 62, paper);
center(cover, 'look.', 375, italic, 68, paper);
cover.drawLine({ start: { x: 205, y: 320 }, end: { x: 275, y: 320 }, thickness: .7, color: gold });
center(cover, 'A preface. Three chapters.', 268, italic, 17, paper);
center(cover, 'The beginning of something.', 241, italic, 17, paper);
for (let i = 0; i < 5; i++) cover.drawEllipse({ x: 240, y: 159, xScale: 45 + i * 14, yScale: 20 + i * 7, borderWidth: .45, borderColor: gold, rotate: { type: 'degrees', angle: i * 12 } });
center(cover, 'D E S I G N   D E M O', 65, sans, 8, gold);

const sections = [
 ['PREFACE', 'An invitation', 'There is a particular pleasure in opening a book for the first time. Before the first sentence, before the first idea, there is a quiet moment of possibility.', 'This is a sample edition created to demonstrate the reader. The author\'s cover, preface and opening three chapters will take their place here.', 'For now, turn a page. Notice the space around the words, the rhythm of the paper, and the small invitation to keep going.'],
 ['CHAPTER ONE', 'The first page', 'Every beginning leaves something open. A question, perhaps. A path that was easy to overlook. A thought that stays with us long after the conversation ends.', 'A book gives those beginnings room to grow. One page follows another, and the distance between what we know and what we might discover begins to feel like an invitation.', 'These are demonstration words only. Your manuscript will retain its original typography, illustrations and page layout.'],
 ['', 'Room to wonder', 'Reading asks for very little: a little time and a little attention. In return it offers the chance to encounter an idea on its own terms.', 'You can turn these pages by dragging a corner, swiping on your phone, or using the arrows below. The contents menu takes you straight to a section.', 'Prefer to linger? Reading view gives each page more room, with zoom and a text option for comfortable reading.'],
 ['CHAPTER TWO', 'A different perspective', 'Sometimes the most interesting part of a journey is the change in perspective. The familiar looks a little less familiar. The ordinary carries a question we had not thought to ask.', 'That shift can be quiet. It might arrive in a single sentence or in the pause between two paragraphs. There is no need to hurry it.', 'This chapter is part of the design demonstration. It will be replaced by the second chapter of the book.'],
 ['', 'Follow the thread', 'The next page is always a small act of trust. We follow a thought to see where it leads, carrying something of our own experience into each sentence.', 'On a wider screen, the reader opens into a two-page spread. On a phone, it becomes a single page that fits naturally in your hand.', 'The PDF download contains the same edition, ready to read offline or return to another day.'],
 ['CHAPTER THREE', 'The beginning continues', 'A preview is a doorway. It offers enough of the world inside to give you a feeling for its shape, its questions and its possibilities.', 'The end of an extract can be another kind of beginning: a thought to explore, a conversation to start, or a reason to come back.', 'This page stands in for the third chapter while the final preview is being prepared.'],
 ['', 'To be continued', 'Thank you for spending a moment with the opening chapters.', 'This is the end of the sample reader. The completed edition will bring together the cover, preface and first three chapters in one uninterrupted reading experience.', 'Until then, there is always another page to turn.']
];
function paragraph(page, text, y) {
 const words = text.split(' '); let line = '';
 for (const word of words) {
  const next = line ? `${line} ${word}` : word;
  if (serif.widthOfTextAtSize(next, 14) > 354) { page.drawText(line, { x: 63, y, font: serif, size: 14, color: ink }); y -= 23; line = word; } else line = next;
 }
 if (line) { page.drawText(line, { x: 63, y, font: serif, size: 14, color: ink }); y -= 23; }
 return y - 17;
}
for (const [i, [kicker, title, ...paras]] of sections.entries()) {
 const p = pdf.addPage([width, height]);
 p.drawRectangle({ x: 0, y: 0, width, height, color: paper });
 center(p, 'T H E   O P E N I N G   C H A P T E R S', 636, sans, 7, ink);
 p.drawLine({ start: { x: 63, y: 617 }, end: { x: 417, y: 617 }, thickness: .4, color: gold });
 p.drawText(kicker || 'A FIRST LOOK', { x: 63, y: 551, font: sans, size: 8, color: ink });
 p.drawText(title, { x: 63, y: 508, font: serif, size: 30, color: ink });
 let y = 459; for (const para of paras) y = paragraph(p, para, y);
 center(p, String(i + 2), 35, sans, 9, ink);
}
pdf.setTitle('A first look - Design demo');
await mkdir('public/book', { recursive: true });
await writeFile('public/book/preview.pdf', await pdf.save());
await writeFile('public/book.json', JSON.stringify({ title: 'A first look.', author: '', demo: true, version: 'demo-1', pdfUrl: '/book/preview.pdf', pageCount: 8, chapters: [{ title: 'Cover', page: 1 }, { title: 'Preface', page: 2 }, { title: 'Chapter one', page: 3 }, { title: 'Chapter two', page: 5 }, { title: 'Chapter three', page: 7 }] }, null, 2) + '\n');
console.log('Created 8 clearly labelled demonstration pages.');
