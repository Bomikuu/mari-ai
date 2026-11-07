# Agent portraits and specialist roles

The user requested character portraits like their compact game roster reference, CEO/business roles and additional categories. Their explicit clarification selects recognizable Grand Chase characters. The final UI uses twelve actual character portraits cropped from the supplied reference, not generated substitutes. Character identity is decorative; the configured role is separate from the game's fiction.

## Delivered behavior

- Six specialist categories: Leadership, Product & Design, Engineering, Quality & Security, Growth and Operations. General remains available for custom/legacy roles.
- Twelve starter specialties: CEO, business analyst, product manager, designer, builder, backend engineer, reviewer, security reviewer, marketing strategist, content writer, project coordinator and research analyst.
- The user's four existing profiles are retained. Nine specialists were added through the authenticated profile API, giving 13 saved profiles. Existing names, instructions, skill bindings and enabled states were preserved; only the requested category/portrait metadata was added. No jobs or services were started.
- Search/category filters, framed roster portraits, inline category editing and a named character picker. Initials remain available and replace a failed image. No external image URLs or arbitrary file paths are accepted.
- Category and portrait survive save and JSON export/import. Old profiles default to General/initials. Job snapshots include identity; workers copy that captured identity into execution records. The connected-agent row and inspector render that identity without converting configured profiles into live executors.
- Profile titles are scoped advice or specialist instructions. No autonomous company management, generic business execution subsystem, extra tool permissions or approval authority is claimed.

## Evidence

Final source verification: all 158 Node tests pass; production build passes. Focused assertions cover legacy imports, invalid category/portrait values, safe local identity IDs, immutable profile snapshots, identity export/import, and worker identity retention through cancellation. The existing Three.js chunk-size advisory remains.

Firefox verification used an isolated temporary database containing copies of the saved profiles. A clearly labeled historical fixture was used only as test data; no live executor was fabricated. Actual user services and runtime job history were untouched. The temporary server and database were removed in `finally` after each bounded batch.

The final screenshot matrix in `.impeccable/review/agent-roster` covers both themes at 1440px desktop and 390px mobile, full roster layouts and the inline portrait editor. `checks.json` records zero JavaScript errors, zero document overflow, 13 loaded portrait images, working search/category/empty states, saved category/portrait selection, downloaded/imported identity and image-error fallback. Captures wait for both local profile loading and the parent bootstrap count to settle after the import fixture is removed. One layout correction freed roster space on mobile and aligned card action rows. The independent reviewer then requested removal of the redundant outer roster panel around the framed cards; that named fix was applied in one batch and the same eight views recaptured for scoring. Earlier generated artwork was replaced following the user's clarification, and all superseded shipping rasters were deleted.

Portrait pixels come from the user-supplied screenshot. `docs/design/agent-portraits/sources.json` records the source SHA-256, crop coordinates, original 54px detail and 108px resampling; attribution is embedded in every WebP and displayed in the picker. Upscaling is not represented as additional source detail. The exact screenshot is retained as a development-only source reference. No remote asset dependency is introduced.

JEV classified the textual role instructions as scoped specialist/advisory configuration through the user's already authorized configured provider. `output/agent-profiles/roster/jev-result.json` records the model judgment; this is separate from executable test/browser proof. No account data or credentials were submitted.

The local AST-only application graph was refreshed after final source freeze: 93 JS/JSX files, 763 nodes, 2,708 edges, 16 labeled communities, zero provider/network calls. All 93 source SHA-256/manifest hashes and the eight original requirements artifact hashes were verified. CSS and portrait pixels are outside this structural graph's scope.

Saved role exports and the installation receipt are in `output/agent-profiles/roster`. Independent finishing disposition is recorded in `docs/design/agent-roster-finish-review.md`.

Documentation reconciliation added the shipped roster behavior and portrait provenance to `PRODUCT.md`, `DESIGN.md` and the existing README Agents description. This ordinary extension preserves the established design tokens and `.impeccable/design.json`; the documentation pass ran no additional browser captures, builds or tests.
