# Elesis delegation implementation plan

**Goal:** Automatic bounded CEO delegation with concurrent specialists, truthful inspection, and twelve unique character names.
**Architecture:** Durable team lifecycle in the existing SQLite records, native planning/synthesis around independent agent chats, and a bounded dispatcher inside the existing single worker lease.
**Tech stack:** JavaScript/JSX, Node, React, existing official shadcn/Tailwind controls, native Codex app-server.
**Spec:** docs/superpowers/specs/2026-11-07-agent-teams-design.md

## Global constraints

Preserve native subscription auth, secret-filtered read-only project snapshots, exact-image implementation approval, service ownership, Firefox preference and JS/JSX only. No commits/deployment. Preserve historical snapshots and user customizations.

## Review focus

Invalid and recursive plans cannot create tasks. Simultaneous work cannot share chat/profile write scopes. Cancellation and worker restart cannot publish a false success or automatically replay interrupted work. Retry preserves successful specialist output. Personal goals cannot inherit the selected project or its repository skills.

- [x] Add named starter identities, reversible legacy migration and unique-name validation; verify defaults, history and custom profiles.
- [x] Add team queue/lifecycle and authenticated controls; test validation, exact scope, cancellation, failure, retry and synthesis ordering.
- [x] Extend native turns for structured planning and result synthesis; preserve sandbox/artifact/cancellation rules.
- [x] Refactor dispatch to at most three independent agent turns with chat/profile locks and exclusive legacy AI workflows; test actual overlap, capacity, lease loss and shutdown.
- [x] Add Team view and delegate composer action, named roster order and actual activity inspection; build and Firefox desktop/mobile/theme checks.
- [x] Run scoped real native team trial, full tests, JEV, Graphify refresh and fresh finish reviewer/documenter; reconcile evidence and leave temporary services stopped.
