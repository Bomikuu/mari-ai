# Knowledge and phone access finish review

Reviewed 2026-11-07, Asia/Manila. Fresh read-only application review using the approved knowledge/phone specification, implementation plan, PRODUCT.md, DESIGN.md, `.impeccable/surfaces/knowledge-access.md` and the Impeccable craft floor. Only this report was written. Isolated reproductions used temporary synthetic stores and injected APIs, then removed their runtime directories. No browser, real account read, model inference or Telegram send was launched for this review.

## Disposition

**SHIP the scoped implementation.** All three material findings from the initial pass are resolved in the frozen correction batch. Current consent and pairing identity now gate delivery, obsolete in-flight attempts remain uncertain, and cache/capture provenance is inspectable with full Manila dates. There are no remaining material findings from this review. No visual rebuild or further recapture is needed.

The ten final screenshots are valid synthetic Firefox layout evidence, including a deliberately older cached source. They are not evidence that real Drive document parsing or live Telegram delivery works. Keep that distinction in the final handoff. Live Telegram remains unconfigured until the user supplies a dedicated bot token and confirms the private pairing.

| Initial finding | Final score | Verification |
| --- | --- | --- |
| P1: revoked notifications still send | **Resolved** | Current consent is checked at atomic delivery claim and after the request; settings changes cancel pending notifications and invalidate in-flight attempts. |
| P1: replaced pairing leaves the old binding active | **Resolved** | Pairing identity gates goal ownership, bridge validity, delivery and the abort watcher. Obsolete sends remain uncertain. |
| P2: cache age/captured provenance not inspectable | **Resolved** | Full local dates, captured source scope/link/revision and saved/fetched/modified dates are visible; final aged-cache captures inspected. |

## Initial material findings and their resolution

The reproductions and locations below document the initial defects. Resolution notes refer to the final corrected source.

### [P1] Revoked notifications still leave the outbox

Initial locations: `server/telegram.js:45`, `worker/telegram.js:95–100`; related queue creation at `worker/telegram.js:63–69`.

Saving `notifications: false` prevents collection of new goal notifications, but the delivery loop accepts every pending record for the current generation regardless of the current notification settings. A previously queued or rate-limited team/attention message therefore still sends after the owner disables notifications. The same underlying issue applies when the owner disables notifications for goals started in Mari after such a message has already been queued.

Deterministic isolated reproduction:

1. Create a synthetic enabled, paired state with `notifications: true`, private credentials and the worker lease.
2. Queue one `kind: "team"` status message through `queueTelegramMessage`.
3. Save `notifications: false` before running the bridge tick.
4. Inject an empty `getUpdates` response and a successful `sendMessage` response.

Observed result: `{"notifications":false,"sends":1,"outboxStatus":"delivered"}`. There was no real network request.

Required correction: retain enough origin/consent metadata on notification records to distinguish phone goals, other Mari goals, attention notifications and explicit command/pairing replies. Check the current consent immediately before sending, cancel notifications that lost authorization, and account for a setting change while a request is in flight. Do not automatically turn an uncertain previous send into a replay.

**Resolved.** `server/telegram.js:11–22` now validates generation, pairing identity, chat and notification consent, records `bindingId` / `consentScope`, and revokes pending or sending records when permission changes. Settings save invokes revocation at `server/telegram.js:53`. Collection labels phone versus all-goal consent at `worker/telegram.js:68–69`; atomic delivery claim, post-response validation and the watcher enforce it at `worker/telegram.js:97–110`. Explicit command and pairing replies remain distinct from optional notifications. The regression that previously observed one send now expects zero sends and a cancelled record; a separate test verifies all-goal opt-out while preserving command replies.

### [P1] A newly paired private user does not invalidate the old binding

Initial locations: `server/telegram.js:47–50`, `worker/telegram.js:83`, `worker/telegram.js:97–100`, `worker/telegram.js:107`.

Browser confirmation replaces `paired` without changing the connection generation. The bridge validity function and abort watcher compare the generation, enabled state and worker lease, but do not compare the paired-user binding. A send begun for the old private user continues after the owner confirms a different user and can be recorded as delivered while the new user is current.

Deterministic isolated reproduction:

1. Begin sending a synthetic pending status to chat `42`; pause the injected send promise and retain its abort signal.
2. Replace the paired state with chat `99`, preserving the same connection generation, as the confirmation route does.
3. Allow 230 ms for the 200 ms abort watcher to run.
4. Resolve the injected API response with a successful message identifier.

