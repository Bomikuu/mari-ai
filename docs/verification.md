# Verification evidence

2026-11-06, Asia/Manila. Application: **mari-ai personal assistant**.

## Automated and source checks

- Production UI build passed with Vite 7.3.7, React 19.3.1, Tailwind 4.3.4, and 1,700 transformed modules.
- Official shadcn CLI 4.23.0 installed seven JavaScript components: Button, Input, Textarea, Dialog, Tabs, Badge and Tooltip. They are real CLI output in `src/components/ui/*.jsx`, with `components.json` configured `tsx:false` and `rsc:false`.
- The official Button source imported `class-variance-authority`, omitted by its registry dependency metadata; version 0.7.1 was installed explicitly. Official component sources were preserved.
- The initial delivery passed 34 Node/HTTP tests. The projects/skills/profiles/globe extension now passes **54 tests**. Coverage includes owner pairing, CSRF/Origin/Host checks, immutable revision/hash approval, import/path validation, scoped discovery, actual service readiness, external port protection, PID identity, detached descendants, line-buffered secret redaction, independent cancellation, worker claims, retry preservation, startup/login shutdown races, bounded scan persistence, native inventory validation, profile snapshots, malformed-import recovery, deleted-profile recovery and stale-health handling.
- Authored application source uses `.js` and `.jsx`; no authored TypeScript application files or TypeScript configuration were found. Dependencies' internal types are permitted by the user.
- No automatic commits, merges, deployment, or target-project resets were performed.

## Live local workflow

Used the real production build at `http://127.0.0.1:4310`, owner pairing, and the actual separate worker process.

1. Registered `examples/demo-project` through the UI.
2. The first-start UI displayed actual command, cwd, environment-file location, and expected URL. Confirmed `node server.js` for the frontend and `node api.js` for its independent API.
3. Confirmed actual managed process identity and HTTP readiness. Frontend is `http://127.0.0.1:4173/`; API readiness is `http://127.0.0.1:4174/health`. The first live run caught a demo URL configuration error (API `/` correctly returned 404); the configured URL was corrected to `/health`, without weakening readiness checks.
4. Captured `/` at desktop 1440×900 and mobile 390×844, with viewport and full-page PNGs. Actual page title: `Fieldwork — Mari workflow demo`. All example content is synthetic and labeled.
5. Requested Codex built-in design generation through the real app-server worker. `account/read` confirmed native ChatGPT authentication. A genuine `imageGeneration` item returned an actual PNG; the worker decoded, copied, hashed, saved, and displayed it as proposal revision 1.
6. Saved proposal dimensions: **1586×992**, SHA-256 `3e6fb6ffa6578ae8a6a5bd4e5a85ff35830f3123b7e86a3701aaa08050444c64`. Native subscription image generation is now verified for this installed CLI/account run, rather than inferred from a feature flag.
7. A real unapproved Implement request returned **HTTP 409 / APPROVAL_REQUIRED** and queued no implementation. The task remains `awaiting_approval`. No one approved the demo proposal on the user's behalf.
8. Restarted the real application. Task, screenshots, proposal, configuration, and event history persisted. Verified service shutdown and subsequent real restart. Historical executors remain historical; worker connectivity is separate.

## Browser checks

Two batched inspection rounds covered home and task review at desktop 1440×1000 and mobile 390×844. Screenshots are in `.impeccable/review/` (first round archived under `round1`).

First-round findings were fixed together:

- Express default dotfile handling blocked artifacts stored under `.mari`. The protected artifact route now explicitly permits dot segments only after canonical owned-path validation. HTTP tests now use a hidden runtime directory and confirm valid image delivery.
- Task activity selected an earlier browser executor while Codex was working. The task view now prefers the newest live executor and labels historical activity as last execution.

Final browser checks: original and proposal images loaded with nonzero natural dimensions; no JavaScript/console errors; mobile document width equals 390px (no global horizontal overflow). The review workspace exposes exact revision approval and keeps Implement behind approval.

## Independent review

