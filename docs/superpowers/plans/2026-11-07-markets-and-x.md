# Markets and X Implementation Plan

**Goal:** Implement the owner-approved markets, portfolio, investment analysis and selected-account X news prompt.

**Architecture:** Reuse SQLite settings records, the owner API, existing worker queue and native Codex client. Keep deterministic calculation, upstream adapters, request validation, worker analysis and React workspaces separate. Execute natively in this session to conserve the owner's model usage; no automatic reviewer/specialist delegation.

**Tech stack:** React JavaScript/JSX, existing official shadcn/ui, Node 24, SQLite, Lightweight Charts 5.

**Spec:** [Approved brief](../../specs/2026-11-07-markets-and-x.md).

## Global constraints

- Author .js/.jsx application code only, preserve existing authentication/approval gates.
- Firefox for browser verification; bounded two-pass UI review.
- No paid X calls until consent/configuration; no model turns for refresh/calculation.
- Keep source times, stale/error/partial states and missing evidence explicit.
- No automatic orders, posts, commits, merges, deployments or additional automations.

## Review focus

- Unknown initial basis must not become a fabricated zero-cost profit.
- Removing earlier buys must not silently create negative historical holdings.
- Malformed or delayed upstream responses must not overwrite a newer selection/configuration.
- Analysis from an old ledger/profile/feed revision must be visibly stale.
- UI/API outputs and errors must never contain an X bearer credential.

## Task 1: Market data and portfolio

Files: shared/portfolio.js, server/market-data.js, server/markets.js, tests/markets.test.js.
Interfaces: market adapter exposes market(asset, interval), ticker(assets); portfolio exposes portfolioReport(trades, prices), validateTrade(input). API lives at /api/personal/markets.

- [x] Pin calculation, normalization, cache/backoff, invalid records, ownership and persistence behavior with tests.
- [x] Implement bounded public data adapter, persistent watchlist/ledger/risk profile and cached snapshots.
- [x] Verify deterministic calculations and a real public market response, without invoking a model.

## Task 2: X news

Files: server/x-news.js, tests/x-news.test.js.
Interfaces: /api/personal/x stores configuration/accounts, explicit refresh, local post state and newspaper opt-in. Fixed official upstream origins only.

- [x] Test consent, budgets, credential secrecy, source normalization and stale configuration handling.
- [x] Implement manual account selection/feed retrieval and local filtering/save/read state.
- [x] Preserve honest disconnected/partial/error states without paid live testing.

## Task 3: Explicit analysis and newspaper reuse

Files: worker/personal-analysis.js, server/personal-analysis.js, worker/codex.js, worker/workflow.js, worker/index.js, worker/newspaper.js, tests/personal-analysis.test.js.
Interfaces: analysis preparation captures bounded immutable data; personal.crypto.analyze and personal.x.summarize queue native single turns, expose actual status/cancel/result/staleness. Per-client model/effort overrides never write global config.

- [x] Test context capture, queued duplicate prevention, cancellation and current-revision checks.
- [x] Implement structured native responses and host-owned sources, actual model settings and scoped workspaces.
- [x] Add optional bounded cached newspaper inputs without changing schedule/page count.

## Task 4: Workspace and verification

Files: src/components/MarketsWorkspace.jsx, src/components/XNewsWorkspace.jsx, src/components/market-workspace.css, src/App.jsx; README/PRODUCT/DESIGN and verification record.

- [x] Build focused chart, portfolio, preferences/analysis and X feed/setup views using existing controls.
- [x] Run appropriate tests and production build.
- [x] Verify meaningful user flows in Firefox across desktop/mobile and both themes, with at most two visual passes.
- [x] Refresh Graphify locally, evaluate sanitized JEV evidence, document live-access boundaries and restart only idle owned Mari runtime.

Execution record: 264 tests and production build passed; one real Luna/low turn and public CoinGecko data verified; eight final Firefox captures passed. X live access remains owner setup. See docs/research/2026-11-07-markets-and-x.md for boundaries.