Observed result: `{"aborted":false,"status":"delivered","sentTo":"42","currentPaired":"99"}`. There was no real network request.

Required correction: give the pairing a binding/version identity and capture/check it for polling, goal acceptance and delivery, including the abort watcher and post-request state update. Keep connection/goal ownership identities deliberate so changing a pair does not accidentally grant the new user cancellation access to the old user's goals. A request already dispatched to Telegram cannot be recalled; aborting and recording uncertainty must preserve that fact.

**Resolved.** The exact confirmed candidate's `paired.id` serves as the binding identity. Re-pair confirmation revokes obsolete deliveries at `server/telegram.js:57–59`. `worker/telegram.js:9–12` includes that identity in team ownership and handler binding validation, and the goal origin persists it at line 57. The bridge captures it at line 82, validates it at line 83 and aborts when it changes at line 110. Delivery success requires the attempt still to be authorized, un-aborted and sending; otherwise it becomes uncertain at lines 99–102. The paused-send regression now observes an aborted signal and an uncertain old record even when the injected request subsequently returns a successful identifier. The new private user does not inherit ownership of goals from the old pairing.

### [P2] Cache age and captured source provenance are not fully inspectable

Initial locations: `src/components/KnowledgeWorkspace.jsx:17`, `src/components/KnowledgeWorkspace.jsx:56`, `src/components/KnowledgeWorkspace.jsx:61–62`, `src/components/AgentChatWorkspace.jsx:95`; `src/lib/api.js:29–30` supplies the time-only formatter.

Knowledge dates render only a time of day. A document imported last month looks the same as one imported today at the same time. The context inspector shows capture time, title, abbreviated revision, excerpt and stale/truncated flags, but omits the saved source URL, source scope and source fetch/update date. The data exists in the captured context; the inspection UI does not expose it. This weakens the surface's central promise that scope and freshness are visible when deciding what an agent relied on.

Reproduction is static and deterministic: pass timestamps separated by days to `SourceDate`, or inspect a captured Drive source with distinct `fetchedAt` and `capturedAt`; the UI displays the time-only capture and no source-age/link/scope details. The supplied fixtures are all same-day content, so those captures do not establish aged-cache readability.

Required correction: use a local date-and-time representation for knowledge freshness and captures, expose source scope and the original fetch/update date in the inspector, and provide the captured source URL when available. Preserve the captured metadata rather than looking it up from a later edited document. A semantic `time` element with the full timestamp is suitable. This does not require changing unrelated application timestamps.

**Resolved.** `src/lib/knowledge-format.js:1–6` provides a dedicated Asia/Manila date/time formatter with honest missing/invalid fallbacks. Knowledge's `SourceDate` now emits a semantic `time` element at `src/components/KnowledgeWorkspace.jsx:18`. The captured inspector at `src/components/AgentChatWorkspace.jsx:96` shows source scope, complete revision, source link and captured/saved/fetched/modified dates. `server/knowledge.js:50` captures modified provenance alongside existing immutable source metadata. Final Drive captures show the Nov 4 import against the Nov 7 connection/search date and retain the explicit stale/error explanation. The captured inspector shows Nov 7 capture, Nov 4 fetch and Nov 3 source modification. The formatter regression distinguishes those dates. All ten overwritten captures were opened in the correction review; no clipping, overflow or new composition issue was observed.

## Correctness and security assessment

The following inspected mechanisms support the approved architecture:

- Knowledge selection separates Personal from each Project and includes Shared only after explicit owner selection. Disabled items are excluded. Capture bounds are eight sources, 12,000 excerpt characters total and 4,000 per source, with persisted revisions, source dates and truncation flags. Queued direct work retains its capture on retry; team planning, specialists and synthesis inherit the same stored goal context.
- Notes are validated, secret-filtered and mirrored as private Markdown under a checked canonical runtime path. The mirror rejects symlink escape. Owner session and CSRF middleware protect the knowledge and Telegram routes.
- Drive uses the installed native ChatGPT-authenticated app, verifies read-only tool annotations and exact allowed names, and invokes only `google_drive.search` / `google_drive.fetch`. Search is metadata-only with a 20-result bound and opaque provider cursors. Import requires an explicitly selected valid Google file URL. Imported text starts disabled; refresh preserves current owner scope/enabled settings. Errors retain old text with stale provenance, and raw connector output is excluded from application events.
- Agent turns receive excerpts as untrusted reference data under explicit developer boundaries. Native connected apps, hooks and browser tools remain disabled in the restricted agent executor. Website implementation and design approval retain their existing independent workflow.
- Telegram credentials use an atomic private 0600 file and no-follow bounded reads. The API has fixed HTTPS methods, abortable bounded requests and generic errors that omit token-bearing URLs. Existing webhooks are rejected without deletion.
- Pairing uses a short-lived secret and exact displayed candidate identifier, with explicit browser confirmation. Group/channel, foreign, forwarded and bot commands are rejected. Incoming goal creation and receipt persistence share a transaction, including a second binding/scope check after asynchronous preparation. Cancellation is limited to active goals owned by the originating phone connection/chat and does not stop project services.
- The bridge runs separately from agent/service jobs, follows the worker lease, stops polling/sending after disconnect/generation/pairing replacement, and shuts down through the worker's owned lifecycle. Delivery ambiguity is durable, never automatically replayed, and explicit retry communicates duplication risk. Goal completion/failure/input notifications derive from saved goal/request state and contain bounded metadata rather than note/document/result bodies. Delivery now rechecks current notification consent and pairing identity, including after an in-flight attempt.

