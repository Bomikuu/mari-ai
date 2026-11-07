# Mari portrait asset — resting revision

Current project asset: `src/assets/mari-portrait-atlas-v3.png`, generated with the built-in image-generation tool. References were the previous v2 portrait atlas (drawing style/model) and the user's supplied Grand Chase Mari art (appearance). No API-key or CLI fallback was used.

- Generated original: `/home/micxsz/.codex/generated_images/01a1b0b6-350f-7a73-a3ad-475bd520635e/exec-18aaae10-ab48-4297-8667-7510ce1569c2.png`.
- RGBA PNG, 1536×1024, six columns × four rows, 24 square 256px cells.
- File size: 2,792,928 bytes. SHA-256: `d414fe57335b928dd6264a23f8751582529d91f155c7b071785c75829f04bf19`.
- Actual alpha checked: 585,127 fully transparent pixels.
- User reference: `/tmp/codex-clipboard-9b8dfdc1-b94d-4ef0-9c74-11fe72d88509.png`.

## Current playback

The prior short loop made her continually lean from side to side. This revision uses the first twelve drawings for front-facing breathing at 240ms per drawing (2.88 seconds per breath). Nine breathing cycles precede the first one-sided lean, giving 25.92 seconds facing front. Left drawings 12–17 advance and retrace at 180ms per step, holding the peak for 1.8 seconds; the gesture lasts 3.6 seconds. A neutral drawing follows for 240ms. Ten more breathing cycles give 29.04 seconds facing front before the separate right gesture (drawings 18–23). The entire timeline repeats after 62.4 seconds.

The player selects complete raster drawings. There is no CSS bobbing, vector morphing, crossfade, simulated speech, or continuous left/right sway. Pause, reduced motion, hidden pages, and offscreen visibility reset to neutral; resume begins the full front-facing rest again. Shared Pause/Resume controls both avatar and globe. The portrait box is anchored at bottom:0 of Core, with the MARI/PERSONAL AI text and factual caption above. The globe renders behind at twice its former projected diameter.

Artwork is decorative and independent of execution or connectivity. Browser evidence and its scope are recorded separately under `.impeccable/review/resting-v3/`. Source timing is not a guarantee of perceived motion quality.

## Exact generation prompt

Create a production-ready 2D anime character SPRITE ATLAS of Mari from Grand Chase for a calm personal-assistant portrait. Reference image 1 is the existing drawn portrait atlas; preserve that precise character model, costume, proportions, matte cel-shading, linework and identity. Reference image 2 is original character art for appearance. NEW atlas, not a UI mockup.

OUTPUT: 1536x1024 RGBA PNG, exactly SIX equal columns and FOUR equal rows, 24 cells of256x256, read left-to-right then top-to-bottom. ACTUAL fully transparent background; no solid/colored backdrop, no grid, text, labels, borders, checkerboard or watermark. Preserve transparent hair contours. Each cell shows complete head and upper shoulders at IDENTICAL scale, camera and registered anchor. Head centered near x128, ahoge top near y10. Shoulders extend to the BOTTOM EDGE y255 of every cell, so the portrait can sit flush at the bottom of a panel. Hair tips stay inside the cell. No book/hands.

Character: short cobalt blue bob with teal underside and small ahoge, delicate oval glasses, viewer-left BLUE iris and viewer-right RED iris, gold forehead ornament with cyan inset, tall dark collar with gold trim, modest white shoulders and cyan throat clasp. Cold robotic personality expressed by reserved steady gaze and closed neutral lips. A human anime character, not metal. No smiling, blush, talking, glossy rendering or glow.

CRITICAL CHANGE: DEFAULT IS PERFECTLY FRONT-FACING GENTLE BREATHING, NOT SWAYING. Both eyes stay facing camera; head NEVER drifts sideways, rotates, leans or tilts in the first TWO ROWS (frames0-11). Keep face center, eye line, nose, glasses and head orientation rigidly registered for all12 frontal drawings. Only a tiny inhale/exhale rise of the shoulders/chest (about1-2pixels at256cell size), minute lower hair-tip movement (about1pixel), calm reserved gaze and consistently open eyes. Avoid changes in face width, shading, clothing design or identity. These12 drawings must form a stable unhurried breathing loop: frame0 resting/exhaled; frames1-5 slowly inhale; frame6 gentle peak; frames7-11 relax back to frame0. DO NOT PUT SIDE MOVEMENT OR A BLINK IN ROWS1 AND2.

THIRD ROW frames12-17: six registered in-between drawings for ONE VERY SMALL LEAN TOWARD VIEWER-LEFT, starting almost identical to frontal frame0 and ending only3degrees tilted. No side-to-side oscillation and no dramatic eye glance. Keep shoulder base fixed and head displacement under3pixels; hair lightly follows the tiny tilt. All eyes open, neutral cold closed lips. This row will play forward slowly, hold, then backward to return to front.

FOURTH ROW frames18-23: corresponding six in-between drawings for ONE VERY SMALL LEAN TOWARD VIEWER-RIGHT, again starting almost identical to frame0 and ending only3degrees tilted. This is a SEPARATE occasional gesture and will NOT play immediately after the left lean.

Preserve exact outfit details and same scale across all24cells. Motion must be restrained and coherent. The assistant should rest FRONT-FACING for a long time breathing, with an isolated lean only after many seconds. Do not draw a globe, branding or UI; those are rendered separately.

## Historical assets

- `src/assets/mari-portrait-atlas-v2.png`: former continuous 24-drawing side/breath/hair loop. Retained as a style reference and unused by the active player. Its generation prompt is preserved in the earlier chat record; historical review `docs/design/motion-v2-finish-review.md` applies only to that version.
- `src/assets/mari-portrait-atlas-v1.png`: six-drawing predecessor, unused by the active player. Historical portrait review retains its original scope.
