# Local media integration verification

Per-project Brag generation and local VoiceStudio speech are implemented. The original target-site image-approval workflow remains backend enforced; no target-site implementation or approval occurred during this work.

## Real video

The synthetic Field Notes fixture was captured in Firefox. Native ChatGPT-authenticated Codex authored its Brag composition. Hyperframes 0.9.19 rendered locally inside the restricted PID/network/filesystem namespace. The final MP4 is 15.000 seconds, 1280×720, H.264 with AAC music, 726,085 bytes. FFprobe and full decoding passed after poster baking; the actual settled product frame at 5.2 seconds was used as the poster and frame zero. The final layout gate had zero errors and 21 successful contrast checks.

Initial check-error reporting obscured the actionable lint finding. That host bug was fixed, and the existing native thread corrected the actual finding. A successful-render process teardown race was also fixed and regression tested. The original owned run was finalized and validated; no hardcoded substitute or second invented result was used. The installation document records these failures and corrections.

Saved demonstration: `docs/evidence/media/field-notes.mp4`, poster `.jpg`, credits/share copy `.txt`, and `provenance.json`. Music is Sascha Ende, ende.app, CC BY 4.0; source/license links and modification credit are in the copy. Native proof records remain in `~/.local/share/mari-ai/brag-proof-20261107/`. The demo fixture is synthetic; it is not a claim that an existing user application was changed.

## Real voice and owned lifecycle

VoiceStudio 0.5.7 with cached KittenTTS Mini 0.8 generated actual audio through Mari's worker queue. Default preset Bella `expr-voice-2-f`, speed 0.95, spoke “Hello. I am Mari. I will wait for your instruction.” The saved WAV is 6.3965 seconds, 24 kHz mono PCM16. It is synthetic; speed/preset approximate calm delivery, and this engine has no acting/emotion control.

Mari started the loopback CPU backend, verified readiness, synthesized, and stopped its verified process on normal shutdown. The Firefox UI separately started it, generated and manually played another sample, then stopped it. External processes were not adopted or terminated. Cancelling a speech request discards its result; the shared upstream engine may finish its computation. The WAV demonstration is `docs/evidence/media/mari-voice.wav`.

## Automated and browser checks

- Final full `npm test`: **126 passed, zero failed/skipped**. Includes actual Firefox capture/login cancellation and credential-free native Codex read-isolation probes, plus process descendants, durable cancellation, settings/deduplication, source secrets/symlinks, decode validation and private byte-range media delivery.
- Final `npm run build`: passed. The pre-existing Three.js chunk-size advisory remains.
- Firefox first batch: ten desktop/mobile/light/dark states, no JavaScript errors or document overflow. Real MP4 and WAV metadata decoded and playback time advanced after explicit play. Project switching hid another project's output; stopped projects could not generate. Owned voice start/stop and factual status-text preparation passed.
- One correction batch fixed exactly two factual labels: Hyperframes version attribution and historical activity. Eight desktop/mobile/theme captures confirmed both changes, with no JavaScript errors or overflow. First evidence is archived in `.impeccable/review/media/round-1`; final captures/checks occupy `.impeccable/review/media`.
- Independent code review and separate fresh visual finish review are recorded in `2026-11-07-media-code-review.md` and `../design/media-finish-review.md`. No additional polish round is planned.

## Boundaries and operation

Brag's dedicated native profile restricts filesystem reads/writes, disables connected apps/custom MCP/hooks/browser/search tools for the composition turn, and keeps subscription authentication. Actual native probes verified denied neighboring-file reads and permitted owned writes. Renderer, FFprobe, decoding and poster generation run with host home directories hidden and egress disabled. Credentials/env files and the original project are excluded from the curated snapshot. Optional vulnerable Python audio analysis, hosted media, cloud rendering, publishing and paid-provider fallbacks remain unused.

Start Mari normally with `npm start` after building. Choose a project and Create video, or open Voice and Start VoiceStudio. This verification used an isolated temporary Mari data directory; it did not add QA projects or artifacts to the user's saved project database. Temporary QA browsers and owned servers are stopped at handoff. Installed runtimes, model, skills and demonstration evidence are retained.

Handoff cleanup confirmed: owned QA listeners on ports 4311, 46795 and 3900 are closed; the validated temporary Mari data directory was removed. The retained user-local installation has no service/autostart entry.
