# Mari memory, selected documents and phone access

The user approved the proposed first batch: local memory, Drive/Docs and Telegram. They selected Mari's own notes folder temporarily, with Obsidian later. This architectural extension preserves the single-page matte interface, JS/JSX code, native ChatGPT billing/authentication, existing per-project scope, and all image-approval/service boundaries. Existing user authorization covers implementing this batch; account secrets/pairing are supplied through the finished connection flow.

## Memory and context

Owner-created notes live persistently in the private database and as portable Markdown under the runtime's memory/notes folder. A note has a title, body, kind, source, revision, dates, explicit Personal / Project / Shared scope and an agent-context enable control. Personal and project scopes do not cross; Shared requires explicit selection. Search and edit preserve input on failure. No agent automatically writes or promotes memories. Up to eight relevant notes/documents, 12,000 total characters, are captured immutably when an agent turn or delegated goal is queued. All specialists inherit that goal's captured context. Source identities, revisions, capture dates and truncation are inspectable; retrieved content is reference data and cannot grant permissions. Notes export as Markdown for a future vault.

## Drive

Use the existing native connected Google Drive app with allowlisted read-only search/fetch tools, no model inference and no OAuth token copying. Search is metadata-only, bounded to twenty results, with opaque next-page handling. Import only an explicitly selected/pasted valid Google file URL. Cached text is bounded, dated and disabled for agent use until the owner enables it. Keep prior text on refresh failure with a stale/error indication. Docs/Sheets readable text is supported through the provider; unsupported/binary-only responses fail clearly. No source edits, background crawl or blanket Drive access by agents. Raw connector content is excluded from logs.

## Telegram

A dedicated bot uses the official HTTPS Bot API through an owned worker background bridge, independent of AI/service jobs. The owner supplies a token once; store it only in a private 0600 file, never return it or log request URLs/bodies. Pair a private Telegram user with a short-lived one-use code and explicit browser confirmation. Never adopt a group/channel or accept forwarded/bot commands. A configured coordinator and fixed Personal/project scope handle /goal, /status and /cancel for this binding's own goals; /help explains the interface. No remote design approval, implementation or account actions. Existing webhook bots are rejected without deleting their webhook. No public Mari endpoint/tunnel is exposed.

Persist update receipts atomically with queued goals for deduplication. Notifications contain bounded status metadata, never full notes/documents/results, and use a durable outbox. Publish team completion/failure/input-needed notifications from actual records. A sending record left by a crash becomes uncertain and is not replayed automatically; explicit retry may duplicate a previously delivered message. Binding/version checks, worker lease checks and abortable requests stop obsolete/disconnected bridges. Notifications require the paired owner and explicit enabled settings. Live setup remains unconnected until valid credentials, a worker and pairing exist.

## Verification

Test scope/revision bounds, secret handling, native read allowlists, pagination/parser failure, queued context immutability/inheritance, pairing/foreign-chat rejection, duplicate updates, cancel ownership, outbox uncertainty, disconnect/restart races and worker isolation. Use labelled synthetic account fixtures for write/poll tests; no real human messages without completed user pairing. Verify Firefox desktop/mobile and themes in bounded rounds; finish with fresh review/documentation, JEV sanitized design judgment and isolated Graphify refresh. No commits/deployment or unrelated process stops.
