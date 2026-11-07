# Theme finish review

Date: 2026-11-06. Scope: the bounded addition of a light option and a neutral black dark mode. The latest user request supersedes the historical concept's blue-charcoal palette. Preserve the incumbent layout, no-sidebar composition, matte globe, and real operational status. Target-site original/proposal images are independent artifacts and are not Mari theme surfaces.

This is a separate reviewer's file-and-capture review. The reviewer did not start a browser, run tests, change application code, or run a detector. No detector result was supplied. A new comp, concept roll, and QUALITY BAR were outside this bounded extension.

Both review rounds opened the same eight paths. The parent overwrote these files with final captures after the single correction batch:

- `/tmp/mari-theme-review/dark-home-desktop.png`
- `/tmp/mari-theme-review/dark-home-mobile.png`
- `/tmp/mari-theme-review/dark-task-desktop.png`
- `/tmp/mari-theme-review/dark-task-mobile.png`
- `/tmp/mari-theme-review/light-home-desktop.png`
- `/tmp/mari-theme-review/light-home-mobile.png`
- `/tmp/mari-theme-review/light-task-desktop.png`
- `/tmp/mari-theme-review/light-task-mobile.png`

Desktop captures use a 1440px viewport and mobile captures a 390px viewport. Each set contains valid full-page home/task captures with the document top visible.

## Initial review

disposition: fix

### persistence

Pass. PRODUCT.md, DESIGN.md, and the command-center surface contract describe the implemented light/black palettes, labeled control, `mari.theme` persistence, system preference, and pre-paint initialization. All eight required captures existed, showed the intended view from the document top, and had valid content.

### fidelity

| Element | Status | Evidence at initial review |
| --- | --- | --- |
| GROUND | match | Dark canvas was neutral black with neutral charcoal panels; light used neutral gray and white, as the latest user request required. |
| TYPE | match | Existing hierarchy, compact labels, and Mari identity remained intact. |
| MATERIAL | match | Matte surfaces and fine globe linework remained; no gloss, glow, or fabricated physical texture was introduced. |
| Composition | match | Desktop panel arrangement, mobile stacking, horizontal navigation, and task comparison remained intact. |
| Theme control | contradicted | In all four mobile captures, the icon and Light/Dark label overflowed the narrow button boundary. |
| Failure status | contradicted | `src/index.css:95` assigned the failure dot `--primary`, inconsistent with its destructive label and the semantic theme contract. This was a source finding; the screenshots did not contain a failed record. |
| Target artifacts | match | Original/proposal images retained their independent palette; they were evidence being reviewed, not Mari chrome. |

### ceiling

Reached for this bounded palette extension. No additional decorative devices were needed.

### material_fixes

1. Floor / responsive control: exempt `.theme-toggle` from the mobile icon-button width rule; use automatic width with sufficient minimum width for its icon and complete label.
2. Truth / status semantics: change `.status-failed .status-dot` from `var(--primary)` to `var(--destructive)`.

### keep

Preserve the true black dark canvas, neutral light surfaces, restrained teal/cyan accents, matte globe, existing layout, and truthful operational states.

## Final verdict pass

### verdict

1. Resolved — all four final mobile captures visibly contain the complete icon and Light/Dark label inside the widened theme button. Both desktop variants remain contained. Source sets automatic width, a 75px minimum width, and 10px horizontal padding for this control.
2. Resolved — the source-only failure-status finding is corrected: `.status-failed .status-dot` now uses `var(--destructive)`, matching the failed label's semantic token. No artificial failed production record was inserted to stage a capture.

Regressions introduced by the correction batch: none observed in the same eight valid captures.

### remaining

Clear. This ship covers the scored fixes, not the whole surface.

disposition: ship
