# Opening chapters reader

A public PDF flipbook for Firebase Hosting (`curiosity-economy`). Desktop spreads, mobile swiping, keyboard navigation, contents, PDF download, fullscreen, reduced-motion support, and a zoomable reading/text view. Only nearby flipbook pages retain rendered canvases.

## Run

Node 22 or newer. Run `npm ci`, then `npm run dev`. `npm test` checks source URL handling and PDF validation. `npm run build` makes the static site in `dist`.

The current preview is **Embracing the Curiosity Economy** by **David Fearne**: 45 book-sized pages comprising the cover, preface, and first three chapters. `public/book.json` records the section start pages and current edition. The reader and download use the same PDF.

## Update the book

Keep editing the supplied Google Docs and retain the cover PDF in Drive. The sync re-typesets the chapters, merges them in source order, and computes section start pages. A dedicated preview PDF is also supported when its existing formatting should be preserved.

1. The five supplied Drive links are configured in `book.sources.json`.
2. Update those links only if a source file is replaced with a new ID. Do not put the full unpublished manuscript in the public folder.
3. For public Drive sources, the links must allow reading without signing in. For private sources, provide a short-lived `GOOGLE_DRIVE_ACCESS_TOKEN` with Drive read access in `.env`; it is used only by the local sync, never included in the website.
4. Run `npm run sync`. Review the resulting reader. `npm run deploy` validates the edition, builds, and deploys to Firebase Hosting.

For one source, `BOOK_SOURCE` in `.env` is an alternative, but set the title and author in `public/book.json` first. A combined PDF can supply explicit `chapters` in `book.sources.json` with one-based PDF page numbers. Scanned PDFs display normally; text view requires an embedded text layer. The reader uses 6 × 9 inch body pages, with the original cover fitted proportionally. The chapter text is typeset in embedded Crimson Text with generous margins, running headings, paragraph indentation, widow/orphan handling and folios. The app uses the existing imitation-ai.com monochrome palette, Roboto typography and /AI wordmark. PDF page rendering preserves page artwork, while merged PDFs may not preserve document-level bookmarks or interactive forms.

Each sync writes a content-versioned PDF and updates `public/book.json` after validation, so reading and downloading use the same edition. `preview.pdf` is a stable no-JavaScript download alias. The site does not request Drive documents from visitors' browsers.

The source PDFs and DOCX exports were fetched through the authenticated Google Drive connector and retained in ignored `.source-cache/` files. The configured `format: "book"` uses DOCX paragraph structure and emphasis to typeset each chapter. Every rendered chapter is compared against its source text before an edition can be published. Changes to layout update chapter start pages automatically. `npm run sync -- --cached` assembles those downloaded snapshots without claiming they are fresh. A normal `npm run sync` requests current Drive versions and needs Google authorization for private files. The connector can also refresh the cached exports. The original assembly preserved source dimensions; the book edition deliberately reflows the text into smaller pages. Cover artwork and chapter wording are preserved.

**Sync is currently manual.** GitHub Actions now deploys committed editions. A future scheduled job can refresh the private Drive sources once renewable Google read access is configured. No scheduled job is activated by this project. For private Drive documents, CI needs renewable Google authentication, not a long-lived copied access token. Firebase's GitHub integration can handle deployments: https://firebase.google.com/docs/hosting/github-integration

## Book typesetting dependencies

`npm run sync` now requires Python with `pip install -r scripts/requirements.txt`. Set `BOOK_PYTHON` to the Python executable if needed; this workstation uses the bundled Python through ignored `.env`. CI must install the same requirements. Google Docs are fetched as DOCX for typesetting; the PDF cover is retained. Cached mode uses each source's `docxCachePath`.

The fonts are bundled with their OFL licences. Interface Roboto font files come from the existing website; Crimson Text comes from the Google Fonts repository. `tests/test_typeset.py` checks formatting and preservation independently of the production manuscript.

## Firebase

Push or merge into `main` in [imitation-ai/Curiosity-economy](https://github.com/imitation-ai/Curiosity-economy) to test, build, and deploy through GitHub Actions. Pull requests run checks without deployment access. See [deployment setup and operations](docs/deployment.md) for authentication, analytics variables, manuscript releases, and rollback.

For a local deployment, run `npx firebase login`, then `npm run deploy`. `.firebaserc` targets `curiosity-economy`; `firebase.json` serves `dist` with revalidation for HTML/manifest and immutable caching for versioned assets. There is no visitor login or database. Connect an existing website using its navigation, a book subdomain, or an iframe. Add a custom domain through Firebase Hosting once its name is confirmed.

## Better Stack

Set `VITE_BETTERSTACK_APPLICATION_TOKEN` in `.env` to the **public frontend application token** from Better Stack's Frontend tab. Never use a management API token or log ingestion secret here. Analytics load only on production builds with a real manuscript, and respect the browser's Do Not Track and Global Privacy Control signals.

The integration uses the official asynchronous tag and `betterstack('track', ...)`. It records book-open, book-page-view, book-chapter-open, book-view-change and book-pdf-download events. Downloads count button clicks, not successful file saves; page views do not prove a page was read. Website analytics and web vitals are controlled in Better Stack. Configure the application's data collection settings before launch: the vendor defaults also enable session replays and fingerprinting. These features are not needed for this reader's requested analytics. Confirm the desired collection/privacy settings in Better Stack and the host website's privacy notice before enabling its token.

Verify the actual deployed site through Better Stack's Verify data collection panel; analytics is not considered connected until events appear. Documentation: https://betterstack.com/docs/rum/js-tag/installation/

## Current launch prerequisites

- Optional custom domain choice.
- Better Stack frontend token and collection settings.
- Google authentication for optional automatic scheduled manuscript syncing; code deployments already use GitHub Actions.
