# Mari local command center

Date: 2026-11-06, Asia/Manila. Repository/package slug: `mari-ai-personal-assistant`. Display name: **mari-ai personal assistant**.

## Authority and outcome

The user explicitly requested implementation after selecting the second Mari image. That image is the visual reference, saved at `docs/design/mari-command-center-v2.png`; the first generated concept was rejected. This specification resolves the implementation details without reopening the approved direction. The user requested JavaScript/JSX, overriding TypeScript in the original attachment. User instructions prohibit automatic commits, merges, and deployment; none are part of execution.

Build a private local application that registers projects, safely runs their services, captures pages, generates or imports actual design images, records human approval of an exact revision, implements only that approved revision, and verifies the result. Use real execution events throughout. The first live demonstration uses an isolated project in `examples/demo-project`; synthetic content is explicitly identified.

## Stack and boundaries

- React, Vite, JavaScript/JSX, Tailwind, official shadcn/ui generated through its CLI with `tsx:false` and `rsc:false`; shared UI files live in `src/components/ui`. Use `jsconfig.json` for aliases, never TypeScript configuration.
- Node.js 24 ESM JavaScript for backend and separate persistent worker. Express for the local HTTP interface, `node:sqlite` in WAL mode for records, Playwright with installed Chrome for captures, Sharp for validating imported/generated images.
- Default backend address `127.0.0.1:4310`; configurable through `MARI_PORT`. Production backend serves built UI from `dist`; Vite development proxies `/api` to the backend. No remote hosting or third-party application integrations.
- `npm run dev` starts Vite, backend, and worker through a JavaScript launcher. `npm start` runs built UI/backend/worker. Closing a browser does not stop jobs. Backend and worker are separate processes; worker reconnection is observable.
- Runtime data resides in `.mari/` (Git-ignored, permissions restricted): SQLite, artifacts, dedicated browser profiles, and an internal worker credential. No credentials are placed in frontend source.

## Module contracts

Root creates `server/store.js`, `server/security.js`, `server/events.js`, `shared/constants.js`, and the launch/package integration. Backend owns `server/index.js`, `server/projects.js`, `server/artifacts.js`, `server/routes.js`, `server/discovery.js`. Worker owns `worker/index.js`, `worker/services.js`, `worker/capture.js`, `worker/codex.js`, `worker/workflow.js`. Frontend owns `src/`, `index.html`, Vite/Tailwind/shadcn setup. UI consumes the HTTP contracts below rather than the database.

Shared store exports `createStore(dataDir)` returning synchronous `get(collection,id)`, `list(collection)`, `put(collection,record)`, `remove(collection,id)`, `update(collection,id,patch)`, `event(event)`, `events({projectId,taskId,source,after,limit,query})`, `close()`. Records are JSON in SQLite tables keyed by collection and id, with timestamps. `update` merges patches. `event` assigns monotonic numeric `id` and server timestamp. Collections are `projects`, `services`, `tasks`, `jobs`, `agents`, `workers`, `artifacts`, `approvals`, `requests`, `settings`. Store exports `id(prefix)`, `now()`. All persisted output is redacted first.

`server/security.js` exports `createRedactor(values=[])` returning `{add(values),redact(value)}`, `safeChildEnv(extra={})`, `ensureInside(root,target)`, `validateHttpUrl(value)`. Child Codex environments strip API keys, application session/internal tokens, and unrelated secrets. Service environments may load explicitly configured env files server-side; values are added to redaction before execution. Commands containing values are shown redacted. Complete output lines are buffered before redaction; partial lines are bounded and flushed through redaction on exit. Pattern redaction supplements known values. Raw unredacted logs are never stored or downloaded.

`shared/constants.js` exports `DEFAULT_DESIGN_PROMPT`, `IMPLEMENTATION_PROMPT`, `VIEWPORTS` (`desktop:{width:1440,height:900}`, `mobile:{width:390,height:844}`), `STAGES`, `TASK_STATUSES`. Application code remains plain JavaScript.

## Data model

