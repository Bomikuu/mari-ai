---
name: Mari Personal Command Center
description: A private local operations workspace with a restrained technical identity.
colors:
  background: "#f6f6f6"
  foreground: "#171717"
  card: "#ffffff"
  panel: "#ffffff"
  popover: "#ffffff"
  input-surface: "#fafafa"
  core-surface: "#fafafa"
  log-surface: "#fafafa"
  primary: "#315da5"
  primary-hover: "#264b8b"
  primary-foreground: "#ffffff"
  secondary: "#e9e9e9"
  muted: "#eeeeee"
  muted-foreground: "#585858"
  text-secondary: "#414141"
  accent: "#e2e2e2"
  link: "#315da5"
  success: "#08734e"
  success-foreground: "#ffffff"
  warning: "#7a5000"
  info: "#315da5"
  destructive: "#aa2438"
  destructive-fill: "#aa2438"
  destructive-foreground: "#ffffff"
  error-surface: "#fff0f1"
  error-border: "#b34a58"
  notice-surface: "#eeeeee"
  border: "#cacaca"
  panel-border: "#c7c7c7"
  input: "#767676"
  ring: "#315da5"
  focus-outline: "#315da5"
  selection: "#d5e1f4"
  selection-foreground: "#182844"
  scrollbar: "#828282"
  scrollbar-track: "#eeeeee"
  globe-line: "#526f9d"
  globe-line-working: "#315da5"
  globe-line-running: "#426391"
  globe-line-muted: "#656565"
  identity-blue: "#4a9dca"
  identity-blue-dark: "#245581"
  identity-red: "#cf5967"
  identity-red-dark: "#7c3044"
  identity-gold: "#88632c"
  identity-paper: "#fffaf0"
  identity-ink: "#202738"
  identity-sclera: "#f3eee5"
  identity-outline: "#45536d"
typography:
  body:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  headline:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  panel-label:
    fontFamily: "Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "0.18em"
  code:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "12px"
rounded:
  small: "3px"
  badge: "4px"
  control: "5px"
  panel: "7px"
  dialog: "8px"
spacing:
  compact: "8px"
  mobile-group: "10px"
  group: "12px"
  workspace-gap: "14px"
  panel-inline: "15px"
  section: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    height: "36px"
  input:
    backgroundColor: "{colors.input-surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "36px"
  operational-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "0 15px 14px"
---

# Design System: Mari

## Overview

**Creative North Star: "Private operational command center"**

