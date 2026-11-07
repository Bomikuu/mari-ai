# Codex integration evidence

Date: 2026-11-06 (Asia/Manila). Scope: read-only local capability inspection and official-documentation research for **mari-ai personal assistant**. No AI turn or image-generation request ran. No credential contents were read.

## Observed local tools

| Command | Non-secret result |
| --- | --- |
| `command -v codex` | `/home/micxsz/.local/bin/codex` |
| `codex --version` | `codex-cli 0.160.0` |
| `readlink -f /home/micxsz/.local/bin/codex` | `/home/micxsz/.codex/packages/standalone/releases/0.160.0-x86_64-unknown-linux-musl/bin/codex` |
| `codex login status` | `Logged in using ChatGPT` |
| `codex exec --help` | Supports image inputs, JSONL events, explicit sandbox modes, resume/fork, and JSON-schema final output. |
| `codex app-server --help` | Supports private stdio, Unix sockets, WebSockets, and JSON-schema generation; command labeled experimental. |
| `codex features list` | `image_generation` stable and enabled; browser-use and multi-agent features enabled. A feature flag does not prove a successful inference request. |
| `node --version` | `v24.21.0` |
| `npm --version` | `11.19.0` |
| `command -v pnpm` | `/home/micxsz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm` |
| `google-chrome --version` | `Google Chrome 154.0.8037.97` |
| Node `import.meta.resolve` checks | `playwright`, `@playwright/test`, `puppeteer`, and `better-sqlite3` do not resolve from this empty checkout. |
| Node `import('node:sqlite')` | Available. |

## Installed protocol evidence

Ran `codex app-server generate-json-schema --out /tmp/mari-codex-schema-tapuidvp` successfully. These temporary JSON artifacts describe the installed CLI version; no TypeScript files were generated.

`ServerNotification.json` contains an `imageGeneration` thread item with required `id`, `type`, `status`, and `result`; optional fields include `savedPath`, `revisedPrompt`, `failure`, and `transparentBackground`. It also describes command execution, file changes, MCP calls, and collaboration calls. `TurnStartParams.json` accepts local-image input and per-turn sandbox settings. `GetAccountResponse.json` distinguishes `chatgpt`, `apiKey`, and `amazonBedrock` account types.

This establishes a protocol representation for image output. It does **not** establish that this account, selected model, and automated worker can complete generation and return a readable image file. The temporary schema directory is inspection evidence, not a portable project dependency.

## Official documentation

- [Codex app-server](https://learn.chatgpt.com/docs/app-server): documented initialization, thread/turn lifecycle, resume, interrupt, approval requests, command output, tool events, and diffs. Installed-version JSON schemas are available through the CLI.
- [Image generation](https://learn.chatgpt.com/docs/image-generation): describes built-in CLI image generation with reference images and included Codex usage limits. A live worker generation remains necessary to verify this integration.
- [Authentication](https://learn.chatgpt.com/docs/auth): native ChatGPT login provides subscription access; `forced_login_method = "chatgpt"` constrains the login method. Codex manages cached credentials and refresh.
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode): `codex exec --json` supplies structured events and supports resume. Use explicit sandbox settings; `--full-auto` is no longer supported.
- [Sign in with ChatGPT preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): the separate token-sharing Responses integration excludes image generation. This does not establish that native authenticated Codex image generation is unavailable.

## Recommendation and verification boundary

Use a Node.js worker supervising `codex app-server` over private stdio. Pin the CLI/protocol version, validate incoming JSON, persist correlation IDs, and derive agent activity from observable execution events. Exclude reasoning fields from the product timeline. Keep project service supervision separate from AI-turn cancellation.

Preserve native Codex credential handling. Enforce ChatGPT login, strip API-key variables from the child environment, verify account type, and never add an API-billing fallback. Do not copy authentication tokens into application storage.

Support both named design modes: **Codex built-in — requires live verification** and **ChatGPT handoff — manual image import**. Only mark built-in generation verified after an actual subscription-authenticated turn returns a valid image artifact that can be saved and displayed. A text response or enabled feature flag is insufficient.

Before user approval, proposal generation should write only to the task artifact workspace; the target project remains read-only. Backend approval of a specific image revision, followed by the explicit implementation action, must gate any writable target-project turn. Command/file approvals are complementary controls.

`codex exec --json` is a simpler fallback for non-interactive stages. App-server is preferable for granular live events, user input, approval responses, cancellation, and resuming work. Neither native image output nor an end-to-end capture/design/implementation cycle was tested during this research.

## Implementation follow-up: native image output verified

Later on 2026-11-06, the implemented Mari worker connected to the real local app-server, confirmed `account.type === "chatgpt"`, captured the isolated demo website at desktop/mobile viewports, and submitted the actual screenshot for built-in image generation. A real `imageGeneration` action completed and returned a valid PNG. Mari decoded, copied, hashed and displayed the 1586×992 proposal as revision 1. Its capability is now verified for this run, rather than merely available for a probe.

The task remains awaiting human image approval. A real unapproved implementation request returned HTTP409 with `APPROVAL_REQUIRED`; no target implementation or final browser comparison ran. See [verification evidence](../verification.md) for the exact boundary and artifacts.
