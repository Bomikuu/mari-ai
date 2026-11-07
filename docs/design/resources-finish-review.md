# Resource extension finish review

Review scope: the explicit folder-scan manager, installed Codex skills, reusable profiles inside Mari, and the existing command-center/globe shell. Code-led extension; the selected image is a critique reference, not a new pixel specification. No separate QUALITY BAR card was supplied. The reviewer used the eight parent-captured files in `/tmp/mari-resource-review/`, without browser use, tests, or detector execution.

## First review

disposition: fix

### persistence

Pass. PRODUCT.md, DESIGN.md, and the surface contract describe the extension and its truthful execution boundaries. Configuration records `buildPath: code`; no comp-round approval or reproduction gate applies.

### fidelity

- TYPE — match: compact sans-serif interface hierarchy and restrained technical identity.
- MATERIAL — match: flat matte panels, fine cyan linework, and the requested real Three.js globe; no decorative gloss or simulated material.
- GROUND — match: blue-charcoal field follows the persisted palette.
- Composition — match: command-center hierarchy and horizontal navigation remain intact; resource views replace content in place.
- Product truth — match: configured profiles remain separate from live executions; service activity and synthetic demo content are identified.
- Responsive containment — contradicted: scan-mobile visibly expands beyond the intended document width.
- Resource readability — contradicted: the inventory-context label is clipped, and long descriptions overwhelm mobile inventory rows.

### ceiling

The incumbent's compact operational grammar is established. Remaining finish lies in usable resource density and visible action affordances; no additional ornament, depth, or effects are warranted.

### material_fixes

1. Responsive contract: contain the scan table and its hidden labels so scan-mobile remains 390px wide without global horizontal overflow.
2. Context clarity: widen or reflow the skills context selector so both “Mari · installed” and “Selected project” remain fully readable on desktop and mobile.
3. Compact inventory promise: limit skill descriptions to a short visible preview and preserve full content through the detail view; the current mobile row consumes most of the inventory region.
4. Profile installation discoverability: add a visible disclosure indicator to Starter profiles so users can find the concealed Install action without guessing that each row expands.
5. Profile creation handoff: bring the editor into view when Create profile or an existing profile is selected; on mobile it currently opens below the configured and starter lists without scrolling or focus transfer.

### keep

Preserve the flat blue-charcoal/cyan command center, real globe, horizontal navigation, compact panel geometry, and strict distinction between configuration, connectivity, and execution.

## Verdict pass

All eight original screenshot paths were re-read after the correction batch. This pass scores only the five findings above and regressions introduced by their correction. The editor handoff was also checked in source because full-page captures reset to the document top.

### verdict

1. Resolved — scan-mobile now stays within the 390px document; the wide results table remains inside its panel.
2. Resolved — desktop and mobile skills captures show the complete “Mari · installed” context label with space for the alternate context.
3. Resolved — skill descriptions are compact three-line previews; the adjacent/stacked instruction pane retains full readable content.
4. Resolved — every starter row visibly offers “Review & install” with a chevron on desktop and mobile.
5. Resolved — `ResourcesManager.jsx` increments an editor focus request on each selection; its effect scrolls the mounted form into view and focuses the name field. Parent behavior evidence corroborates the mobile handoff.

### remaining

Clear. No introduced regressions observed. Ship covers the scored fixes.

disposition: ship