Mari preserves the user's selected second concept's compact command-center composition, central assistant area, and readable operational panels. The composition reference is `docs/design/mari-command-center-v2.png`; the first generated concept was rejected. The latest correction uses the v3 24-drawing portrait for front-facing breathing by default, with rare one-sided leans after long frontal rests. The avatar sits at Core’s bottom with a faint Three.js globe behind it at twice its base projected diameter. Retain the MARI text title and PERSONAL AI subtitle; remove only the separate graphic illustration logo. The dark palette still derives from Mari’s coat, hair, gold, and red details. That palette supersedes the earlier pure-black direction. The supplied Grand Chase Mari reference and official [PlayPark character introduction](https://gcc.playpark.com/update/get-acquainted-with-the-awesome-characters/) inform a blue bob, blue/red eyes, thin glasses, gold crest, and high collar. A cold, robotic personality is the user's art direction, not a claim that the character is literally an android.

The home view establishes project, worker, task, and artifact context. Selecting a task enlarges its actual images and decisions in the same page. Horizontal workspace controls expose project management, explicit folder scans, installed Codex skills, and reusable agent profiles. Product state comes from observable execution; configured profiles remain separate from live executions. The portrait uses front-facing drawn breathing and hair motion, with a rare lean to one side, a return to front, and a long rest before another gesture. Keep its reserved expression and closed lips; the first 12 breathing drawings contain no blink. Its animation is decorative and independent of task activity; the factual caption remains separate.

**Key Characteristics:**

The **GitHub** workspace is another token-preserving Operate extension. `src/components/GithubWorkspace.jsx` and its adjacent CSS use shared controls and flat source rows, with inline repository linking, project-scoped tabs, factual job activity, neutral loaded counts, source-age labels, and explicit CI coverage. It adds no palette or avatar changes. Its surface contract is `.impeccable/surfaces/github-workspace.md`; Firefox evidence and the finite review are recorded separately.

The **Today** context extends this system with Google email/calendar briefs and Pixelpop tasks, meals, nutrition goals, and weight. It occupies the existing main workspace without a project selection, inherits the same tokens and typography, and uses official shared tabs, dialogs, inputs, and buttons. Its source is `src/components/PersonalWorkspace.jsx` and `personal-workspace.css`; its scoped contract is `.impeccable/surfaces/personal-workspace.md`. Google content is explicitly refreshed, source-linked, and dated; Pixelpop forms expose confirmed upstream results and connection errors. The avatar, palette, and project workflow remain governed by the existing contracts.

- Neutral light surfaces and a Mari-inspired midnight dark palette
- A bottom-anchored 2D portrait with frontal breathing, rare one-sided leans, and a faint enlarged globe behind it
- Blue actions, gold focus, and restrained rose details
- Observable execution and dominant selected artifacts
- MARI text title and PERSONAL AI subtitle, without a separate graphic illustration logo or navigation sidebar

Source of truth: palette tokens come from `src/themes.css`; the frontmatter records all 49 light `:root` colors, and `.impeccable/design.json` extends them with all 49 exact dark overrides. Typography and layout come from `src/index.css` and the shared primitives in `src/components/ui/`; component usage is in `src/App.jsx`, `src/components/Primitives.jsx`, `src/components/ProjectManager.jsx`, `src/components/ResourcesManager.jsx`, and `src/components/TaskWorkspace.jsx`. Resource and project layouts also use their adjacent CSS files. Theme selection is defined in `src/components/ThemeToggle.jsx`, `src/lib/theme.js`, and the pre-paint script in `index.html`. Core lazy-loads both `MariPortrait.jsx` and `MariGlobe.jsx`; their adjacent styles define the transparent portrait and faint globe layers. The active atlas is `src/assets/mari-portrait-atlas-v3.png`, and `src/lib/portrait-motion.js` owns its sequence and holds. `BrandMark` is removed; the MARI text title and PERSONAL AI subtitle remain in Core, header, pairing, and loading views. The v1/v2 atlases and `MariEyes.jsx`/`mari-eyes.css` remain historical source. Surface scope belongs in `.impeccable/surfaces/command-center.md`. This refresh reconciles source and does not claim computed-style measurement, a browser review, perfect smoothness, or physically certified motion. Current verification belongs in `docs/verification.md`; historical reviews retain their original scope.

## Colors

Light mode uses a soft neutral canvas and white panels. The latest dark palette uses midnight coat-inspired surfaces, blue hair-inspired actions and globe lines, gold focus, and restrained rose details. The raster portrait retains its drawn colors across themes. Green/teal, amber, and rose convey success, waiting, and error with accompanying text. Decorative eye colors remain separate from semantic status: the red iris does not signal an agent error. Interface fills are flat, without gradients, glossy fills, glow, or glass.

The primary pair belongs to affirmative actions; secondary and accent tones belong to quieter controls and hover states. Background, panel, popover, core, and field surfaces establish layers; card and panel intentionally share a value within each mode. Border and input are stroke tokens; input-surface is the field fill. The ring token supplies component focus borders, while focus-outline supplies the global offset outline. Retained identity tokens support historical SVG source; the active raster is not recolored with them.

| Token | Light | Dark |
| --- | --- | --- |
| background | `#f6f6f6` | `#0a0d18` |
| foreground | `#171717` | `#e9edf8` |
| card | `#ffffff` | `#11172a` |
| panel | `#ffffff` | `#11172a` |
| popover | `#ffffff` | `#1b233b` |
| input-surface | `#fafafa` | `#10182b` |
| core-surface | `#fafafa` | `#0c1325` |
| log-surface | `#fafafa` | `#10182b` |
| primary | `#315da5` | `#91b8ef` |
| primary-hover | `#264b8b` | `#b0ccf3` |
| primary-foreground | `#ffffff` | `#111e35` |
| secondary | `#e9e9e9` | `#1e2944` |
| muted | `#eeeeee` | `#19223a` |
| muted-foreground | `#585858` | `#abbad3` |
| text-secondary | `#414141` | `#ccd5e8` |
| accent | `#e2e2e2` | `#273654` |
| link | `#315da5` | `#b0ccf3` |
| success | `#08734e` | `#83d4bb` |
| success-foreground | `#ffffff` | `#05251f` |
| warning | `#7a5000` | `#dfbe80` |
| info | `#315da5` | `#91b8ef` |
| destructive | `#aa2438` | `#e98599` |
| destructive-fill | `#aa2438` | `#b9344c` |
| destructive-foreground | `#ffffff` | `#ffffff` |
| error-surface | `#fff0f1` | `#351d2a` |
| error-border | `#b34a58` | `#c36b83` |
| notice-surface | `#eeeeee` | `#19223a` |
| border | `#cacaca` | `#303d58` |
| panel-border | `#c7c7c7` | `#3a4560` |
| input | `#767676` | `#7184a7` |
| ring | `#315da5` | `#d0af75` |
| focus-outline | `#315da5` | `#d0af75` |
| selection | `#d5e1f4` | `#3b5178` |
| selection-foreground | `#182844` | `#f4f7ff` |
| scrollbar | `#828282` | `#7184a7` |
| scrollbar-track | `#eeeeee` | `#10182b` |
| globe-line | `#526f9d` | `#91aace` |
| globe-line-working | `#315da5` | `#b0ccf3` |
| globe-line-running | `#426391` | `#9ab8df` |
| globe-line-muted | `#656565` | `#a2aec5` |
| identity-blue | `#4a9dca` | `#91b8ef` |
| identity-blue-dark | `#245581` | `#385a87` |
| identity-red | `#cf5967` | `#e98599` |
| identity-red-dark | `#7c3044` | `#873e59` |
| identity-gold | `#88632c` | `#d0af75` |
| identity-paper | `#fffaf0` | `#fff7e8` |
| identity-ink | `#202738` | `#111e35` |
| identity-sclera | `#f3eee5` | `#e9edf8` |
| identity-outline | `#45536d` | `#b6c5df` |

The `globe-line*` tokens are active again in the surrounding globe. Light is the base CSS palette, not a forced runtime preference. The labeled Sun/Moon header control offers the other mode. With no valid saved choice, the application follows `prefers-color-scheme`, including changes while open. An explicit choice persists in local storage as `mari.theme`; storage events synchronize tabs. The head script sets `data-theme`, the shared primitive `.dark` class, and browser theme color before the application renders (`#f6f6f6` light / `#0a0d18` dark). Storage failure still permits switching in the current tab. Theme changes preserve the user's motion choice and reduced-motion preferences.

## Typography

Use a familiar sans-serif stack throughout interface copy, a compact fixed pixel hierarchy, and monospace only for commands, paths, and execution data. Section labels use 11px uppercase lettering with 0.18em tracking. Main task titles use 22px at 600 weight, reducing to 19px on mobile. The body role is 14px with a 1.5 line height; compact operational copy is commonly 10–12px. Panel labels reduce to 10px at compact desktop widths and below. Inter is preferred in the CSS stack but is not bundled or remotely loaded, so system fallbacks are expected.

Retain the MARI text title and PERSONAL AI subtitle in Core, the header home button, pairing, and loading views. The header title uses 23px, 600 weight, and 0.22em tracking with a 7px subtitle; Core uses a 20px, 600-weight title and a 7px subtitle at its upper-left. The header button retains the accessible label “Command center home.” The separate graphic illustration logo remains removed.

## Layout

No persistent sidebar or navigation rail. Desktop home has three upper panels, two middle panels, and three lower panels. Header and command dock span the page. A horizontal row below the header contains Projects, Scan folder, Skills, and Agents; controls wrap as space narrows and the summary hides on mobile. The central Core places a transparent square 230px portrait at z-index 1, absolutely positioned at `bottom: 0; left: 50%` and centered horizontally with `translateX(-50%)`. The absolute inset globe sits behind it at z-index 0 and 0.44 opacity. Core passes `sizeScale={2}`: WebGL doubles its base projected radius and diameter, and the SVG fallback scales its geometry by two around the same center. The host bounds and clipping stay in place. Base Core minimum height is 330px, with no flex gap or padding. At 640px the portrait becomes 196px and the Core minimum height becomes 300px. Source breakpoint rules remain authoritative for the complete cascade. The text title/subtitle sit at `top: 16px; left: 16px`; the separate factual caption sits at `top: 61px`, with 16px left and 54px right offsets. The shared motion control sits upper-right above both layers.

The workspace caps at 2000px and uses 18px desktop side padding, 14px at tablet widths, and 10px on mobile. Home grids use 12px gaps, reducing to 10px on mobile. Panels use `0 15px 14px` padding, with breakpoint-specific adjustments; selected task content uses 20px padding, then 16px at tablet widths and 12px on mobile. At 1250px controls and table columns compact; at 1600px the header and upper panels gain height. At 960px the home layout reduces columns; at 640px it stacks into one column and the command dock wraps. The dock is sticky at the bottom. Two-image comparisons become one column on mobile; three-image comparisons first become two columns at compact desktop widths.

Project management exposes the complete searchable saved-project table and explicit folder-scan results. Tables retain paths, framework/package manager, Git state, observed service health, and actions, with horizontal access inside their own scroll regions. The saved-project table has an 800px minimum width; scan results have an 850px minimum width. Saved roots and available snapshots expand under Previously scanned folders with separate View results and Rescan actions.

Skills and Agents replace the main home/task content in place while keeping the shell and dock. Skill instructions and profile editors sit beside lists on desktop, then stack at 960px. Resource grids use 14px gaps. Lists and instructions scroll within their own regions; long paths and instructions wrap. At 640px profile fields and skill-binding checkboxes use one column, actions wrap, and resource headings reduce in size.

The agent roster is the dock exception: managing profiles hides the command dock to free workspace space, including on mobile. Search and wrapping category buttons precede a grid of individual profile cards on the workspace ground. The section heading, configured count and divider stand directly above that grid without an enclosing card. Four desktop columns show the requested row-major order: Elesis, Lire, Arme, Amy / Mari, Rohan, Lass, Zero / Jin, Dio, Ryan, Sieghart. The grid reduces to three columns at 1100px, two at 820px and one at 540px, preserving that order. The inline editor follows the existing desktop-to-mobile stacking behavior; expandable starter rows remain a separate section.

Direct agent chat also replaces the main content and global dock in place. Its centered column caps at 1120px, with profile identity and worker state above context/history selectors and Chat/Tasks/Activity tabs; delegation-enabled profiles and conversations with saved teams also expose Team. A flexible scrolling transcript sits above its own sticky composer; flat dividers separate messages and execution details. The Team panel scrolls within that same workspace. At 640px the heading stacks, context/history controls collapse behind an expandable summary, and the composer stays reachable. Only in this mobile chat context, the horizontal workspace tools use their own scrolling row. This responsive exception does not add a sidebar or alter the home layout.

Knowledge uses a centered workspace capped at 1200px, with a compact back control and heading above Local memory / Google Drive / Telegram tabs. Notes pair a searchable flat list with an inline editor; Drive pairs metadata search with a selected-file import form; Telegram places settings beside private-user confirmation and the command reference. At 800px and below these pairs stack into one column, headings/actions wrap, and document scope controls use the available width. Long titles, storage paths, revisions and source text wrap; previews scroll within bounded regions. Scope, context enablement, saving and disconnect remain reachable in the stacked layout.

## Elevation & Depth

Use solid tonal surfaces and fine rules. Panels and Mari dialogs have no decorative shadows; shared buttons, inputs, and Mari tabs suppress component-library shadows. Focus uses a two-pixel theme-aware outline with a 3px offset: sapphire in light mode and gold in dark mode. Hover and selected surfaces change tone subtly. Dialog overlays use the shared primitive's translucent black backdrop without glass or blur. The faint globe remains behind the portrait and does not obscure its expression or factual caption.

## Shapes

Controls have 5px corners, operational panels 7px corners, Mari dialogs 8px corners, compact badges 4px corners, and small tab triggers 3px corners. Round dots carry status. The central identity is a full head and upper shoulders drawn inside a square raster sprite surface: blue bob, blue/red heterochromia, thin glasses, gold crest, and high collar. Keep the closed-lip expression reserved while drawing front-facing breathing and hair motion into actual frames; use separate one-sided lean drawings for occasional gestures. Use Lucide icons consistently with thin strokes. Render no separate graphic illustration logo or emblem.

## Components

The newspaper's own surface is Read mode, recorded in `.impeccable/surfaces/newspaper-workspace.md`. The November 9 owner-supplied front-page reference replaces the former fixed two-page composition. A large MARI DAILY masthead, warm paper, near-black serif type, dark red section labels, thin rules, lead/photo pairing, top-stories rail and horizontal markets band define the page. Preserve the surrounding app themes and controls. Do not invent weather, issue numbers, founding dates, page-jump references, stories or charts to imitate the sample.

PDFKit measures each line using embedded self-hosted DejaVu fonts and stores a public print plan with no filesystem paths. React paper preview and native A4 print paint that plan directly. Try 9.2/8.8/8.4/8.2pt body text on one page, then retain full 9.5pt summaries on two pages. Publisher metadata can supply two sanitized, credited images; unavailable images remain omitted. Preserve the complete image with containment, rather than cropping a different subject. Mobile defaults to a 15px reading view and can switch to the scaled paper composition. Historical editions without a v2 plan keep their original legacy view. A layout-only reflow preserves reporting times and the prior PDF artifact.

Video and Voice extend the same workspace controls. A narrow preparation column shares one continuous panel with a dominant native player; mobile stacks settings above output. Per-project Create video actions preserve context in place. Readiness and process ownership remain explicit, playback is manual, credits stay with video output, and saved output selection leaves draft settings intact. Terminal jobs label retained activity as “Last action”; the renderer version is attributed to Hyperframes. Keep the existing avatar/globe behavior unchanged. Surface contract: `.impeccable/surfaces/media-workspace.md`; evidence and final verdict: `docs/design/media-finish-review.md`.

Shared primitives are official shadcn/ui JSX components installed through the CLI. Mari wrappers provide product-specific labels and data. Service command confirmation exposes resolved configuration before first start. Owner sessions and image approval remain backend enforced. Logs expose source, timestamp, output, search, download, and scroll-follow controls. Agent inspectors distinguish connectivity from execution status and retain historical timelines.

Buttons use the primary pair for affirmative decisions, outlined or ghost variants for secondary actions, 5px corners, and a 36px base height. Context-specific controls are smaller. The header theme control uses the official outlined primitive, 36px height, and a label naming the mode it will activate; its accessible label includes “Switch to … mode.” Disabled controls lower opacity and stop pointer interaction. Fields use the input stroke and input-surface fill; the dock's inner field is transparent inside a 40px outlined wrapper. Panels have a one-pixel panel-border and a border-token divider below their secondary-text heading. Status chips are unfilled dot-and-label pairs. Local tabs use panel fill, primary text, input stroke, 3px trigger corners, and horizontal scrolling on mobile.

Workspace controls use compact ghost buttons; primary text on the accent surface marks active context. Resource tabs use a primary underline and text for selection. Skill rows show native names, descriptions, paths, scope, local/plugin source, and enabled state; details show installed instructions as text. Inventory defaults to Mari · installed and offers Selected project with independent search and scope filters. Reading a skill does not execute it.

Configured profiles expose name, role, description, instructions, enabled state, and installed skill bindings. Creation and editing share an inline panel; imports show a review preview, exports download JSON, and expandable starter templates install saved profiles without starting a job. Unavailable bindings remain visible. Removal uses a focused confirmation dialog and preserves task history. New-task settings and task workspace select Default Codex or an available enabled profile for the next AI action; running jobs retain their captured profile. Profiles cannot expand execution permissions, approve images, change billing, or bypass workflow rules. Folder discovery starts only from the requested root and presents bounded results, errors, scan time, and truncation. Saved results are snapshots; Rescan refreshes metadata. Registration is explicit and starts no services.

Roster profiles add category and decorative identity using the existing semantic colors, type and shared controls. Square portraits use a fine border and offset outline with softly rounded corners; the existing identity-gold token marks selected profiles and picker choices. The picker names Elesis, Lire, Arme, Amy, Mari, Rohan, Lass, Zero, Jin, Dio, Ryan and Sieghart, credits generated chibi fan art for Mari, and retains an initials option and image-failure fallback. Active 256px WebPs in `src/assets/agents/chibi-v1` are recognizable chibi interpretations generated from the supplied Grand Chase roster reference; prompt/source provenance is embedded in each asset and recorded in `docs/design/agent-portraits/chibi-v1.generation.json`. They supersede the historical screenshot crops without changing character IDs or saved selections; the stable `ronan` portrait ID is labeled Rohan. Portraits remain decorative beside readable unique names, separate role titles and factual live/queued captions. Card selection opens chat; the pencil retains inline editing, including explicit delegation and archive settings. Include archived profiles exposes the reversible legacy reviewer archive. Role assignments imply no game canon or activity. The current surface contracts are `.impeccable/surfaces/agent-roster.md` and `.impeccable/surfaces/agent-chat.md`; the team extension's finish disposition is in `docs/design/agent-teams-finish-review.md`. The direct-chat and earlier roster reviews retain their historical scopes.

Agent conversations reuse shared labeled controls and the existing underline selection treatment. The header separates specialist identity from factual worker status and the confirmed concurrent-execution capacity caption. Context, conversation history and New chat remain explicit. Chat pairs readable message bylines and Asia/Manila timestamps with a Chat/Assign task composer, with Delegate goal for profiles explicitly permitted to coordinate specialists; Tasks exposes expandable results and response/file downloads. Activity reuses the event rows with Commands, Output and Errors filters and a conversation-scoped timeline download. Current execution, elapsed/last-activity time, retry and cancellation stay separate from decorative portraits. Offline, queued, completed and interrupted states use factual copy rather than simulated thinking or staff availability. Captured instructions and scope expand within Activity; website changes link to the existing project-aware capture/design workflow.

Knowledge extends the established Inter hierarchy, matte semantic surfaces and official shared controls. Selected note rows use the existing accent fill; local memory exposes kind, scope, context enablement and Markdown export beside its editor. Drive rows retain full Manila import dates, visible cached/error copy, expandable text and complete revision previews, a source link and explicit context opt-in. The private bot token uses a password field, clears after connection attempts and is never prefilled or returned. Pairing presents the exact candidate for owner confirmation. Delivery rows label pending, sent, failed, cancelled or uncertain states and provide explicit retry only where available; “Sent” denotes API acceptance. Captured knowledge expands inside the existing Activity inspector with source scope, complete revision, link, full capture/save/fetch/source-modification dates, and stale/truncated flags. This ordinary extension adds no new palette, raster, decorative motion or design tokens. Its [surface contract](.impeccable/surfaces/knowledge-access.md) and [finish review](docs/design/knowledge-access-finish-review.md) retain the setup and evidence boundaries.

The Team tab in a coordinator conversation adds a compact goal heading with expandable full instructions, an actual lifecycle status and group cancel/retry controls. Flat assignment rows pair portraits, separate roles, bounded instruction previews and real job/agent activity with Inspect and expandable saved results/artifact downloads. Long goals and assignments expand without displacing current activity. Selecting a specialist switches the existing workspace context; its parent-goal link returns to the coordinator. Native planning and synthesis use the same private conversation controls and artifact conventions, with the completed synthesis saved in Chat. Capacity comes from online worker capabilities; offline capacity is unconfirmed. Profiles do not represent a connected process until actual execution. This ordinary extension preserves the established matte themes, typography, controls and rasters.

The portrait is an accessible `role="img"` surface labeled “Mari character portrait,” with a per-instance description explaining loading, failure, reduced motion, pause, or independence from task activity. The active `src/assets/mari-portrait-atlas-v3.png` is a built-in image-generation output, without an API fallback. It is a 1536×1024 RGBA atlas: six columns and four rows of 24 square 256px cells. CSS uses `background-size: 600% 400%` on a transparent background. Discrete positions select complete drawings; no CSS bobbing, crossfade, morphing, gaze tracking, or simulated speech/listening is applied.

One pending timeout follows `src/lib/portrait-motion.js`. Front-facing breathing uses frames 0–11 at 240ms each, a 2.88-second loop without a blink. Nine loops provide 25.92 seconds facing front before a left lean plays `12 → 13 → 14 → 15 → 16 → 17 → 16 → 15 → 14 → 13 → 12`. Each step holds 180ms except peak frame 17 at 1800ms, making a 3.6-second gesture. Neutral frame 0 holds 240ms, then ten breathing loops provide a total 29.04-second frontal rest before the equivalent right lean uses frames 18–23–18 with peak frame 23 at 1800ms. A final 240ms neutral return completes the 252-step, 62.4-second repeating sequence. Portrait playback receives no execution or availability props. Pause, reduced motion, hidden pages, and offscreen visibility clear the timer and reset neutral frame 0; resume restarts the full 25.92-second frontal breathing rest before a lean. Visibility and intersection observation stop hidden/offscreen work, with passive scroll/resize fallback. Shared preload awaits decode and validates a nonzero six-by-four grid of square cells. Loading says “Loading portrait…”; failure says “Portrait unavailable. Reload to retry.” Cleanup clears the timer, observers, and listeners and guards stale load callbacks.

Core owns one official ghost icon-sm motion button with “Pause avatar and globe animation” / “Resume avatar and globe animation” action labels. It passes the same controlled pause state to both lazy-loaded children; their own controls remain hidden (`showControls=false`). Reduced motion disables the shared control and overrides Resume. A child loading or failure state does not disable this parent control. The portrait keeps its drawn colors across themes; globe lines follow current theme and factual activity styling. The globe's ambient movement does not establish execution. It caps pixel ratio at 1.5 and rendering at 30fps, stops for pause/reduced motion/hidden/offscreen states, handles context loss/restoration, disposes renderer resources on unmount, and retains a static SVG fallback when WebGL is unavailable. The separate upper caption remains factual task/worker text. Header, pairing, loading, and Core retain the MARI text title and PERSONAL AI subtitle; no separate BrandMark graphic is rendered.

State changes use the source's 160ms ease transitions for border, background, and color. Busy spinners indicate actual pending operations; shared dialogs declare 200ms entry/exit duration. CSS reduced-motion preferences reduce interface transition and animation duration to 0.01ms and limit animation iterations to one. The sidecar’s portrait-and-globe preview is a static source-derived specimen: v3 neutral frame 0 anchored at the bottom, retained MARI/PERSONAL AI text, and faint SVG geometry scaled by two. It executes neither the player nor WebGL and does not establish browser QA or motion smoothness.

## Do's and Don'ts

- Do preserve the selected reference's compact command-center composition on this surface.
- Do preserve light mode and the latest character-derived dark palette through shared semantic tokens.
- Do make the selected artifact and its next decision dominant.
- Do show unknown, disconnected, external, and waiting states explicitly.
- Do keep service output and agent execution events identifiable.
- Do distinguish installed skill context, configured profiles, and live executions.
- Do keep the portrait independent of operational state and preserve the separate factual caption.
- Do use the v3 raster drawings for frontal breathing and hair motion with rare one-sided leans after long rests, and one shared avatar-and-globe motion control.
- Do stop hidden/offscreen work, honor reduced motion, and reset interrupted portrait playback to neutral plus a full frontal rest.
- Don't use the decorative red iris as an error signal or animate the portrait in response to work, talking, or listening.
- Don't use invented numbers, progress, agents, integrations, or terminal streams.
- Don't reintroduce a sidebar, gloss, neon glow, a separate graphic illustration logo, or unrelated dashboard features; retain the MARI/PERSONAL AI text.
- Don't restore the rejected six-frame eye-only loop, CSS bobbing, or crossfades between drawings.
- Don't promote historical screenshots or the superseded pure-black palette over the latest user direction.

The approved Telegram conversation extension retains the Knowledge layout, matte tokens and existing shared controls. Setup copy distinguishes Mari normal chat from the goal coordinator, names the fixed phone context, explains direct answer/image delivery separately from optional status notifications, and lists /image, /new, /status and /cancel. Delivery rows now use Telegram delivery as their heading. A current request error takes precedence over a saved prior connection error. Four Firefox views cover desktop/mobile and both themes with zero page errors or horizontal overflow; final labels were confirmed in the second bounded copy pass. Evidence: docs/research/2026-11-07-telegram-conversation-verification.md.

The project-structure refinement keeps the existing Operate table, tabs, matte tokens and shared official controls. Expandable per-project component details show service candidates and packages. Services exposes flat detected-command rows with actual child paths and Configure actions; root scripts disclose their possible orchestration role. Browse opens the system folder chooser, with a folder-first fallback using Home/Parent navigation and collapsed manual entry. Cancellation preserves the prior value. Native-unavailable and old-scan states explain the next action. The service workspace remains open while selecting/configuring a project. Firefox desktop/mobile and both themes passed the bounded inspection; output/playwright/project-structure records the scenes.

Markets and X news extend the Operate workspace through horizontal controls and existing official tabs, inputs and buttons. Markets gives the candle chart the dominant area, with a compact watchlist and expandable accessible candle table; portfolio values and transactions use tabular numerals and flat tables. Preferences and requested analysis expand inline. X uses a chronological text-first feed with author/date/cache attribution, local actions and separate Accounts/Access/Summary tabs. Paid-read consent is distinct from saving a credential. Mobile tabs form two clear columns, tables scroll within their own region, and the project command dock is absent in these contexts. Current matte themes and typography remain unchanged. Source freshness, unavailable volume, unknown basis and stale analysis are explicit. Firefox desktop/mobile and both themes passed the bounded two-round review recorded in output/playwright/markets-x.


The For you extension continues the same paper, masthead, red section heads and thin rules. Its three narrow columns carry today's agenda, selected email previews and attributed X excerpts. Source times and a private-edition footer make its scope explicit. It appends to a sparse front page when measured space permits, otherwise uses sheet two. A compact news grid keeps all eight complete summaries within the two-sheet budget on dense days. Print limits are eight calendar entries, three emails and three posts, with omitted counts and the complete returned agenda/mail list in the mobile-friendly reading view. Personal-source preferences live in one collapsed disclosure above the paper; no extra route, dashboard or visual world is introduced. The finish record is `docs/design/2026-11-09-newspaper-personal-finish.md`.
