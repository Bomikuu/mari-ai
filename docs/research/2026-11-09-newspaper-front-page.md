# Mari Daily reference-layout verification

The owner requested the attached November 9 newspaper layout, with everything on one A4 sheet if possible and source images when available. Implementation is JavaScript/JSX using existing React, Tailwind, official shadcn Button, PDFKit and Sharp. No dependency installation or authored TypeScript was needed.

## Result

- Saved edition November 9: eight complete summaries, five topic categories, two genuine publisher images, one 595.28×841.89pt A4 sheet, 176,915-byte selectable-text PDF, 8.2pt body. Source coverage and market snapshot remain ready.
- The original preparation time is unchanged (`2026-11-08T23:03:01.865Z`). The initial PDF and each intervening rendering remain owned artifacts in rendering history. Current PDF/image hashes were verified. Layout-only reflow made zero model calls.
- The preview is `output/pdf/mari-daily-2026-11-09.pdf`; current runtime path and reflow details are in `output/newspaper-front-page-reflow.json`.
- A dense synthetic fixture demonstrates two A4 pages, all eight full summaries, and a 9.5pt body. Optional illustration can be omitted from the measured fallback if it prevents full reporting from fitting.

## Checks

- `npm test`: **269 passed, zero failed** in `output/newspaper-front-page-final-tests.txt`.
- An earlier parallel run passed 268 tests and failed the pre-existing Brag successful-tail-child cleanup assertion. No Brag code/test was changed. A full retry without simultaneous build/browser/graph workload passed all 269; the earlier failure is retained in `output/newspaper-front-page-full-tests.txt`.
- `npm run build`: passed, `output/newspaper-front-page-build.txt`. The existing >500kB globe chunk advisory remains.
- `git diff --check`: passed.
- Firefox batch: desktop 1440px/mobile 390px, light/dark; zero page errors and no document-width overflow. Phones default to 15px reading text; paper remains selectable. Native print reports a single 793.70×1122.52px A4 sheet and all blocks within it. Measurements/captures: `output/playwright/newspaper-front-page/round-2`.
- PDF/native-print visual inspection: final front page and both dense pages rendered with Poppler. No clipped or overlapping text, lost summary, invented chart, false weather or fake page reference was introduced. Bounded review stopped after the correction/confirmation batch.
- Image tests cover fixed publisher/CDN hosts, credential/private/off-site URLs, redirects, denied access, malformed/unsupported/oversized data, private sanitized JPEGs and source provenance. Reflow tests check failure preservation, old artifact retention, original reporting times and no model/network dependency when images are disabled.
- Existing 07:00 Asia/Manila automation updated in place; schedule identity and all no-publish/no-print/no-paid-model constraints preserved. No new automation was created.
- Graphify: 141 source files, 1,062 nodes, 4,251 edges, 35 communities; requirement graph preserved, zero external API calls. Diagnostics remain 17 dangling endpoints, zero missing endpoints, nine self loops and 118 collapsed relation variants. Architecture evidence is not functional proof.

JEV receives only sanitized verification counters and declared limitations, using the configured-provider exception previously authorized by the owner. Its result is advisory and recorded separately in `output/newspaper-front-page-jev-result.json`; it does not replace tests or visual inspection. No article text, account data, credential or source image was submitted.

JEV returned `ready` (confidence 0.64; probability 0.76, needs-followup 0.24). It used 668 input and 42 output tokens through the already-authorized configured provider. This text-only judgment is supplementary; the native tests and supplied visual evidence determine the delivery.
