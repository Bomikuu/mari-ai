# Local Video and Voice Implementation Plan

> For agentic workers: implement the tasks through delegated workers with independent review. Named execution subskills are not installed; use the available collaboration tools.

**Goal:** Generate real project videos through Brag and speak through locally installed VoiceStudio.

**Architecture:** Existing private Express routes enqueue real jobs in SQLite. Worker adapters isolate third-party execution, validate artifacts and reuse execution events. React workspaces expose status, controls and native media playback.

**Tech Stack:** Node 24 JavaScript; React JSX; existing Tailwind/shadcn components; native subscribed Codex; pinned Hyperframes; external CPU VoiceStudio.

**Spec:** `docs/specs/2026-11-07-media-integrations.md`

## Global Constraints

- Application code is .js/.jsx; no TypeScript configuration.
- Local media only; no credentials or environment-file contents in frontend/logs.
- Firefox for links/UI automation; isolated Chromium only for required Hyperframes rendering.
- No target source edits or design approvals in video generation.
- Cancel only owned job/process; project services remain independent.

## Review Focus

- Simultaneous Generate clicks must deduplicate actual work.
- Stale readiness and changed/deleted projects fail clearly.
- Source snapshots exclude hidden credentials and symbolic links.
- A corrupt/oversized/media-shaped file must not become a completed artifact.
- An unrelated service occupying voice port must not be killed or adopted as owned.

### Task 1: Brag runtime and job

- [x] Install audited pinned skills/runtime and user-local FFmpeg/FFprobe, retaining provenance and local-only environment controls.
- [x] Create `server/brag.js` and `worker/brag.js`; tests in `tests/brag.test.js` cover queue validation, deduplication, snapshot boundary and final media validation.
- [x] Run an actual short local render; record probe/decode evidence and attribution.

### Task 2: Voice adapter

- [x] Complete external VoiceStudio model installation and synthesis proof.
- [x] Create `server/voice.js`, `worker/voice.js`, tests for fixed loopback API, settings, timeout/cancellation and WAV validation.
- [x] Connect routes and worker dispatch, actual agent names and private artifact MIME/range handling.

### Task 3: Workspace

- [x] Add `MediaWorkspace.jsx` and scoped styles, per-project Video actions and Voice tool. Preserve existing visual identity and accessible empty/error states.
- [x] Show actual job/agent events and manual native video/audio players; cancellation and retry controls.
- [x] Run full tests/build, bounded Firefox QA, independent reviews; fix material findings and refresh application graph/documentation.