A separate source reviewer covered backend, worker, shared modules, launcher and tests. It found service-start/shutdown and login-launch cancellation races, plus a missing correction control. Fixes and targeted rechecks passed; the correction control was source-verified. A fresh design finish review is recorded in `docs/design/finish-review.md`.

The Impeccable launcher was unavailable (permission denied) at initial context loading. Existing context and references were read directly. No detector result is claimed.

## Functional boundary

- Project registration, multi-service process control, health/output, persistent tasks/events, bounded batch captures, subscription-native image generation, manual handoff/import, exact revision approval enforcement, and responsive artifact display were exercised or covered as described above.
- The approved-image implementation and browser comparison adapters are implemented, including a two-pass verification cap and correction/resume controls. A live target edit and its final verification were **not** executed: the generated demo design still requires the user's image-specific approval and separate Implement action.
- Automatic design generation acts on one selected page/viewport at a time. Capture batches support bounded selected routes and desktop/mobile combinations.
- Dedicated authenticated-browser login is implemented; the cancellation race is tested with a controlled launch. A third-party authenticated website login was not exercised.
- ChatGPT handoff is manual. There is no automatic connection to ordinary ChatGPT conversations, no API-billing fallback, and no remote hosting.
- JEV was used for the architecture choice under the user's explicit configured-provider exception. Requirements and structural application Graphify outputs are retained, with extraction limitations disclosed.

## Projects, skills, profiles and globe extension

The production build and all **54 tests** passed. The Three.js renderer and resource workspace load as separate chunks. Vite retains its size advisory for the 526 kB Three.js chunk; the build succeeds.

Live checks used only the included `examples` folder and controlled test fixtures:

- Explicit folder scan returned the already registered demo with its actual path, npm detection, Git branch/dirty state and two responding services. Scan roots/results persisted; scanning neither registered nor started anything.
- Native Codex metadata returned 72 installed skills, including 54 plugin skills, in the settled Mari snapshot with no inventory errors. Mari and selected-project contexts were queried separately. Counts are observations, not hardcoded product totals. Impeccable instructions loaded as readable text; viewing them ran no AI turn.
- Created a profile bound to the installed Impeccable skill, exported it, reviewed/imported the exported JSON, and installed the Reviewer starter through the UI. Removed the temporary QA profiles, leaving the actual Reviewer configuration. No live agent was invented and no AI inference was triggered by profile configuration.
- A malformed import with an object-valued name produced the inline error `Profile name must be text.` Both task and new-task selectors retained an explicit Unavailable option after a selected profile was deleted, then accepted Default Codex.
- Actual WebGL rotation advanced while the demo services were running. Reduced motion and scrolling the globe offscreen stopped frame counts. Controlled WebGL context loss displayed the labeled static fallback; restoring that context returned the renderer to rotating WebGL. Working-state resonance is implemented and source reviewed; no fake execution was inserted to demonstrate it.
- The five independent visual findings were corrected in one batch: scan-table containment, full context labels, compact skill previews, starter-profile disclosure, and profile editor scrolling/focus. The browser measured all four mobile workspaces at 390px document width for a 390px viewport. The profile name field received focus at approximately 40px from the viewport top after Create profile. No page JavaScript errors appeared during the final checks.

Two batched screenshot rounds covered home, folder scan, skill details and the profile editor at 1440×1000 and 390×844. Final captures are retained in `.impeccable/review/resources/`. The fresh review's initial findings and **ship** disposition for the five resolved fixes are in [resources finish review](design/resources-finish-review.md). No broader whole-product approval is implied. The detector was attempted once and failed with permission denied; no detector result is claimed.

Independent source review found stale-health motion, malformed-import rendering and deleted-profile recovery defects. Their targeted fixes and recheck resolved all three. The new tests also preserve validation-before-task-mutation and immutable native skill snapshots. Profile-bound Codex inference was not run live; the pending demo design still has zero approvals and remains awaiting the user's review.

The local Graphify application snapshot was refreshed with 51 JS/JSX files, 349 nodes and 1,227 edges in 16 communities. Requirements outputs were preserved. Its reproducible local AST extraction made zero provider calls, excluded heuristic relationships and records its parser/import limitations in `graphify-out/application/GRAPH_REPORT.md`.

