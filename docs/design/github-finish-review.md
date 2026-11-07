# GitHub workspace finish review

Date: 2026-11-07. Mode: Operate. Final disposition: **ship** — both material findings are resolved after one fix batch and one confirmation round. No further recapture or visual rebuild is required.

## persistence

Reviewed `PRODUCT.md`, `DESIGN.md`, `docs/specs/2026-11-07-github-integration.md`, the Impeccable skill, craft floor, Operate guidance, and polish guidance. The scope is an extension of Mari's existing command center: the selected local project's bounded, read-only GitHub activity. The existing light and character-derived dark themes, horizontal navigation, avatar, project workflow, and approvals remain authoritative.

Context loading and the detector were already attempted and denied earlier in this session; this review did not rerun them. The GitHub surface brief is to be persisted as `.impeccable/surfaces/github-workspace.md` by the implementation pass before final handoff. This review does not create a new aesthetic direction or require a new image approval for the code-first Mari interface.

Implementation handoff note: the surface brief, PRODUCT/DESIGN additions, README usage, and integration evidence record were subsequently persisted. Existing token values are unchanged. This note records completion of the documentation handoff; it does not expand the independent visual verdict's scope.

## fidelity

Independently opened and visually inspected **all 20 first-round PNGs**, now archived in `.impeccable/review/github/round1/`. Every image is a valid capture of the intended GitHub surface. The batch covers:

| State | Themes | Widths | Captures |
| --- | --- | --- | --- |
| No selected project | Dark | 1440, 390 | 2 |
| Project without repository | Dark, light | 1440, 390 | 4 |
| Pull requests | Dark, light | 1440, 390 | 4 |
| Your review requests | Dark | 1440, 390 | 2 |
| Issues | Light | 1440, 390 | 2 |
| Checks needing attention | Dark, light | 1440, 390 | 4 |
| Stale source with saved data | Dark | 1440, 390 | 2 |

The captures use Firefox 159.0. Synthetic project and row labels identify the fixtures; `openai/codex` is the public repository sample. The panel, border, typography, action hierarchy, icons, and selected-control treatment follow the incumbent system. Mobile controls wrap, search becomes full-width, and source metadata and long titles remain readable. No clipping, broken composition, or page-level horizontal overflow is apparent. The recorded document widths equal the respective 1440px and 390px viewports.

The stale captures visibly preserve the original source timestamp (`Last available data Nov 6, 4:00 PM GMT+8`) while separately identifying the later partial snapshot. The checks captures show both a failed build and `startup_failure` in Needs attention, with explicit legacy-status/PR-workflow coverage limitations. These views do not claim comprehensive CI coverage.

## ceiling

The finite cycle is complete: a full 20-image first inspection, one implementation fix batch, and one confirmation round. No browser, server, test suite, build, account operation, private-repository read, or additional detector run was performed by this reviewer.

`.impeccable/review/github/checks.json` records zero page JavaScript errors, zero computed text-contrast failures excluding disabled controls, 98 passing tests, and a successful production build. It also records native connection inspection and bounded public repository reads, manual binding, cancellation, project switching with the old source hidden, and check-filter behavior. These are supplied implementation evidence, not independently repeated checks. A screenshot and computed text scan alone do not establish every assistive-technology or interaction state.

The implementation pass rebuilt and recaptured the same 20 states in Firefox 159.0; canonical PNGs and `checks.json` now represent round 2. This reviewer independently inspected the four current pull-request captures across both themes and widths, plus the two stale dark captures. Terminal jobs now say `cancelled`, tab counts are plain numbers, and the footer neutrally says Open GitHub for the full result set. The stale source's original timestamp remains intact. Source inspection confirms the pending cancellation label is restricted to queued/running jobs with a cancellation request; `checks.json` records neutral accessible count labels and the terminal cancellation result. Its current metrics retain zero overflow, text-contrast, and page-error findings. No regression appears in the affected views.

The outcome is **2 resolved, 0 partial, 0 unresolved**. The one allowed confirmation round is consumed. Stop here; no additional screenshots, broad polish search, redesign, or visual rebuild is warranted.

## material_fixes

1. **Resolved — terminal cancellation was presented as pending.** The first-round loaded fixture captures showed Cancellation requested beside a Finished timestamp after the job reached `cancelled`. `JobStatus` in `src/components/GithubWorkspace.jsx` now uses `active && job.cancelRequested` for the pending label and otherwise displays the job status. All four reviewed pull-request confirmation captures show `cancelled`; the source preserves the pending label and existing cancel control for active jobs.

2. **Resolved — bounded results implied proven additional rows.** `normalizeGithubItems` in `worker/github.js` conservatively marks a response truncated when its length reaches the limit, even without a next-page token or a larger known total; check normalization uses the same pattern. The first-round UI turned that into a visible `+`, accessible `more available`, and an assertion that more results exist. `LoadedCount` now renders a plain count and the neutral accessible qualifier `bounded result set`; `SourceFreshness` now says Open GitHub for the full result set. The four pull-request confirmation captures and `checks.json` confirm the corrected visible and accessible output. The worker's bounded-read behavior and result-limit disclosure remain intact.

No additional material brief, responsive, or accessibility defect was found in this bounded batch.

## keep

- Keep explicit Check connection and Refresh GitHub actions, source identity, branch/commit, repository settings, source links, result bounds, and separately dated saved data.
- Keep the no-project and unlinked-project recovery paths, inline source failure with Retry refresh, and previously loaded rows marked as stale.
- Keep Your review requests scoped to the connected account and selected repository, and Needs attention scoped to the loaded checks with startup failures visible.
- Keep the coverage qualification and the statement that no loaded checks needing attention does not establish every GitHub check passed.
- Keep shared shadcn controls and existing tokens, compact operational density, responsive wrapping, and horizontal workspace navigation. Preserve the approved palette, avatar, and unrelated project/personal flows.
- Keep this review's evidence bounded to synthetic UI data and the recorded public-repository reads; it makes no claim about private repository access or a complete CI result.
