# Memory, selected documents and Telegram implementation plan

**Goal:** Give Mari scoped durable knowledge and a paired phone interface for delegated goals.
**Architecture:** Owner-protected knowledge APIs plus immutable queued context; native read-only Drive jobs; a lease-bound Telegram worker bridge with private credentials, deduplicated incoming goals and a durable outbox.
**Stack:** Existing Node JavaScript, SQLite, React JSX, Tailwind and official shadcn controls. No new paid model provider or TypeScript.
**Spec:** docs/superpowers/specs/2026-11-07-knowledge-phone-design.md

## Global constraints

Preserve approved-image implementation, independent project services, Firefox, native subscription authentication and secret privacy. No account writes/real Telegram sends during unpaired QA. No commits.

## Review focus

Personal/project knowledge cannot cross scope. Retrieved instructions cannot expand authority. Duplicate Telegram updates cannot create duplicate goals. Disconnected/obsolete bindings cannot queue or send. Ambiguous delivery after a crash cannot silently replay. Cached Drive failures cannot masquerade as fresh success.

- [x] Add knowledge note/document persistence, Markdown exports and bounded revision-aware capture; test scope, redaction, validation and immutable inheritance.
- [x] Add allowlisted native Drive inspection/search/import/refresh jobs and private status APIs; test actual schemas, unsupported content, pagination, cancellation and stale retention.
- [x] Add private bot configuration, pairing and fixed-scope delegated-goal service; test sender/receipt/ownership boundaries and configuration races.
- [x] Add lease-bound background polling/outbox delivery and actual notifications; test deduplication, uncertainty, rate limits, shutdown and service independence.
- [x] Add Knowledge workspace and per-turn context inspection with existing visual tokens; build and bounded Firefox theme/mobile verification.
- [x] Run appropriate full/native protocol checks, JEV, Graphify, fresh finish reviewer and documenter; record incomplete account authorization accurately and leave temporary services stopped.
