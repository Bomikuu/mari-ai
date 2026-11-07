# Local video and voice

Mari adds a Brag action for every registered project, and a local synthetic voice with a cold, calm feminine delivery. These extend the existing single-page workspace and real worker queue. The user requested installation and implementation; no deployment, cloud media, automatic playback, microphone capture, or target-site edits are included.

## Video

Each project row and selected-project overview opens a Video workspace. Persist a short brief, duration (15–25 seconds), and landscape/portrait format. An explicit Generate button queues `project.brag.generate`. Require a fresh, ready configured project URL; recheck in the worker. Never start a project implicitly or execute its source scripts to inspect it.

Install the audited Brag subtree at commit `669ab9286aa28b6c3ee30e75f181ee74319d012a` and Hyperframes `0.9.19`, plus exact same-release companion skill references. Use bundled audio cues; exclude the optional vulnerable Python analyzer. Disable telemetry, update checks, automatic skill installs, cloud rendering, hosted assets, paid generation and publishing. Hyperframes requires isolated Chromium for frame rendering; links and UI QA use Firefox.

The native subscribed Codex worker creates a composition in a unique Mari-owned run directory. Give it a bounded curated source snapshot without secrets, dependencies, generated data, symlinks or user/customer records; target source is never writable. No API-model fallback. Cancellation stops this job's owned execution only. A successful result must be a bounded, nonempty MP4 validated by FFprobe with a video stream, positive dimensions and appropriate duration. Save attribution, poster, actual execution events and errors. Do not mark a plan/preview as video success. Serve video through the existing private artifact route with byte-range playback.

## Voice

Install VoiceStudio 0.5.7 outside the repo in `~/.local/share/mari-ai/tools/voicestudio`, isolated Python 3.11 CPU environment. Use loopback `127.0.0.1:3900`, KittenTTS Mini 0.8 and a feminine preset around speed 0.95. Preserve upstream model licensing metadata. No performer cloning. User explicitly accepts personal use of the model. The actual live license route reports Apache-2.0, acknowledgment not required; do not send gratuitous acceptance.

`GET /api/voice` reports installation, reachable API and real engine availability without leaking credentials. Persist only bounded preset/speed. `POST /api/voice/preview` queues `voice.synthesize`, with at most 600 characters supplied explicitly by the user. Worker calls the loopback `/v1/audio/speech` with fixed engine/model and writes validated WAV to private artifacts. Return history, truthful job status, cancellation and manual audio playback. No arbitrary URLs, model downloads, shell commands, autoplay or cloud fallback from the frontend. Provide an explicit owned start action and an external-service distinction; never stop another server by port.

## Verification

Meaningful tests cover deduplication, worker readiness, invalid inputs, source snapshot secrets/symlinks, cancellation, artifact validation, and backend errors. Perform a real short Brag render and a real local voice sample when installed. Run the whole existing test suite and production build. One Firefox desktop/mobile/theme inspection round, one material-fix confirmation at most. Finish with independent code/design review and refresh only the local application graph.
