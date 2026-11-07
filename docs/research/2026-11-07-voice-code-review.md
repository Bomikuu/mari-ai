# Voice integration code review — 7 November 2026

Read-only review of `server/voice.js`, `worker/voice.js`, `tests/voice.test.js`, worker dispatch/shutdown, private artifact delivery, and the voice UI contract. App code was not changed by this review.

## Review result

No open material finding remains in the reviewed code snapshot after the following corrections.

**Resolved P2 — Durable cancellation was missed before the polling timer fired.** The original completion path checked only the AbortController, although durable cancellation is polled every 200 ms. An isolated fixture reproduced `status:"completed", cancelRequested:true` when a running voice workflow returned within 20 ms of cancellation. The worker now rereads durable cancellation before reporting success; voice synthesis also checks durable cancellation before artifact creation and after its final asynchronous write. Root added a synthesis regression; this reviewer added `tests/media-worker.test.js`, which verifies that job, agent and cancellation event are correct even when the workflow's signal was still un-aborted as it returned. Both regressions pass.

## Verified boundaries and changes

- Ten checks passed (`node --test tests/media-worker.test.js tests/voice.test.js`). They cover input bounds, fixed local API/model, preset settings, duplicate jobs, stale ownership refusal, WAV rejection, private artifact storage, authenticated media delivery and ranges, plus both durable cancellation races.
- Fixed `127.0.0.1:3900`, explicit `kittentts`, rejected redirects, request timeouts, streamed 8 MiB limit, RIFF/chunk checks, 120-second duration cap, restrictive file permissions and owner-session media access are consistent with the intended contract.
- No API credential is sent to VoiceStudio. Child environment is allowlisted; output uses line-level redaction. Playback requires the user's audio controls.
- The initial missing owned-backend shutdown cleanup was fixed during review: worker shutdown now awaits `stopVoice` when stopping services; external or stale process identities are refused. The installer-owned backend was stopped cleanly to permit root's real owned-lifecycle QA.
- In-flight HTTP cancellation cannot guarantee that the shared local synthesis engine stops CPU work; the UI accurately discloses that it may finish while the result is discarded.

Actual Mari-owned start/stop and cancellation-during-start tests remain root's coordinated integration QA. This review's tests do not prove `startVoice` process ownership or child-output drain after shutdown. No independent claim that those lifecycle cases passed is made here. Only the new regression test and this review document were changed by the reviewer; app corrections were made by root.
