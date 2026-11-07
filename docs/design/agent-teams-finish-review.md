# Agent teams finish review

Reviewed 2026-11-07 against the settled Mari matte light/midnight design, the agent conversation and roster surface contracts, and the approved code-first team specification. This was an independent finish and correctness review, with source inspection and all ten supplied screenshots opened in the image viewer. No browser, native model turn, or implementation changes were launched by this reviewer.

## Disposition: ship

The interface is suitable to ship in its existing visual direction. The initial review found two confirmed backend defects; both are resolved in the reviewed correction batch, and the focused suite passes all 11 tests. No additional material issue was found within this review scope. A redesign, rebuild of the visual direction, and new screenshot round are not required for these backend-only fixes.

## Initial findings and correction review

### [P2] Reload team state after acquiring the transaction lock — resolved

**Original locations:** `server/agent-teams.js:100–115` (`reconcileTeamRuns`) and `server/agent-teams.js:119–134` (`controlTeamRun`). **Corrected locations:** `server/agent-teams.js:101–103`, `server/agent-teams.js:121–126`, and `server/agent-teams.js:168–170`.

The reconciler enumerates team snapshots before `BEGIN IMMEDIATE`; controls accept a team record fetched by the caller before that transaction. The normal server and worker use separate SQLite connections. Acquiring the lock serializes later operations but does not refresh those earlier records.

**Reproduction:** Using the real exported functions with an in-memory store, preserve a working team record, change the authoritative team to completed, then call `controlTeamRun` with that old record and `cancel`. The completed team becomes cancelled. Separately, inject a server cancellation at the reconciler's `BEGIN IMMEDIATE`, after its team enumeration. With a cancelled member the cancelled team becomes failed. With already completed members the cancelled team becomes synthesizing and a new synthesis job is queued while `cancelRequested` remains true. The later execution guard prevents a successful native synthesis in that last case, but it does not make the incorrect transition or post-cancellation queue entry valid.

**Required correction:** Reload each team by ID inside its transaction; recheck lifecycle and cancellation from that authoritative record before changing state or scheduling jobs. Apply the same discipline to related transition helpers where records cross a transaction boundary. Regression coverage should force cancellation/completion between record selection and lock acquisition, and assert no cancelled/completed state is overwritten and no synthesis is queued after cancellation.

**Resolution:** Reviewed the implementation reloading team records inside `atomic` for controls, reconciliation, and worker interruption. Controls now reject authoritative completed state; reconciliation/interruption recheck active state under the acquired lock. `tests/agent-teams.test.js:153` and `tests/agent-teams.test.js:161` exercise stale completion and cancellation before reconciliation for both completed and cancelled children. `output/agent-teams-race-regression-before.txt` records both tests failing against the earlier code; `output/agent-teams-tests.txt` records all 11 focused tests passing after correction. This resolves the reproduced transitions without altering the interface.

### [P2] Preserve customized legacy CEO instructions during migration — resolved

**Location:** `server/agent-profiles.js:106` (`migrateAgentNames`).

An exact legacy name and Elesis portrait cause migration to replace the entire CEO instruction text with the current starter template. That match does not establish that the instructions are unmodified defaults. The plan explicitly preserves user customizations.

**Reproduction:** Put an enabled profile named `CEO`, portrait `elesis`, with custom instructions such as “Always provide decisions in a short table. Preserve my supplier process.” Run the actual migration with an in-memory store. The name becomes Elesis, but both custom instructions disappear. Existing conversation snapshots survive; the editable profile's customization does not.

**Required correction:** Preserve existing instruction text while adding the explicit delegation capability and requested identity. Only replace instruction text if exact known default content has been positively recognized and replacement is necessary. Add a migration regression asserting custom instructions survive, alongside the existing history/idempotence assertions.

**Resolution:** Reviewed `server/agent-profiles.js:106`: migration now preserves instruction text and customized roles; only the exact legacy `strategy advisor` role changes to CEO, with name/delegation changes remaining explicit. The migration regression at `tests/agent-teams.test.js:42` now asserts the original instruction text survives, alongside idempotence and historical snapshot checks, and passes in the 11-test focused run. The team-turn developer boundary at `worker/agent-chat.js:67` explicitly authorizes only server-supplied team planning/synthesis despite older advisory-only wording; it does not grant ordinary chat delegation or additional tools. The implementer reports restoring the local saved instructions from the private pre-migration backup; that private recovery was not independently inspected by this reviewer.

## Visual and UX assessment

