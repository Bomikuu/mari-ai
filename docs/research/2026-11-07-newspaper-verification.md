# Mari Daily verification

Implemented the user's selected English **two-page A4** newspaper and **07:00 Asia/Manila** schedule. Coverage: Philippines, World, Valorant, Dota 2, crypto; BTC/ETH/SOL prices in USD/PHP are optional timestamped snapshots. The user's existing projects, image approvals and personal account records were not edited.

## Actual edition and schedule

The real collector returned seven healthy news sources and three current coin quotes. A ChatGPT-authenticated restricted native Codex turn produced eight validated paraphrased stories, covering all five desks. The host supplied original source links/dates and market values. PDFKit created the actual PDF in private `.mari/artifacts/newspaper-1PqVEf/mari-daily.pdf`; saved edition ID `edition_f0327cd1-2c28-4ab7-8b32-2f362890100d`, generated at 03:03 Manila on 7 November 2026. This manual first edition is earlier than the daily scheduled slot. The morning command refreshes pre-7am drafts once, then reuses post-7am editions.

The supported Automations tool created active heartbeat **`mari-daily-newspaper`**, named Mari Daily newspaper, attached to this chat. Its registered rule was verified as daily 07:00; the local/desktop clock resolves Asia/Manila. It runs `node scripts/newspaper.js --scheduled` in this repository, uses default `.mari` unless `MARI_DATA_DIR` is configured, and reports its actual saved PDF or failure. The real automation ID was persisted in the same local database for truthful UI status. Codex desktop and the computer must be available. No OS cron/service, automatic printing, email sending or publishing was installed.

Running the normal CLI twice returned the same edition ID on the second invocation with `reused:true`, without a new model turn. A temporary worker stopped itself with `stopServices:false`. Regression tests also prove unrelated queued workflows/services stay untouched, and an existing queued newspaper can start an offline temporary worker without duplication.

## PDF and interface

`pdfinfo` verified exactly two A4 pages, 595.28×841.89 points, 60,254 bytes, no PDF JavaScript. Both actual pages were rendered through Poppler and visually inspected; complete story extraction and minimum 9.5pt body sizes are tested. The demonstration PDF, renders and edition snapshot are retained in `docs/evidence/newspaper`. It uses actual fetched source data, not seeded stories. Later renderer wording refinements do not rewrite the frozen first archive artifact.

Firefox first batch covered empty setup and actual saved content in desktop/mobile, light/dark, plus both physical print pages. No JavaScript errors or document overflow. Saved-edition selection, Today entry, native-print callback, authenticated PDF attachment download and anonymous PDF rejection passed. An independent finish review found one screen-only collision between the longer right column on page two and the market divider. The single fix lets screen content reserve its natural height while keeping explicit physical print dimensions.

One confirmation batch found 49px desktop and 42px mobile clear separation, no JavaScript errors/overflow, and both print pages still exactly 793.7×1122.5 CSS pixels with every article/market panel before its footer. No story content was clipped or hidden. First evidence is archived under `.impeccable/review/newspaper/round-1`; final evidence occupies `.impeccable/review/newspaper`. The final finish verdict is recorded in `docs/design/newspaper-finish-review.md`; no third polish round is planned.

## Tests and review

Full `npm test`: **158 passed, no failures/skips**. Final `npm run build`: passed; the existing Three.js chunk advisory remains. Independent review documented and resolved the generation-instant/Manila date mismatch, sourced Dota 2 numeric-brand handling, optional missing price-change values, temporary-worker queue ownership, queued-offline liveness and unavailable-market PDF spacing. See `2026-11-07-newspaper-code-review.md`.

Source requests use fixed endpoints and bounded bodies/timeouts, reject redirects/unsafe XML and quarantine invalid/future dates. Source text stays inert; source IDs/URLs/dates and numeric claims are validated independently of the model. Dedicated Codex execution disables connected apps/MCP/hooks/browsing and access to unrelated files. Failures/cancellation preserve previous editions. PDF routes retain existing owner-session/CSRF/path containment rules.

The application graph is refreshed locally with zero provider calls and no changes to the eight original requirements-graph artifacts; its own refresh record documents exact source hashes/counts. Installed source/font provenance is recorded by the source review and surface brief.

Cleanup confirmed: temporary QA port 4311 is closed and its validated private temporary database/cookies were removed. The real user archive, active Codex automation, fonts, dependencies and first-edition evidence remain. No user project service was stopped.
