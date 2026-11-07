# Direct agent conversations and tasks

**Goal:** Open any configured agent, keep separate personal/project conversations, send messages or assign a task, and inspect factual execution. Replace the portrait art with recognizable chibi Grand Chase illustrations.

**Architecture:** Extend Mari's authenticated Express API, SQLite records and existing single-worker queue. Native ChatGPT-authenticated Codex threads persist per conversation. Direct tasks produce responses and owned artifacts; project source is supplied as a bounded, secret-filtered snapshot. The model cannot modify target source or connected accounts. Website implementation continues through the existing exact-image approval workflow.

**Confirmed:** The user selected separate project and personal chats. Reuse the current JavaScript/JSX stack, official shadcn controls, matte themes, no sidebar, native credentials, Firefox and truthful events. No API billing fallback. No automatic replay after worker restart. Profile snapshots are fixed for each conversation; editing a role affects new conversations.

**Scope:** Open agent → choose Personal/project → select/create conversation → Chat or Assign task → queue/run → inspect output, commands, files and errors → cancel or retry explicitly. Multiple conversations can queue; only one AI job executes at a time. Profile creation itself creates no running agent.

## Implementation

- [x] Add `agentChats`/`agentMessages` collections and `server/agent-chat.js`: authenticated create/list/detail/message/action routes; immutable project/profile association; bounded messages/history; duplicate-turn prevention; cancellation/retry; explicit offline errors. Keep native thread IDs server-owned.
- [x] Add `worker/agent-snapshot.js` and `worker/agent-chat.js`: secret-filtered bounded project context, isolated native execution, thread resume, real activity events, result/artifact persistence, durable cancellation and failures. Integrate worker restart recovery and existing queue. Keep MCP writes/hooks/host browser/network outside this direct-chat scope; enable native web search for research when supported.
- [x] Add `AgentChatWorkspace.jsx` and CSS: dominant conversation, context/history selector, Chat/Tasks/Activity tabs, explicit task assignment, completed results/artifacts, current action and elapsed/last-activity, cancellation/retry. Add roster chat entry points and routing for assigned tasks. Preserve profile editing.
- [x] Generate one 4×3 chibi Grand Chase atlas from the supplied roster reference, validate names/cells and persist versioned assets with exact prompt/source provenance. Preserve profile IDs and portrait selections.
- [x] Test API scoping, offline/duplicate actions, history, profile snapshot, retry/cancel/restart, native permissions, snapshot credential/symlink exclusion and real result persistence. Build; bounded Firefox batch across desktop/mobile, both themes, chat/tasks/activity, empty/error/offline states. Run a narrow native subscription conversation/resume trial without changing user projects.
- [x] Refresh the local architecture graph after source freeze, run JEV only within its authorized provider exception, obtain independent finish review, reconcile documentation, stop/remove only owned QA resources.

## Review focus

- Project switches and browser polling must never attach one conversation's history or output to another scope.
- A role edit/deletion/disable must preserve history and running snapshots while clearly controlling future execution.
- Cancellation and worker interruption must resolve pending message state without stopping project services.
- Retrying must retain the original instruction, avoid duplicate user messages and preserve prior output.
- A failed, partial or empty native result must never look completed; commands are event-derived and no thinking/usage/availability is invented.

## Protocol evidence

Official app-server documentation describes native thread start/resume, turn start, item events, interruption and named permissions: https://learn.chatgpt.com/docs/app-server. This implementation retains existing local Codex native sign-in; it does not implement token sharing or copy credentials.