The four-column roster shows the exact requested row-major order: Elesis, Lire, Arme, Amy / Mari, Rohan, Lass, Zero / Jin, Dio, Ryan, Sieghart. Names and role titles are visibly separate. The existing framed chibi portraits provide product identity without implying availability. The selected roster and team surfaces retain the established flat midnight/light colors, shared controls, fine dividers, Inter hierarchy, and restrained status colors. No new visual world or raster asset was introduced.

The Team view uses flat assignment rows rather than another layer of dashboard cards. Long goals and assignments expose their full instructions through labeled native disclosures. Current worker connectivity is separate from historical completed results; the captures accurately show Worker Offline and execution capacity unconfirmed next to saved completed work. Inspect actions, the specialist's parent-goal link, task artifact links, and the activity filter make the underlying work inspectable. The CEO synthesis remains in Chat with its saved message. Scope and the existing website approval workflow remain visible.

The supplied 390px captures preserve readable wrapping and the local conversation controls. Team assignments remain reachable by scrolling the dedicated panel; the scrolled member capture establishes the assignment/control composition below the goal introduction. Both themes retain clear text hierarchy without decorative glass, glow, gradients, or invented performance indicators. No material visual defect warrants another polishing pass.

Source uses labeled controls, text alongside status colors, native `details`/`summary` disclosures, shared buttons, `aria-pressed` navigation, and alert/status semantics. This is supporting implementation evidence, not an independent keyboard or screen-reader certification. No new motion requires a separate authored animation moment on this Operate extension.

## Evidence validity

All required screenshots were opened and visually inspected:

- `.impeccable/review/agent-teams/roster-dark-desktop.png`
- `.impeccable/review/agent-teams/team-dark-desktop.png`
- `.impeccable/review/agent-teams/team-light-desktop.png`
- `.impeccable/review/agent-teams/team-dark-mobile.png`
- `.impeccable/review/agent-teams/team-light-mobile.png`
- `.impeccable/review/agent-teams/team-members-dark-desktop.png`
- `.impeccable/review/agent-teams/team-members-dark-mobile.png`
- `.impeccable/review/agent-teams/specialist-task-dark-mobile.png`
- `.impeccable/review/agent-teams/specialist-activity-dark-desktop.png`
- `.impeccable/review/agent-teams/ceo-synthesis-dark-desktop.png`

`checks.json` records Firefox at 1440px desktop and 390px mobile, matching document and viewport widths, and no JavaScript errors. Inspection of `output/agent-teams-check.js` confirms an important evidence distinction: cancel/retry/concurrent-visibility interactions use an explicitly synthetic executor; all synthetic records are removed before the screenshot stage. Screenshots then render copies of the real completed native trial and its artifacts. The download check uses that real specialist artifact. These are valid UI and saved-history captures, not screenshots proving live native concurrency.

`output/agent-teams-native-trial.json` independently records native ChatGPT authentication with Codex 0.160.0, planning → working → synthesizing → completed, and two actual specialist intervals overlapping from 21:12:51.678Z to 21:13:16.274Z on 2026-11-06. Both specialists and the team completed, with saved response/file artifacts. The trial records no project source change or service start. It proves the two-specialist native vertical slice, not every possible goal or all six assignments.

The final `output/agent-teams-full-tests.txt` reports 181 passing tests, zero failures, after the correction batch (the baseline had 179). The focused team tests cover plan validation and scope, concurrent capacity and locks, explicit retry preserving completed results, cancellation, restart, lease loss, native-interface integration with a fake client, and late-plan cancellation. The correction batch adds the two stale-record regressions and instruction-preservation assertion; `output/agent-teams-tests.txt` records 11 passing focused tests, zero failures. Both result files were read by this reviewer. `output/agent-teams-build.txt` records a successful production build. The JEV output is a scoped classification, not functional or visual verification.

The deterministic Impeccable scan did **not** run: `output/agent-teams-design-detect-error.txt` records launcher permission denied. No clean scan, zero detector findings, live overlay, computed contrast/spacing measurement, or automated accessibility certification is claimed. Manual source and screenshot review substitutes only for the available visual assessment. Existing portrait provenance remains in the established chibi assets and generation record; this feature changes no rasters.

## Verification limits and handoff

This reviewer inspected the supplied evidence, performed small deterministic in-memory reproductions of the two initial findings, reviewed their corrections, and read the focused regression output. The full test suite, production build, Firefox interactions, and costly native trial were not independently repeated. Live keyboard focus, screen readers, browser zoom, arbitrary content, all intermediate responsive widths, and a six-specialist native run were not independently exercised. The confirmed backend findings are corrected and the focused regressions pass; these limits do not justify another visual QA cycle.

Questions skipped: the product direction, feature requirements, permissions, and code-first workflow are already settled. This handoff calls for concrete backend fixes and regression evidence, not new design approval.
