# Newspaper personal-source verification

Implemented a private For you briefing for selected X posts, custom-rule mail and today's primary Google Calendar. The owner specified two exact sender addresses and Wise, excluding calendar invites. The rule is saved privately with `newer_than:2d` (a 48-hour Inbox window), exact-address/domain post-filtering, invitation attachment/subject/MIME exclusion, and security-code preview masking. Wise's official `@wise.com` sender domain was checked against its [notification help](https://wise.com/help/articles/2952327/how-do-i-manage-my-notifications). These filters select source previews; no inferred importance judgment is claimed.

## Execution

- `npm test`: **279 passed, zero failed** — `output/newspaper-personal-full-tests.txt`.
- `npm run build`: passed — `output/newspaper-personal-build.txt`. Existing large globe chunk advisory remains.
- `git diff --check`: passed.
- Google native read: succeeded, zero matching email items and zero primary-calendar events for November 9. Used only discovered read-only tools, an ephemeral native session and no inference turn. Metadata-only result: `output/newspaper-personal-live-check.json`; final source counts/reflow: `output/newspaper-personal-reflow.json`. No messages, event titles, credentials or mailbox content were printed to execution logs.
- X: three pre-existing enabled handles retained. No API credential or paid-read consent was configured; auto newspaper X refresh remains false and zero paid requests were made. Cached posts, when available, are source-attributed excerpts with timestamps and stale/partial states. The optional scheduled refresher reuses the same credential, consent, budget/backoff and persistent lease as manual refresh.
- Today's actual saved edition now has eight full news summaries, two publisher images and a personal briefing across two A4 pages. Coverage is partial because X is unavailable. Old PDFs and the original news preparation time are retained. Reflow made zero model calls and left unrelated workers/services alone.
- Existing 07:00 Asia/Manila automation updated in place to honor the saved personal settings, two-page bound, consent controls and private-notification constraint. No new automation, automatic print, email send, event modification or publication was performed.

## Functional boundaries

Tests cover sender/domain/query validation, invite detection, spoofed display names, code masking with ordinary receipt amounts preserved, per-provider cache isolation, no inference calls, stale/error/date handling, exclusive Manila all-day end bounds, overnight date labels, X account/source filtering, persistent refresh deduplication across SQLite connections, no duplicate paid requests, changed-rule discard, dense news/PDF preservation, bounded long agendas and explicit omitted counts.

Google reads up to 20 matching mail items and 30 primary-calendar events. Print includes up to three mail previews, three X excerpts and eight agenda rows, reducing agenda rows if necessary to retain readable type. Reading view retains all returned agenda/mail items. Partial/limited results do not imply the whole inbox or every calendar was reviewed. X account refresh rotates up to three selected enabled accounts per request, within the existing controls.

## Visual review

Two bounded Firefox batches and PDF renders; no third visual round. Final capture metadata: `output/playwright/newspaper-personal/round-2/checks.json`. Four theme/viewport combinations have zero page errors or horizontal overflow; both native-print pages are A4 with all blocks contained. Preference save was verified against the local fixture store. Captures/PDF fixtures contain conspicuously synthetic personal content. A final deterministic ink-color override fixes reading-view link contrast; it was rebuilt after captures without another browser round. The live owner PDF contains the real empty/unavailable states.

Graphify refresh is source-only, with no model tokens/external requests and the requirements graph preserved. JEV receives only sanitized verification counters/setup limits under the owner's existing configured-provider exception; its judgment is advisory, not functional proof. Neither graph extraction nor JEV receives actual account content or sender rules.

Final architecture snapshot: 146 source files, 1101 nodes, 4401 edges, 28 communities. Zero external graph calls; requirements graph preserved. Diagnostics: {'missing_endpoint_edges': 0, 'dangling_endpoint_edges': 17, 'self_loop_edges': 9, 'undirected_same_endpoint_collapsed_edges': 126}.

JEV returned `ready_with_setup` at confidence 1.0; its probabilities are {'ready_with_setup': 1.0, 'needs_fix': 0.0, 'unverified': 0.0}. Usage: {'input_tokens': 656, 'output_tokens': 45}. This is a sanitized, text-only advisory judgment and does not establish visual or operational correctness.