- Project: `id,name,path,framework,packageManager,scripts,git:{branch,dirty,available},designBrief,createdAt,updatedAt`. Path is canonical, unique. UI project views include services and associated tasks. Missing Git information is unknown, not clean.
- Service: `id,projectId,name,command,cwd,envFile,url,port,required,configVersion,confirmedVersion,status,ownership,pid,pgid,startTicks,bootId,startedAt,lastProbeAt,lastError,exitCode`. `status` is stopped/starting/running/stopping/failed/unknown; `ownership` is managed/external/none/unknown. Secrets are excluded from this record.
- Task: `id,projectId,name,instruction,status,phase,routes,viewports,mode,steps,artifactIds,activeArtifactId,approvedArtifactId,startedAt,finishedAt,lastActivityAt,error,verificationPasses,changedFiles`. Status queued/running/awaiting_input/awaiting_approval/paused/completed/failed/cancelled. Steps have queued/running/completed/failed/skipped states and factual item counts.
- Job: `id,type,projectId,taskId,serviceId,payload,status,cancelRequested,workerId,createdAt,startedAt,finishedAt,error`. One worker is the queue owner; one AI turn at a time, service supervision continues independently. Completed steps are never automatically replayed.
- Artifact: `id,projectId,taskId,kind,revision,page,viewport,path,mime,width,height,sha256,title,capturedAt,createdAt,metadata`. Path is server-only; browser receives a controlled content URL. Kinds original/fullpage/proposal/implemented/report. Image hash binds approval. Proposal revision is scoped to page and viewport.
- Approval: `id,taskId,artifactId,sha256,page,viewport,revision,decision,notes,actor:'user',createdAt`. Only authenticated browser user actions create these. Worker has no approval endpoint. Implement is a separate action.
- Worker: `id,name,status,pid,lastHeartbeatAt,startedAt,error`; online within 8 seconds of heartbeat, reconnecting at 8–20 seconds, offline after 20 seconds. Agent: `id,name,role,workerId,taskId,projectId,status,phase,action,currentCommand,startedAt,lastActivityAt,error,threadId,turnId`. No agent is shown connected without a corresponding connected process or active worker executor.
- Event: `id,at,source,projectId,serviceId,taskId,agentId,type,level,message,data`. Sources service/agent/browser/system. Commands include cwd, start/end time, exit code, stdout/stderr channel where available. Reasoning content is discarded.

## HTTP contract

All paths start `/api`. JSON errors are `{error,code,details?}` with meaningful HTTP codes. Mutation endpoints require a same-origin owner session and CSRF header from bootstrap. Bind loopback; reject foreign Origin and Host, permit configured loopback Vite origin during development. Backend creates an unpredictable in-memory owner access key at launch and prints a one-time pairing URL to the owner's terminal; it is not stored in SQLite or inherited by Codex. `POST /session` exchanges that key for an HttpOnly SameSite=Strict cookie. Bootstrap requires this session; it must never grant authority to arbitrary localhost clients. The browser removes the access key from its URL after exchange. Internal worker authority never grants user approval authority. Codex command network is disabled and its sandbox cannot write the database; same-user unsandboxed malicious code is outside this local application's security boundary. Artifacts are owner-session protected.