## Light and black dark appearance

The later user request supersedes the original blue palette. `src/themes.css` now defines neutral light and black dark surfaces, with shared semantic tokens throughout the shell, forms, resources, logs and globe. The header and pairing screen expose an accessible Light/Dark control. A pre-paint initializer applies the saved mode; system changes are followed until an explicit choice is stored.

Production build passed after the final theme fixes. Browser checks confirmed:

- Dark body `rgb(0, 0, 0)` and panels `rgb(16, 16, 16)`; light body `rgb(246, 246, 246)` and panels `rgb(255, 255, 255)`.
- Explicit choice survives reload and overrides system preference. Without a choice, the page follows system changes. Switching remains usable when browser storage throws.
- The static reduced-motion globe repaints once on a theme change, then remains still; its WebGL materials follow the same surface tokens.
- Settled home/task views in both themes at desktop 1440×1000 and mobile 390×844 show no document overflow or page JavaScript errors. Sampled direct-text contrast checks returned no failures; these are targeted checks, not a complete accessibility certification. Skill inventory and profile editor text were also checked in both themes.
- Two finite review findings were fixed together: mobile toggle sizing and the failed-status dot's destructive color token. Final captures are in `.impeccable/review/themes/`; the independent scoring record is `docs/design/theme-finish-review.md`.

No backend or workflow changes, new dependencies, target-image approvals, AI inference, commits or deployments were part of the theme change. The previous 54-test result remains recorded above; this visual-only change was verified through the production build and targeted browser checks. The local application graph now covers 53 JS/JSX files, 356 nodes and 1,250 edges in 19 communities, without external inference.

## Default geodesic globe motion

