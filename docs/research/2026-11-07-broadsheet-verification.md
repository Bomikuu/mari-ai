# Classic broadsheet refinement

Implemented the user's approved original broadsheet direction: narrow columns, a strong lead story and exactly two printable A4 pages. The screen, native print and PDF use the same deterministic story placement. The first available Philippine story (World fallback) becomes the front-page lead; all remaining stories appear once. Page two has three columns for Valorant, Dota 2 and Crypto.

The existing serif font, paper colors, outer Mari controls, source data and daily schedule were retained. Typography/rules and page composition changed. No publisher reference image or external newspaper artwork was used.

## Verification

- Full suite: 158 tests passed, zero failures/skips. PDF tests cover ordinary/long/empty data, complete story text, readable minimum 9.5pt body, two A4 pages and exclusive writes. Shared-layout assertions verify all eight stories appear exactly once, one front lead and three second-page columns, including World fallback.
- Production build passed; the existing Three.js chunk advisory remains.
- A fresh PDF of the saved actual edition was rendered with PDFKit, checked as two A4 pages, and visually inspected through both Poppler page renders. Output is `output/pdf/mari-daily-broadsheet-2026-11-07.pdf` (63,142 bytes).
- One Firefox batch covered desktop/mobile and both outer themes, actual native-print pages and clearly labeled long-content test fixtures. Zero JavaScript errors and no document overflow; eight stories and one lead were present at every screen size. Both print containers were 793.7×1122.5 CSS pixels (A4), with all article content before the footer. Three equal narrow columns were confirmed in print. No correction capture round was needed.
- Independent finish review is recorded in `docs/design/broadsheet-finish-review.md`; the scope is the original Mari broadsheet layout. Final evidence is `.impeccable/review/broadsheet` and `output/pdf/broadsheet-{1,2}.png`.

The saved edition's PDF is reformatted into a new owned artifact. The original artifact/file/hash remains intact and is retained in `previousPdfArtifacts`; news content and its preparation/source/quote timestamps remain unchanged. A `newspaper.reformatted` event records the new rendering. Future daily generation records the presentation version in artifact metadata. The publication record is `output/pdf/broadsheet-publication.json`.

The local application graph was refreshed after source freeze without provider calls: 90 JS/JSX source files, 750 nodes, 2,648 edges and 26 labeled communities. All 90 source SHA-256 and manifest hashes were verified, along with the eight preserved original requirements artifacts. This structural snapshot is separate from the test/browser evidence above. The temporary QA service on port 4311 was stopped and its exact temporary data directory removed. No user project services were terminated.
