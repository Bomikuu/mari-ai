# Media code review — 2026-11-07

**Result: no unresolved material finding in the source revisions identified below.** The reviewer reread affected source after fixes and exercised the relevant regressions. This is a source and boundary review; the Brag implementation owner handles the real subscribed composition/render and inspection of its actual frames separately. This document does not claim that the reviewer generated or visually approved that MP4.

Scope: `server/brag.js`, `worker/brag.js`, `server/voice.js`, `worker/voice.js`, the private artifact route, queue dispatch/cancellation, shared redaction, the Brag-only native Codex execution policy, and the media UI/API contract. Reviewed against `docs/specs/2026-11-07-media-integrations.md` and `docs/research/2026-11-07-brag-review.md`. The existing Graphify map was queried first; current source supplied the implementation evidence.

## Proven findings resolved during review

| Finding | Reproduction and effect | Resolution verified |
| --- | --- | --- |
| Renderer descendant survives when its leader exits first | A dedicated synthetic Node parent spawned a same-group child that ignored SIGTERM. The original wrapper rejected on timeout and cleared its escalation timer when the parent exited. The identified child remained alive beyond the three-second hard deadline. Only the identified test child was cleaned up. | `runBragProcess` now records Linux process identities, tracks owned descendants, verifies identities before signaling, and awaits escalation after leader exit. Both the ignoring-leader and leader-exits-first regressions pass. The renderer also uses a separate PID namespace. |
| Quoted credential keys leak into the curated snapshot | A synthetic `config.js` containing `{"apiKey": "synthetic-review-only-credential-73819"}` was copied with the value intact because the old redactor did not handle the closing quote before the colon. | Shared redaction handles quoted keys. The snapshot regression proves quoted `apiKey` and `access_token` values are absent, while ordinary source remains available. Secret filenames, customer directories, symlinks, package scripts and target-overlap rejection are also covered. |
| Native restricted-profile startup compatibility | Actual app-server startup rejected a named `[permissions]` profile without `default_permissions`. A quoted CLI dotted MCP key created a separate literal quoted server entry and failed with `invalid transport`; a partial override also failed against the real user configuration. | The generated arguments set `default_permissions="mari_media"` and replace each validated MCP entry with a disabled `/bin/false` stub, carrying no original command or credentials. The regression seeds the enabled synthetic server from a config file layer. Actual local app-server startup, profile selection and command execution pass. |
| Writable credits file bypasses the agent read boundary | A late finalization refactor directly read `output/credits.txt` in the host and subsequently used its contents in public attribution/copy. The agent can write that path, including replacing it with a symlink, so a bounded read still crossed the intended host file boundary. This was identified directly in the new source; no real private file was read. | Finalization now uses the fixed module `BRAG_CREDITS` constant. The mutable credits-file host read has been removed, also preserving the required music attribution. The final helper was reread after this fix. |
| Host media finalization could follow precreated output symlinks | Poster extraction and baking originally invoked host FFmpeg with output paths writable by the composition agent. A precreated output symlink could therefore be followed before final artifact ownership validation. The implementation owner identified this source-level issue; no external file was modified to demonstrate it. | FFprobe, full decode, poster extraction and baking now run through the same filesystem/network/PID sandbox as rendering. The host receives validated owned files. The shared sandbox and all four production call paths were reread after the change. |

## Verified boundaries

