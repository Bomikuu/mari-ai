# Media workspace finish review

Disposition: **ship**. Both material copy corrections from the initial review are **resolved**. This final verdict scores those two fixes against the confirmation evidence; it is not a new full-surface audit.

## persistence

`PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/media-workspace.md`, and `docs/specs/2026-11-07-media-integrations.md` establish an Operate extension to Mari's incumbent system. The output is the dominant object, with preparation beside it on desktop and above it on mobile. Local readiness, explicit generation, saved artifacts, manual playback, real job status, and process ownership remain visible. Existing Core, portrait, and globe are outside this change.

The skill context launcher was already attempted by the implementer and was unavailable. This fresh review used the existing project documents directly without rerunning it. No comp is required for this extension of the incumbent visual world. No new shipping interface raster was introduced by `MediaWorkspace.jsx`; the actual media output and poster are generated artifacts, not substitute decorative artwork.

## fidelity

The initial review independently opened all ten PNGs, now preserved in `.impeccable/review/media/round-1/`: dark desktop home, Video, and Voice; dark mobile Video and Voice; light desktop and mobile Video and Voice; and the light desktop stopped-project state. Desktop is 1440px and mobile is 390px. Every capture depicts its named surface, contains loaded content, and postdates the original reviewed component, CSS, and App integration. The initial layout and copy agreed with that source revision.

The large native video player and distinct audio playback area lead the output column. Settings retain visible labels, appropriate native fields, explicit generation/save actions, and a concrete readiness recovery action. Download and credit links sit next to the actual artifact. Saved samples use a visible selected state and dates; selection replaces the player without mutating form state. The stopped-project capture hides another project's output and disables generation. Themes preserve Mari's flat neutral/midnight surfaces, quiet borders, restrained blue actions, compact typography, and horizontal workspace controls. Mobile stacking and wrapping remain legible without clipped content. No sidebar, glow, glass, unrelated graphic, or new motion was introduced.

Source inspection confirms labeled native controls and players, error alerts, saved notices, shared shadcn buttons, named sections, pressed-state history controls, and explicit manual playback without autoplay. Job details expose real IDs/events and cancellation only for an active job. The supplied initial `round-1/checks.json` reports no JavaScript errors, equal document/viewport widths in all ten states, real decoded and manually played 1280×720/15s MP4 and 6.396s WAV, owned VoiceStudio startup/shutdown, and project-context isolation. These are supplied browser results; this review did not independently replay media or certify keyboard/screen-reader behavior.

The scoped verdict pass independently opened all eight final captures in `.impeccable/review/media/`: desktop/mobile Video and Voice in both themes. All four Video captures visibly identify the footer as `Brag · Hyperframes 0.9.19 · local rendering`. All eight terminal-job captions visibly begin `Last action:`. Current source preserves the unprefixed caption only for active jobs and omits the version when unknown. The current `checks.json` records those exact strings, no JavaScript errors, no document overflow, and successful confirmation. The implementer reports a passing production build after the two copy changes; this review did not rerun it.

The feminine preset and measured speed are the exposed voice controls. The surface does not offer emotion, acting, microphone capture, or automatic speech controls. Acoustic acting quality is outside this screenshot review.

## ceiling

The two-batch ceiling is reached: one initial Firefox capture batch and one confirmation batch after the two corrections were applied together. Review performed one initial assessment and a scoped verdict pass; neither launched a browser, took screenshots, or ran builds, tests, a detector, or new app probes. The verdict pass checked only the two listed findings. No further polish or capture round is owed.

Final reviewed source SHA-256 (`MediaWorkspace.jsx` was initially `bcc9616539152dbd044ab1a0867f5512c487dbdb125227dcbed831a8eeca9173`; the other files are unchanged):

| File | SHA-256 |
| --- | --- |
| `src/components/MediaWorkspace.jsx` | `96f8061d5fc746302444a0fe2d8fea2590db586ad61263d69f18ad5f663e866b` |
| `src/components/media-workspace.css` | `f0a285c8d5e94653b82837771d3d0541e266689a8e71c3ceb286cdaf0e0109a5` |
| `src/App.jsx` | `545b6653ccbe0e29b93de12aaf6a429c7697c2e55f46192011a7233eda28c05b` |

## material_fixes

| Finding | Initial evidence and consequence | Verdict |
| --- | --- | --- |
| Renderer version has the wrong product name | Initial Video captures said `Brag 0.9.19 · local rendering`, but `server/brag.js` obtains `installation.version` from the Hyperframes package manifest. | **Resolved.** Current source and all four final Video captures say `Brag · Hyperframes 0.9.19 · local rendering`. The source omits an unavailable version. |
| Finished job reads as still checking | Initial completed Video captures showed an unqualified present-tense `Checking…` caption below `Completed`. `JobDetails` displayed the retained `agent.action` as current even for terminal jobs. | **Resolved.** Current source and all eight final captures prefix terminal captions with `Last action:`. Active job captions retain their original live wording. |

The initial full review identified no other material visual or usability corrections in its supplied evidence. The scoped verdict pass resolves both requested factual-state fixes without reopening that review.

## keep

Keep the continuous split panel, dominant actual output, familiar native players, manual playback, restrained theme treatment, and clear local readiness/ownership copy. Preserve credits, separate draft settings from saved output selection, project-scoped Video state, global Voice context, and existing Core behavior. Both fixes are resolved: stop polishing and complete the extension documentation handoff.
