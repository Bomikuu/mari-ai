# Mari Command Center Implementation Plan

> **For agentic workers:** Execute the approved user request in this session with coordinated bounded subagents and shared contracts; root integrates and verifies. The requested implementation proceeds after this concrete spec/plan without another approval prompt. User instructions take precedence over skill approval/commit defaults.

**Goal:** A working private local command center connecting real project services to capture, image review, approved Codex implementation and bounded verification.

**Architecture:** React UI talks to a loopback Node backend; a separate Node worker owns service supervision and sequential jobs. SQLite persists records and append-only redacted events; images stay in controlled local artifact storage. Worker uses native ChatGPT-authenticated Codex app-server and Playwright.

**Tech Stack:** React JavaScript/JSX, Vite, Tailwind, official shadcn/UI JSX, Express, Node SQLite, Playwright, Sharp.

**Spec:** `docs/superpowers/specs/2026-11-06-mari-command-center-design.md`.

## Global Constraints

- Author `.js`/`.jsx` application code only; no TypeScript configuration.
- Official shadcn CLI with `tsx:false`, components in `src/components/ui`.
- Loopback default `127.0.0.1:4310`; CSRF/session checks; no credentials in frontend/logs.
- Native subscription Codex only; JEV checks are the sole approved API exception.
- Exact artifact/hash approval plus explicit Implement action; no automatic commit/merge/deploy.
- Route bounds: depth 3 / 500 discovery directories, 20 routes, 30-second page timeout; readiness 45 seconds; stop escalation 5 seconds.
- At most two visual verification rounds; unknown states stay unknown.

## Review Focus

- A port occupied by an unrelated process stays external and is never killed; service tests pin this.
- A revised/replaced image cannot inherit approval; workflow/API tests pin hash and revision checks.
- Worker loss and PID reuse never manufacture online/running or grant process ownership; supervisor tests pin identity checks.
- Secrets split across stdout chunks or present in command events never reach storage/download; redactor tests pin line buffering and recursive scrubbing.
- Cross-origin actions, symlinked artifact paths and malformed uploaded images fail safely; API tests pin these boundaries.

### Task 1: Persistent contracts and local launch

**Files:** `package.json`, `shared/constants.js`, `server/store.js`, `server/security.js`, `server/events.js`, `scripts/dev.js`, `.gitignore`, `tests/store.test.js`, `tests/security.test.js`.

**Interfaces:** Store/security exports and records are exactly those in spec; frontend consumes HTTP only, worker shares SQLite records. `MARI_DATA_DIR` sets isolated test runtime state.

- [x] Implement SQLite JSON records, WAL, monotonic events and redaction utilities; test persistence, update and redaction.
- [x] Integrate scripts and dependency manifests with frontend owner; launch worker/backend/Vite as separate processes and handle shutdown.

### Task 2: Project registry and HTTP actions

**Files:** `server/index.js`, `server/projects.js`, `server/discovery.js`, `server/artifacts.js`, `server/routes.js`, `tests/api.test.js`.

**Consumes:** Shared store/security/constants. **Produces:** HTTP contracts in spec; queues immutable job payloads rather than executing commands in requests.

- [x] Implement detection/Git/directory picker/scoped discovery, persistent services, command-version review and URL validation.
- [x] Implement session/CSRF guarded bootstrap/actions/SSE/log export and protected artifact upload/content.
- [x] Enforce exact approval + separate implementation, revision invalidation, retry/resume/cancel and user-only Codex responses. Test cross-origin and approval/path/upload boundaries.

### Task 3: Worker and real workflow

**Files:** `worker/index.js`, `worker/services.js`, `worker/capture.js`, `worker/codex.js`, `worker/workflow.js`, `examples/demo-project/package.json`, `examples/demo-project/server.js`, `examples/demo-project/api.js`, `tests/services.test.js`, `tests/workflow.test.js`.

**Consumes:** Exact collections/events/shared exports and queued jobs. **Produces:** Real services, workers, agents, artifacts and observable stage events.

- [x] Implement heartbeat/claims/recovery and safe multi-service supervisor. Test duplicate/external/PID/tree handling.
- [x] Implement bounded same-origin capture/inventory and actual PNG metadata; set up two-service isolated demo.
- [x] Implement app-server JSON-RPC lifecycle, ChatGPT auth enforcement, redacted event mapping, approval/input response, native image ingestion, separate sandboxed proposal/implementation threads, interruption and limits.
- [x] Implement sequential stages, manual handoff, verification count and resume only incomplete work; test exact approval and cancellation independence.

### Task 4: Chosen Mari interface

**Files:** `index.html`, `vite.config.js`, `jsconfig.json`, `components.json`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, `src/components/*`, `src/components/ui/*`, `.impeccable/surfaces/command-center.md`, `DESIGN.md`, `.impeccable/design.json`.

**Consumes:** HTTP contract and approved image `docs/design/mari-command-center-v2.png`. **Produces:** Responsive single-page home/context manager/task comparison and inspectors; real data only.

- [x] Install official shadcn via CLI for JavaScript and build comp-based home with empty/loading/error states.
- [x] Wire project registration/discovery/services/start-review, compact real agents and task context.
- [x] Implement capture/design/handoff/import/revision/approval/implement/verify controls and full-size image review.
- [x] Implement source filters/search/download/autoscroll pause, agent details and command approval requests; responsive/accessibility states.

### Task 5: Integrate, demonstrate and review

**Files:** `README.md`, `docs/verification.md`, task-owner modules as defects require.

- [x] Run consequential Node/HTTP tests and production build; inspect authored extensions and installed official UI provenance.
- [x] Launch Mari, register demo, review/start services, confirm real readiness, capture same page desktop/mobile, exercise actual native generation if available; preserve image approval gate for user.
- [x] Inspect desktop/mobile once together, fix observed defects in one batch, confirm once; request fresh final code/design review and address material findings within bounded review.
- [x] Record actual functional/manual/unavailable capabilities, remaining differences, commands, screenshots and next user action. Refresh Graphify from real code without external API extraction; no auto commit/deploy.

## Execution result

Implemented in this session with coordinated backend, worker and interface agents. All 34 tests and the production build pass. Two desktop/mobile inspection batches completed; independent code fixes were rechecked and the fresh design reviewer returned SHIP at the demonstrated scope. Both source-derived design records were verified. The live demo registered and started two owned services, captured both viewports, and generated a genuine subscription-native design PNG. Its exact revision remains awaiting the user’s approval; target edits and final target browser comparison are intentionally unexercised until approval plus explicit Implement. No commits, merges or deployment were performed. See `docs/verification.md`.