- Brag passes a canonical, unique owned run directory and the five explicit skill directories to an optional native execution policy. The native permissions profile grants only minimal system reads, installed executable/helper reads, those explicit read roots and the run's write root. Brag disables network access for execution tools, web search, connected apps, custom MCP servers, plugins, hooks and browser/computer tools. Ordinary Codex workflows retain their existing policy.
- The installed Codex 0.160.0 experimental schema supports `thread/start.permissions`, `thread/resume.permissions`, `turn/start.permissions`, and `command/exec.permissionProfile`. The tests check that the restricted policy is not sent together with the legacy sandbox fields.
- A real local app-server test uses an isolated credential-free Codex home, closed loopback provider/discovery endpoints, no model turn or inference, and synthetic MCP metadata. It verifies that the native profile denies a neighboring file and a private file beside the helper directory, permits an owned run write/read, disables the relevant features/MCP server, and accepts `thread/start` with the named profile. Nesting a second outer bubblewrap namespace prevented native sandbox creation on this host; the final test exercises the native sandbox directly.
- Rendering and media finalization unshare network/PID namespaces, hide `/home`, `/root`, `/run` and `/tmp`, restore the selected local runtimes read-only, and make only the run/cache/config directories writable. Telemetry, update checks and automatic skill installation are disabled in the child environment. Successful command exit allows bounded natural descendant teardown, then verified cleanup; timeout/cancellation still fail the stage.
- The worker rechecks ready service/project scope, captures the actual configured website in a fresh Firefox context, masks explicit private fields, preserves the capture hash, and requires the composition to reference that asset. The source does not substitute a generated UI image for this capture.
- A completed video requires an owned regular bounded MP4, H.264 video, requested landscape/portrait dimensions, appropriate duration, an audio stream and successful FFmpeg decode. The final file is validated again after poster baking. A final synchronous cancellation/project gate precedes artifact commits.
- Voice uses the fixed loopback endpoint, validated presets/speed/text and bounded validated WAV output. Startup/stop uses recorded Linux process identity rather than killing by port; an external service is distinguished and preserved. The private artifact route requires the owner session, rejects escaped/symlink paths and supports byte ranges. The media UI uses explicit generation/cancellation and manual playback.

## Validation performed by this reviewer

`node --test tests/brag.test.js tests/codex-isolation.test.js`: **14 passed** after the final source changes. Coverage includes check-error parsing, file-layer MCP stub isolation and successful-command descendant cleanup, in addition to the earlier cancellation and snapshot regressions.

`node --test tests/brag.test.js tests/voice.test.js tests/media-worker.test.js`: **20 passed** before the additional check-error regression was added; the unchanged voice and worker cancellation tests passed. No app browser, external website, remote model inference or real credential contents were used by this reviewer. Temporary test processes/files were confined to reviewer-owned fixtures.

## Final reviewed SHA-256 identities

| File | SHA-256 |
| --- | --- |
| `server/brag.js` | `4135707e9c308f10b41eca7d6bd731df276ee02c77d317d18c6f8eb124ad2d80` |
| `worker/brag.js` | `c5252661f1264e1ad2b3b24f9f59507a56263c666133badadf6133b02647a9b1` |
| `server/voice.js` | `b299dde9ec82bef0b66a5ff17edf86028a2ea9143e809f1a0b7f74ae2078398d` |
| `worker/voice.js` | `7d831ea586db720af6f13a6779cf7f8143a9bad5f029bace087777d2061741e7` |
| `server/index.js` | `42938125b956cf17c3d580c6bb16c4e79c7a818306463e321ad2a754d9edbdb4` |
| `worker/index.js` | `26a84851cae56db791204f4fa2b6217361fcf2dfe04b564b5b2937f258061ac4` |
| `worker/codex.js` | `8e5ff209526ab7dd0d0811a296741223089627653cbfae0457f9030e8fd4cd38` |
| `server/security.js` | `a382bd386e04d35076b454bffef9d02dfa4b2c9fb41b18292e3f6d5132d2b546` |
| `server/artifacts.js` | `755cec981960ba455ec63f923b06aec02e804969d91ec773eeeb472ca836b97b` |
| `worker/workflow.js` | `270b2e2f0565226d6a631bb80f0a8fa70774b66d9d96bbf411e8a483d673b746` |
| `src/components/MediaWorkspace.jsx` | `bcc9616539152dbd044ab1a0867f5512c487dbdb125227dcbed831a8eeca9173` |
| `tests/codex-isolation.test.js` | `bc6d85fc1967f5b82a7671795b0bddf407bf7c852f648646920ed690ebe03ef7` |
| `tests/brag.test.js` | `ffb12a556622c1da4207899365b939b3e60ca003947254135fd267757743ad32` |
| `tests/voice.test.js` | `fe244f1ad2d0da7c77d66b3d5978e4eeee18397f16b9f3f65fa44ec83ac20e49` |
| `tests/media-worker.test.js` | `42c6c6bfb7fec34c539755271b45e30807d1d13b57e62132a50c08db28b7846a` |

After the code review, the finish review changed two UI strings only: Hyperframes version attribution and the historical-action prefix. The final UI identity is recorded by the finish review and final graph; backend/security code remains at the reviewed hashes above.
