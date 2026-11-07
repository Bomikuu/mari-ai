# Knowledge and Telegram verification

The user approved local memory + Drive/Docs + Telegram, and chose Mari's own notes folder temporarily before creating Obsidian. Implementation adds no TypeScript, model-provider billing fallback, public server endpoint, target source-write authority or design-approval bypass.

The final [finish review](../design/knowledge-access-finish-review.md) records **SHIP** after three findings were resolved: send-time notification consent/revocation, versioned private-user binding with obsolete-send uncertainty, and fully inspectable dated source provenance. The [specification](../superpowers/specs/2026-11-07-knowledge-phone-design.md) and [implementation plan](../superpowers/plans/2026-11-07-knowledge-phone.md) retain the approved scope. This record reconciles the frozen final source and existing run artifacts; the documentation pass did not rerun account checks or tests.

## Native evidence

[The native check](../../output/knowledge-native-check.json) records an actual ChatGPT-authenticated Codex check. A native read-only Drive inspection confirmed the connected app; no files were searched/read. One real model turn received a captured synthetic personal note and returned its requested marker. The private temporary runtime was removed and the test worker/server stopped. Drive files read: zero. Telegram sends: zero. This proves native context injection and account connectivity, not live file parsing/import for a user-selected document or live bot delivery.

[Installed native capabilities](../../output/knowledge-native-capabilities.json) record connector tool schemas/annotations, including metadata-only `google_drive.search` and readable-text `google_drive.fetch`. The adapter allowlists those two read-only tools, uses an ephemeral read-only thread and never calls turn/start. Provider raw arguments/results are excluded from execution logs. The official [Telegram Bot API](https://core.telegram.org/bots/api) informed getMe, getWebhookInfo, getUpdates and sendMessage. No destructive bot method is exposed.

## Automated and Firefox evidence

| Recorded evidence | Result and boundary |
| --- | --- |
| [Full suite](../../output/knowledge-full-tests.txt) | 205 passed, zero failed/cancelled/skipped. Includes nine knowledge and fifteen Telegram tests. |
| [Focused suite](../../output/knowledge-focused-tests.txt) | 24 passed, zero failed/cancelled/skipped, including the final consent, binding and date regressions. |
| [Production build](../../output/knowledge-build.txt) | Passed; the existing Three.js chunk-size warning remains. |
| [Firefox checks](../../.impeccable/review/knowledge-access/checks.json) | Ten synthetic captures at 1440/390 CSS pixels in both themes; equal viewport/scroll widths and zero recorded JavaScript errors. |

Knowledge tests cover private Markdown mirrors, redaction, validation, symlink refusal, strict personal/project/shared selection, bounded excerpts, immutable queued revisions and specialist inheritance, native read options, malformed/unsupported content, stale retention, offline reads and owner authentication. Telegram tests cover private credentials, exact-candidate confirmation, foreign/forwarded/bot rejection, duplicate goal receipts, late disconnect/scope changes, own-goal cancellation, metadata-only notifications, delivery uncertainty, rate limits, lease ownership, webhook preservation and malformed send confirmation. No real account writes occur in these tests.

All ten Firefox captures use synthetic notes, documents, bot identities, native-tool results and model output in an isolated runtime. The actual route/worker flow checks note create/edit/export, Drive import disabled by default and explicit enabling, exact-user pairing, a phone goal inheriting note+document context, and context inspection. No real Telegram messages or Drive files are used. “Sent” in a capture represents an injected successful Bot API response. The [Drive desktop capture](../../.impeccable/review/knowledge-access/drive-light-desktop.png) shows a Nov 4 import with a failed-refresh explanation against a Nov 7 connection/search date. The [captured-context inspector](../../.impeccable/review/knowledge-access/captured-knowledge-light-desktop.png) shows Nov 7 capture/save dates, Nov 4 fetch, Nov 3 source modification, scope, complete revision and source link. The final check records `agedSourceProvenanceInspectable: true`.

During QA, a controlled document checkbox needed immediate pending feedback, and opaque Drive page tokens needed a public cursor name to avoid the generic credential redactor. Both were corrected. The final delivery corrections check current consent atomically before sending and after the response, cancel revoked pending alerts, and use the confirmed candidate's `paired.id` as the binding identity. Re-pairing invalidates old ownership and aborts obsolete requests; an already dispatched send remains uncertain. [Before-correction regressions](../../output/knowledge-review-regressions-before.txt) preserve the initial failures; the final focused suite passes them. The finish reviewer independently reran four targeted consent/binding/date checks and inspected all ten final captures.

## Structural and design evidence

[Graphify validation](../../graphify-out/application/knowledge-refresh-validation.json) records 111 source files with matching SHA-256 and manifest MD5 values, 879 nodes, 3,361 edges and 32 communities. All eight original requirements artifacts remain unchanged. The [extraction](../../output/knowledge-graphify-extract.txt) and [render](../../output/knowledge-graphify-render.txt) used zero external API/LLM calls. This is source-structure and integrity evidence, not functional proof.

[The JEV result](../../output/knowledge-jev-result.json) records a **scoped** judgment from the user's explicitly authorized configured provider. Only a sanitized design description was supplied, with no source, private account data or credentials. This is a model judgment, not execution or security proof.

Impeccable's detector was attempted once, but its launcher lacked execute permission ([recorded error](../../output/knowledge-design-detect-error.txt)); no permissions were changed and no successful automated design scan is claimed. There is no measured contrast result, keyboard/screen-reader certification, physical-device/touch validation or comprehensive accessibility certificate. Existing rasters, provenance, DESIGN.md token frontmatter and the design sidecar remain unchanged by this extension's documentation pass.

## Setup and practical limits

Live Telegram requires the user to supply their dedicated bot token through the local form, open the ten-minute pairing link and confirm the exact private user. It remains unconfigured until that happens. Drive imports require an explicit file selection and supported readable text; imported text starts disabled for agents. No arbitrary document was read merely to demonstrate the integration. Notes persist in the database and as private Markdown mirrors under `<MARI_DATA_DIR>/memory/notes`; this is persistent storage, not a disposable cache. Export supports a future vault without claiming Obsidian scanning or sync exists.

Knowledge is captured when queued; editing, disabling or deleting an item does not alter saved captures or retract text already supplied to running work. The coordinator, specialists and synthesis share the goal snapshot, including on retry. Sources remain untrusted reference data and do not expand agent permissions.

Telegram needs Mari's normal worker/computer online. The phone interface submits goals/status/own-goal cancellation, but does not expose the private localhost UI or approve website changes. Optional notification consent is checked at delivery separately from explicit command/pairing replies. A successful send response establishes Telegram API acceptance, not that the user read the message. Ambiguous or obsolete in-flight sends require explicit retry and may duplicate an accepted message. Live user pairing/delivery, actual selected-file parsing, arbitrary file formats, screen readers and a future Obsidian vault were not verified.
