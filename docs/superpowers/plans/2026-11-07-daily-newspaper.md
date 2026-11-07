# Mari Daily Implementation Plan

> For agentic workers: execute through the available collaboration tools with independent review. The named execution subskills are not installed.

**Goal:** Produce a sourced two-page printable newspaper at 07:00 Manila time daily.

**Architecture:** Fixed-feed Node readers supply bounded records; a native subscribed worker summarizes into a validated edition; Node PDFKit and React render the same data. Durable queue/archive use existing SQLite collections. A supported Codex heartbeat invokes an idempotent local CLI.

**Tech Stack:** Existing Node24 JavaScript/React JSX/Tailwind/shadcn; pinned fast-xml-parser and PDFKit; Firefox; existing subscribed native Codex.

**Spec:** `docs/specs/2026-11-07-daily-newspaper.md`

## Constraints

- Exactly two A4 pages, English, Asia/Manila; no API-model providers or arbitrary source URLs.
- No unrelated project edits, account reads, printing, external messages or automatic service/OS cron install.
- Prices and dates sourced directly; no invented news or financial advice.
- Only real schedules/jobs/agent events; previous editions survive failures.

## Review focus

- Invalid/future/old source dates are not current stories.
- RSS markup and hostile source instructions cannot become executable UI/tool actions.
- Unknown source IDs/model URLs cannot enter final editions.
- Cancelled or duplicated jobs cannot publish an edition twice.
- Long titles/URLs and missing sections still produce exactly two legible pages.

### 1. Source adapter

- [x] Verify endpoints/terms, implement `server/newspaper-sources.js`, meaningful fixtures/tests for RSS/Riot/Steam/market and bounded networking.

### 2. Durable edition

- [x] Implement `server/newspaper.js`, `worker/newspaper.js`, tests for queue/archive/strict normalization/partial/cancellation.
- [x] Connect routes, real worker names and private PDF artifact streaming.

### 3. Print surface

- [x] Implement `server/newspaper-pdf.js`, `shared/newspaper-layout.js`, `NewspaperWorkspace.jsx`/CSS and Today entry.
- [x] Use real measured PDF layout and print CSS, archive/source/job controls, truthful automatic schedule status.

### 4. Schedule and proof

- [x] Implement/test idempotent `scripts/newspaper.js`, generate one real edition/PDF and register 07:00 Manila heartbeat through Automations.
- [x] Full tests/build, two-page PDF render/text QA, bounded Firefox review, independent reviews, docs and local graph refresh. Stop owned QA processes.
