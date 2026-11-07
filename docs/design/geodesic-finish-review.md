# Geodesic globe finish review

Scope: the independently authored layered Three.js globe, its default ambient motion, motion control, and light/black responsive adaptation. This is a bounded refinement of Mari's existing command center. The surrounding application, historical composition, existing typography, and unrelated workflows are outside this review except for regressions introduced by this refinement. A new concept roll, comp round, and QUALITY BAR card were explicitly excluded from this scope.

Evidence: the root's six captures under `/tmp/mari-geodesic-review/` (`dark-desktop.png`, `dark-mobile.png`, `light-desktop.png`, `light-mobile.png`, `paused-light-mobile.png`, `reduced-light-mobile.png`) were individually opened. Desktop files are 1440 × 1010 full-page captures of the reported 1440 × 1000 viewport; mobile files are 390 × 1987 full-page captures of the reported 390 × 844 viewport. All show the document top, the named theme/state, and rendered content. The first four capture ambient motion at one instant; still images alone do not prove motion. The root separately reports bounded checks for idle rotation, pause/resume, reduced motion, offscreen suspension, disconnected activity, context loss/restoration, errors, and width. Those results were not rerun by this reviewer.

The supplied Pixels by Miku hero captures show a transparent triangulated outer sphere, a smaller inner mesh, a diagonal orbit, and sparse solid nodes. They are geometry references for this change, not authority to reproduce that page's layout, typography, or blue palette. Reviewed source: `src/components/MariGlobe.jsx`, `src/components/mari-globe.css`, the globe tokens, and the current product/design/surface records. No browser, server, tests, or detector was run in this review. The previously unavailable detector has no result claimed here.

disposition: ship

## persistence

Pass. `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, and `.impeccable/surfaces/command-center.md` preserve the new geometry and default ambient-motion policy, distinguish visual motion from factual activity, and retain light/true-black themes. `.impeccable/config.json` records the code build path. Comp-state and raster-diff obligations do not apply to this bounded geometric implementation.

## fidelity

| Element or promise | Finding | Evidence |
| --- | --- | --- |
| Outer and inner geodesic shells | Match | Both shells remain transparent line geometry; the smaller shell is discernible above and below the existing central identity in both themes and widths. |
| Orbit, nodes, and sparse connections | Match | The orbit extends beyond the shell, with separated nodes and links; the source authors the diagonal orbital plane independently. |
| Compact Mari composition | Adaptation | The user requested the reference globe in Mari's hero. Its smaller centered treatment preserves the existing command-center hierarchy rather than importing the reference page. |
| TYPE | Adaptation | Existing centered MARI/PERSONAL AI identity remains legible. The bounded globe request supplies no new typography authority; the reference's portfolio display lettering is outside scope. |
| MATERIAL | Match | Real transparent Three.js line geometry supplies the requested technical material. It adds no gloss, glow, painted-material imitation, or raster obligations. |
| GROUND | Match | Captures retain the requested neutral light field and true-black dark field, with a neutral core and restrained teal linework rather than the reference's blue ground. |
| Default motion and truthful activity | Match | Source rotates in idle, waiting, and offline states while preserving factual activity labels; the root's reported idle frame/angle change corroborates the behavior. Fixed geometry carries no operational counts. |
| Pause and reduced motion | Match | Paused capture shows Resume; reduced-motion capture shows disabled motion control. Source supplies action labels and explanatory accessible text, and reduced motion takes precedence. |
| Visibility and rendering failure | Match | Source stops hidden/offscreen rendering and provides topology-sharing SVG fallback plus an explicit unavailability note; the root reports bounded checks of these transitions. |
| Mobile adaptation | Match | All four mobile captures preserve the complete globe, identity, factual label, and motion control at 390px without a globe-induced width regression. |

The five scoped promises hold: layered geodesic identity, default ambient movement, factual operational state, accessible motion guards, and neutral responsive theme adaptation. The first viewport retains Mari's central technical identity.

## ceiling

Reached for this bounded refinement. Layering, orbital depth, sparse nodes, and restrained movement use the reference's relevant geometric devices. Increasing scale, decorative density, glow, or page-wide motion would exceed the approved compact Mari treatment.

## material_fixes

None.

## keep

Keep the layered transparent geometry, default slow motion, clear pause/reduced-motion behavior, factual idle/offline labels, compact mobile core, and light/true-black palette.