## Craft and evidence validity

Opened all ten required captures: memory dark desktop / light mobile; Drive light desktop / dark mobile; Telegram setup dark desktop / mobile; pairing dark desktop; connected dark desktop / light mobile; captured knowledge light desktop.

The extension is coherent with Mari's settled Operate system: Inter hierarchy, matte surfaces, semantic light/midnight colors, flat divided rows, quiet status labels, inline companion editing and existing official controls. It introduces no new graphic identity, raster, ornamental motion or persistent sidebar. Desktop separates editing and pairing work clearly; mobile stacks forms while retaining scope, context enablement, save, disconnect and notification controls. Long source text wraps. The destructive local removal uses a focused confirmation; token entry is password-only, cleared after connection attempts and never prefilled. The captured-context disclosure is discoverable inside the established Activity inspector.

No material clipping, overlap or composition defect is visible in the ten captures. `checks.json` records Firefox at 1440 and 390 CSS pixels with equal viewport/scroll widths, no JavaScript errors, and actual route/worker interactions against isolated synthetic account/bot/model fixtures. It covers note create/edit/export, bounded Drive search/import/pin, candidate confirmation, phone goal capture and context inspection. “Sent” in these synthetic screenshots represents an injected successful API response, not a real human-message delivery.

The final recorded full suite reports **205 passed, zero failed/cancelled/skipped**, including nine knowledge and fifteen Telegram tests. The final focused evidence records 24 passing checks. The Vite production build succeeded; the existing large lazy globe chunk warning is not introduced by this extension. These are recorded run results, not an additional full-suite run by this reviewer.

`output/knowledge-review-regressions-before.txt` records both delivery regressions failing before the correction. The final focused suite passes them. This reviewer independently ran the four targeted tests for notification revocation, paused-send re-pairing, all-goal opt-out and source-date distinction: **four passed, zero failed/skipped**, using only isolated synthetic fixtures. The final Firefox check records `agedSourceProvenanceInspectable: true` as well as all previous interactions, no JavaScript errors and no page overflow at 1440/390 CSS pixels. The stale-cache presentation and expanded provenance are visible in the final captures, not inferred only from the test flags.

`output/knowledge-native-check.json` separately records one real ChatGPT-auth native turn that returned the synthetic saved-memory marker, plus real Drive app connectivity. It records zero Drive files read, zero Telegram messages sent and removal of the temporary runtime. This proves native memory injection and connectivity, not real document import or live phone behavior.

The JEV result is a sanitized scoped design judgment, not authentication, functionality or security proof. The detector was attempted but its launcher was denied execution; there is no successful detector result. The same launcher refusal prevented context loading for this review, so the existing project documents were read directly. No measured contrast result, keyboard/screen-reader certification, physical-device/touch validation or comprehensive accessibility score is claimed. Source labels, shared semantic controls, status/error roles and inherited focus treatment are positive implementation evidence, with runtime accessibility verification remaining bounded by those limits.

## Handoff limits

Live Telegram remains unconfigured until the user supplies a dedicated bot token and confirms the private pairing in Mari. Real Drive document reading and live Telegram polling/delivery were intentionally not exercised. No real account content or bot token appears in the review fixtures. No account write, deployment, commit, unrelated process stop or application/test change was performed by this reviewer.

The focused consent/binding recheck and final aged-cache captures close this review's findings. Reconcile the final documentation with this ship disposition while preserving the account-authorization and evidence limits above. The evidence does not call for another visual direction, recapture or polishing cycle.