The later globe request replaces the earlier static-idle motion rule. The [reference hero](https://pixelsbymiku.dev/) was inspected in an isolated browser: transparent triangulated outer and inner shells, a diagonal orbit and sparse nodes. Mari now uses an independently authored compact adaptation built from its existing Three.js dependency. Black/light themes and the command-center layout remain intact. The globe's ambient identity motion is separate from factual agent/service activity; `coreActivity` still reports actual idle, waiting, offline, running or working state.

Production build passed. Both classifier regression tests passed with their descriptions updated to describe factual activity rather than a motion gate. No new dependencies or target-project edits were needed.

Checks ran against a fresh private QA database on port 4311, with one actual worker and zero projects, services, jobs or agents. The user's existing port 4310 process was left under its existing terminal's control.

- Before the change, the idle globe stayed at rotation `0.3700` and four frames across 400ms.
- After the change, factual activity remained `idle` while `data-motion` was `ambient`: rotation advanced from `0.4008` to `0.4842`, with frames 11 → 31 across approximately 650ms.
- Pause held the frame count at 33; Resume restored ambient rotation. Reduced motion held it at 43 and disabled the control with an explanatory accessible label. Offscreen rendering held it at 46.
- A controlled browser transport failure changed factual connectivity to offline while ambient rotation continued (`5.3631` → `5.3981`), without inserting a false active execution or service record.
- Context loss displayed the matching triangulated static fallback and disabled animation control; context restoration resumed ambient rotation.
- Desktop 1440×1000 and mobile 390×844 captures covered both themes, with separate paused and reduced-motion mobile captures. All mobile documents remained 390px wide and no page JavaScript errors occurred.

The implementation retains 30fps/DPR1.5 limits, hidden/offscreen suspension, theme-material updates and cleanup. Actual service/working states increase speed and working adds a ±0.8% resonance; no AI execution was fabricated to demonstrate those variants. No images were approved, jobs dispatched, commits made or deployments performed. Final review evidence is retained under `.impeccable/review/geodesic/` and `docs/design/geodesic-finish-review.md`.

The refreshed local AST graph covers 53 JS/JSX files, 368 nodes and 1,268 edges in 16 communities. Requirements artifacts were preserved, heuristic relationships were excluded, and no external provider or inference call was made.

## Grand Chase Mari identity

The user supplied a character reference and selected stylized blue/red eyes within the globe. The implemented identity uses independently authored SVG: viewer-left blue/right red eyes, fine gold glasses, a small crest, and a matching simplified header emblem. Sapphire replaces the previous teal identity accent. The black/light surfaces, semantic status colors, globe motion and factual captions remain intact. The eyes are still decorative artwork, not execution indicators.

Production build passed. Targeted checks used a fresh isolated port 4311 instance with one actual worker and no projects/jobs/agents; the user's port 4310 process was left under its existing terminal's control.

- Both themes were inspected at 1440×1000 and 390×844, with full-page and core-detail captures. Eye artwork measured 220px desktop and 188px mobile; no global overflow occurred.
- Actual dark-mode SVG fills were blue `rgb(112, 184, 227)`, red `rgb(231, 124, 136)`, and gold frames `rgb(201, 171, 117)`. Both colors remained recognizable in the light palette.
- Idle globe rotation continued (`0.3800` → `0.4275` across approximately 350ms). Pause still reported `paused`; reduced motion held the frame count at 4021 and disabled the motion control.
- Sampled direct-text contrast checks returned no failures in either theme. The SVG is decorative/non-focusable with instance-specific clip IDs. No page JavaScript errors occurred.

The eight captures are retained in `.impeccable/review/mari-identity/`. A fresh independent review returned **ship** for this bounded identity refinement; its scope is recorded in `docs/design/mari-identity-finish-review.md`. Current authority was clarified in `docs/design/README.md`; historical palette records retain their original scope. No automated detector clearance is claimed.

No dependencies, backend behavior, provider calls, target-image approvals or workflow jobs were added for this change. The local AST graph now records 54 JS/JSX files, 371 nodes and 1,274 edges in 14 communities, with no external inference and preserved requirements artifacts.

## Raster character portrait and frame playback

The user subsequently requested an actual 2D character image animated frame by frame, with a cold/robotic demeanor. The current Core now mounts `MariPortrait`, replacing the previous globe and isolated SVG eyes. A real six-frame transparent atlas was generated with the built-in image tool from the user's character reference; [asset provenance and exact prompt](design/mari-portrait-assets.md) are recorded separately. No API-key/CLI fallback was used.

Production build passed. The portrait player is a separate 4.16 kB JavaScript chunk; the current build no longer includes the Three.js globe chunk. The local atlas is 2,440,766 bytes and loads once. These are build observations, not network performance guarantees.

Live verification used a fresh isolated QA database on port 4311. The user's existing 4310 application remained under its existing terminal's control.

- An actual MutationObserver recorded frames `0 → 1 → 2 → 3 → 4 → 5 → 4 → 0`, including approximately 80/100/80ms blink transitions and the held glance. Every atlas cell was displayed; no CSS face morph or simulated speaking was used.
- Pausing during closed-eye frame 2 restored neutral frame 0. Explicit pause held the transition count stable. Reduced motion held frame 0/count 10 for 4.5 seconds and disabled the control; offscreen suspension also held frame 0/count 10 for 4.5 seconds.
- An aborted image request displayed `Portrait unavailable. Reload to retry.` and disabled playback. Removing the fault and reloading restored `playing` without a JavaScript error.
- The portrait was inspected in black and light modes at desktop 1440×1000 and mobile 390×844, with full-page and core-detail screenshots. The image rendered at 216px/180px, actual alpha composited cleanly, caption/control remained separate, all mobile documents were 390px wide, and no page JavaScript errors occurred.

Final evidence is in `.impeccable/review/portrait/`. Independent visual review returned **ship** for the bounded portrait replacement; see [portrait review](design/portrait-finish-review.md). No automated detector clearance is claimed. Animation is decorative and separate from worker, agent, service and task facts. No workflow jobs, target-image approvals, commits or deployments were performed for the portrait.

The local AST graph now covers 55 JS/JSX files, 389 nodes and 1,307 edges in 20 communities. It records Core's current portrait import and labels the old globe/eyes as retained source; CSS/PNG imports are placeholders, not proof of image quality. Requirements artifacts were preserved, with no external graph inference or provider calls.