| Method/path | Request / behavior |
| --- | --- |
| POST `/session` | `{accessKey}` owner pairing; constant-time key check, issue session cookie; no worker credential accepted. |
| GET `/bootstrap` | `{projects,services,tasks,jobs,agents,workers,artifacts,requests,events,capabilities,csrfToken,selectedProjectId}`; reconcile worker freshness. |
| GET `/events` | SSE replay/poll from numeric `after`, source/project/task filters; named `event` entries. |
| GET `/logs` | Filter source/project/task/query; optional `download=1`, only redacted records. |
| GET `/directories?path=` | Explicitly requested directory children for a directory picker; no background project discovery or file contents. |
| POST `/projects` | `{path,name?}` canonical registration and detection; no scripts executed. |
| POST `/projects/discover` | `{path}` explicit root; max depth 3 / 500 directories, skip dependencies and VCS, no symlink traversal outside root; returns candidates, does not register automatically. |
| PATCH `/projects/:id` | `{name?,designBrief?}`. |
| POST `/projects/:id/select` | Persist current selection. |
| POST `/projects/:id/refresh` | Refresh detection, Git and externally reachable services. |
| DELETE `/projects/:id` | Allowed only after owned services stopped; keep historical artifacts/tasks. |
| POST `/projects/:id/services` | Save a service config. |
| PATCH `/services/:id` | Update config; increment config version; do not restart running process implicitly. |
| POST `/services/:id/:action` | start/stop/restart; start requires `{confirmedVersion}` matching current version. Reject duplicates and occupied ports. Enqueues real worker job. |
| POST `/projects/:id/routes` | Bounded same-origin inventory from source routes, sitemap, navigation; max 20 routes, dedupe fragments/queries. |
| POST `/tasks` | `{projectId,instruction,routes?,viewports?,mode?,intent?}`; intent capture/design; natural commands resolve conservatively, ambiguous input creates awaiting_input with explanation. Capture requires an explicitly configured reachable URL. |
| POST `/tasks/:id/action` | `{action,feedback?,mode?,artifactId?}`; action generate/revise/reject/approve/implement/verify/cancel/retry/resume/accept. Approve/reject scope exact artifact ID and hash. Implement separately verifies unchanged approved image, page, project and task. Cancellation never stops project services. |
| POST `/tasks/:id/proposals` | Multipart image + `page,viewport,notes`; validate max 25 MiB, PNG/JPEG/WebP and decode; create next revision, invalidate prior current-revision approval. |
| GET `/artifacts/:id/content` | Validated owned artifact stream; no arbitrary path reads. |
| GET `/tasks/:id/handoff` | Downloadable JSON/text prompt + metadata and screenshot URL; explicitly manual ChatGPT handoff. |
| POST `/requests/:id/respond` | User response to real Codex command/file/input request; persist exact request ID correlation. |
| POST `/browser/login` | Project URL, open dedicated headed persistent browser profile; user signs in locally, close to resume; credentials never leave profile. |

Bootstrap derives capability labels from observed worker/Codex state: built-in unverified/verified/unavailable and manual handoff available. No optimistic connected agents or working integrations from empty database seeds.

## Project detection and service supervisor

Read `package.json` and lockfile names to suggest npm/pnpm/yarn/bun scripts; recognize Next, Vite, Astro, SvelteKit, Nuxt and common Python/Rust/Go manifests. Other frameworks use explicit user commands. Do not assume a port; user reviews command, cwd, env-file path and expected URL before first execution and after config changes. Preserve multiple independently configured services, each with its own output and controls.

Worker spawns a dedicated Linux process group per service with explicit cwd and environment. Save PID, group, `/proc` start ticks and boot identity. Prevent duplicate start both at API and supervisor. If expected URL/port is occupied before start, report external/occupied and offer using that URL for capture, never ownership or Stop. A managed process is running only while its identity is alive and configured HTTP readiness succeeds. Retry probes every second for at most 45 seconds; a timeout records failure and offers logs/correction. Process exit records actual code and failure; HTTP loss changes status honestly even if process remains alive.

Only terminate a group whose ownership can be validated; TERM, wait up to 5 seconds, then KILL verified remaining members. Track descendant identities before termination; PID reuse or uncertain ownership means unknown and no signal. No `killall`, broad port-based kills, or termination of user terminals. Worker restart reconciles stored identities; uncertain survivors remain unknown for user inspection. API restart does not kill worker services. Worker shutdown stops its verified managed children intentionally and records it; unexpected worker death is recovered conservatively.

## Capture, route inventory, and handoff

Playwright uses installed Chrome. Capture only selected same-origin HTTP(S) routes with at most 20 paths and two requested viewport classes, one page at a time. Drop credentials, fragments and unbounded query combinations. Validate final navigation origin. Timeout 30 seconds per page; wait DOM content and fonts with bounded settle; report readiness/capture errors per item and continue batch. Save viewport and full-page screenshots, title, timestamp, route, dimensions, status and error. Captured content is untrusted data, never instructions to agents. Dedicated login profiles stay backend-only.

Design prompt is editable; store the user's original default prompt verbatim from the brief plus shared project design brief. Manual handoff exposes screenshot and prompt for the user's own ChatGPT conversation, then actual image upload. Never call undocumented endpoints, copy browser tokens, or pretend to read ChatGPT conversations.

## Codex integration and approval

Use installed `codex app-server` private stdio with forced ChatGPT authentication; `account/read` must return `chatgpt`. Strip API-key variables from child env and do not implement an API fallback. Usage limits pause the job with the real error and retry controls. Generate JSON schemas only, no TypeScript bindings. Persist protocol correlation IDs. Initial integration is 0.160.0; check installed version and fail visibly for unsupported protocol shapes.

