# Personal integrations code review — 2026-11-07

Reviewed `server/google.js`, `worker/google.js`, `server/pixelpop.js`, their server/worker wiring, and the Google, Pixelpop, and personal API tests. Followed the directly used Pixelpop session, deadline, reminder, and nutrition contracts in the canonical repository after reading its `AGENTS.md`.

## Finding — resolved

### [P2] Preserve the original age and date of an already cached Google source

- **Original location:** the mail and calendar failure branches formerly at `worker/google.js:171` and `worker/google.js:178`.
- **Trigger:** Calendar succeeds on November 5. On November 6, Gmail succeeds while Calendar fails, so the new combined brief correctly retains November 5 calendar events with `cachedAt`/`sourceDate` from November 5. On November 7, another refresh again succeeds only for Gmail.
- **Original result:** The second failure spread the already stale calendar source, then overwrote `cachedAt` and `sourceDate` with the November 6 combined brief's `generatedAt` and `date`. The events were still from November 5, but Mari labeled them as saved on/for November 6. Repeated same-day failures also kept advancing the displayed cache age. The mail fallback had the same defect.
- **Impact:** A persistently failing source appears newer than it is; across dates, cached appointments are attributed to a day they were never fetched for. The source remains marked stale, but its provenance is false.
- **Minimum fix:** When retaining an already stale source, preserve that source's existing `cachedAt` and `sourceDate`. Fall back to the previous combined brief's generation time/date only when the retained source was previously fresh. Apply this to both mail and calendar.
- **Resolution:** Source review confirms `cachedFailure` at `worker/google.js:107` preserves a source's existing `cachedAt` and `sourceDate`, including explicit unknown values. It uses the previous brief's metadata only for a previously ready source that was not already stale. Both mail and calendar failure branches use the helper. The P2 is resolved.
- **Regression coverage:** The parameterized tests at `tests/google.test.js:85` cover mail and calendar independently through two consecutive partial failures, with the requested date changing from November 7 to November 8. They assert that the original source timestamp, date, and retained records stay unchanged. The implementing agent reported that the new cases failed before the fix and that all nine focused Google tests passed afterward; the reviewer inspected their source and did not rerun them.

The follow-up was limited to the reported P2, its helper/call sites, and its regression tests. It did not broaden the original review.

## Other observations

No additional material issue was identified in the reviewed owner-session/CSRF wiring, isolated Pixelpop cookie/session handling, task-versus-bill checks, native Google read-tool allowlist, Google cancellation checks, or suppression of Google account content from agent logs. This is a source review, not a claim that every runtime failure mode has been exercised.

No tests, builds, browser automation, live account requests, runtime credentials, or runtime personal data were used for this review. Only this review note was written.
