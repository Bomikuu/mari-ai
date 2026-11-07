# JEV architecture check

Date: 2026-11-06 (Asia/Manila).

The user explicitly authorized JEV checks through its configured provider as an exception to subscription-only operation. No credentials or user-project contents were submitted. The state described general architecture requirements from this brief, with no personal paths.

## Local checks

- `jev --version`: `jev 0.7.0`.
- `jev auth status`: successful; saved credentials present. Credential contents were not read.

## Evaluation

Question: Which architecture best satisfies the requirements with the least avoidable complexity?

Options:

- `local_split`: React UI, local Node backend, separate persistent Node worker owning services and Codex app-server, SQLite and disk artifacts.
- `local_monolith`: React UI and one Node process owning backend, services, capture, and AI jobs.
- `desktop_shell`: Electron plus backend and separate worker.

The submitted state covered multiple project services, ownership and readiness, durable task and event records, independent cancellation, screenshot-to-image-to-approved-implementation verification, required JavaScript stack, local-only scope, subscription authentication, and incremental delivery.

`jev choice` exited successfully with this parsed result:

```json
{
  "model": "jev-1.14.0",
  "answers": {
    "answer": {
      "type": "choice",
      "choice": "local_split",
      "confidence": 0.91,
      "probabilities": {
        "local_split": 0.94,
        "local_monolith": 0.03,
        "desktop_shell": 0.03
      }
    }
  },
  "usage": { "input_tokens": 563, "output_tokens": 43 }
}
```

This is a model judgment supporting comparison of the options. It is not evidence that any implementation works, and it does not approve consequential actions.