Initialize, start/resume thread, start turn, stream observable item/command/tool/file events, interrupt turn for cancellation, and persist completion. Ignore reasoning transcripts and unsupported numeric progress. Expose real command/file approval and input requests with user response controls; decline unsupported tools rather than granting broad authority.

Proposal uses a new thread with cwd and only writable root equal to its artifact directory, no target-project write access; use supported workspaceWrite sandbox fields with temp exclusion and command network disabled. Attach screenshot and shared design brief. Implementation uses a different thread in the target project only after exact image approval and explicit Implement. Never reuse a writable implementation thread for new proposals. Do not grant unstable `grantRoot` or accept-for-session permissions as the design gate.

An imageGeneration event is not itself a proposal: result is opaque and savedPath optional. Require a real, regular, decodable image under the job artifacts or native Codex generated-image root; canonicalize paths, cap at 25 MiB, copy into owned immutable revision storage and hash. Only then set built-in mode verified and task awaiting_approval. Otherwise show the real error and manual handoff option. Never substitute written suggestions or code for the required image.

Implementation attaches original and exact approved image with the full implementation instruction from the brief. Record initial Git status/diffs, respect uncommitted files, never reset/commit/deploy. Track changed files and checks from actual protocol/diff data. Capture same route/viewport after implementation. Up to two verification passes total: first inspect desktop/mobile together, one correction batch if needed, final confirmation; remaining differences are reported for user decision. User acceptance completes review. A live generated proposal for the demo must wait for the user's own image approval; tests may use explicitly identified fixture approvals, never self-approve a real proposal.

## Interface direction

Mode: Operate. Home follows approved comp at 1676×938: compact full-width header, three upper panels (project overview / Mari core / live activity), middle agents and workflow, lower projects/artifacts/execution, bottom command strip. No sidebar. Use flat dark blue-charcoal fills, restrained cyan linework, readable neutral text, narrow uppercase section labels, consistent small radii, simple outline icons. Core is a quiet static vector or canvas technical identity, not glossy or glowing and never an activity simulation. No invented stats or integrations. Empty state shows no project/worker truthfully and a useful Add project / Use demo action.

Project manager expands inline to search, register, discover, configure services and view failures. Selecting any project/agent/task updates context without navigation. Selecting a task/artifact replaces the core/home grid with a dominant comparison workspace, keeping header, compact worker/task strip and command input. Compare original/proposal/implemented, zoom/full-size, revise/reject/approve, then explicit Implement, with revision-specific status. Logs have source filters, search, download, and scroll-pause. Agent inspector shows instruction/scope, timeline, command/cwd, output/errors, files and artifacts, elapsed and last activity, cancel/retry/resume.

Use official shadcn Button, Input, Textarea, Select/Combobox, Dialog, Tabs, Badge, Tooltip, ScrollArea, Separator, Collapsible, AlertDialog as appropriate, installed through CLI. Preserve semantic table/form controls, keyboard focus, labels, focus restoration and accessible status text. Motion only small state transitions (150–200ms), reduced-motion respected. At 1280px compact columns remain legible; tablet stacks to two columns; 390px one column, command wraps and no global horizontal overflow. Project tables may scroll inside their own container.

## Delivery and validation

1. Real project registration/service start-stop-health/logs, plus isolated two-service demo. Verify duplicate starts, occupied external port, descendant shutdown, process identity and secret redaction.
2. Real persistent worker heartbeat/jobs/events and capture → actual image generation or labeled manual handoff before large interface expansion.
3. Full chosen interface, contextual project and agent inspectors, immutable proposal import/revision/approval, explicit approved implementation and verification.
4. Bounded route discovery/batches and interrupted-stage retry/resume within same pipeline.

Use Node built-in tests for consequential service ownership, redaction, route bounds, immutable approval and jobs; HTTP integration tests for CSRF/path/import/action boundaries. Run production build and JavaScript-only scan. Test actual demo start, readiness and browser capture. Exercise built-in subscription generation once when available and leave real image approval to user. Validate UI in one batched desktop/mobile browser pass, fix material defects together, confirm once. Independent final code/design review checks observed evidence; document untested limits precisely. No automatic commit/merge/deploy.
