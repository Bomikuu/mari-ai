# Telegram conversation and images

The owner approved normal Mari chat, direct replies, delegated final answers,
`/image`, `/new`, ordered long replies and the existing approval boundaries.
Application code remains JavaScript/JSX. No dependencies or provider credentials
were added, copied or exposed.

## Behavior and boundaries

Normal messages queue native turns for the enabled Mari profile. Phone history
uses its own conversation, current pairing and fixed Personal/project context.
Follow-ups serialize through the existing agent scheduler. `/new` closes that
history, cancels unfinished turns and suppresses their late delivery. Prior
history remains inspectable. `/goal` retains the configured coordinator and
returns the exact completed synthesis for new phone goals only. Earlier and
desktop goals are not automatically exported as full replies.

`/image PROMPT` queues one native subscription image request in an isolated owned
workspace with no project files, private knowledge, connected apps or web search.
The host accepts only an actual returned image in a permitted generated-image
root, fully decodes it and saves an immutable hashed artifact. Telegram receives
a bounded JPEG upload; the original stays downloadable in Mari's Tasks view.
No screenshot substitute, image-provider key or API-billing fallback is used.
Usage limits pause explicitly. Native unavailability is a real failure, never a
fabricated image or silent provider switch.

Direct replies are separate from optional status notifications. Delivery checks
the exact current binding, context, phone permission, source job and artifact
ownership/hash. Revocation aborts active requests where possible. Ambiguous
uploads remain uncertain and require explicit retry. Later answer chunks wait
for earlier parts; an uncertain answer cannot starve help/cancellation replies.
Image retries retain their image operation and original binding. Stale bindings
cannot retry content into a new phone pairing. Project services remain independent.

## Evidence

- [Full suite](../../output/telegram-full-tests.txt): 222 passed, zero failures,
  skips or cancellations. The 17 new conversation tests cover the consequential
  behavior above; existing Telegram, agent and workflow coverage remains passing.
- [Build](../../output/telegram-build.txt): passed. The pre-existing large
  Three.js bundle warning remains; this extension adds no frontend dependency.
- [Native check](../../output/telegram-native-result.json): real subscribed Codex
  answered a synthetic definition, remembered the acronym on a follow-up, and
  returned a validated 1254 × 1254 image. The isolated runtime was removed. No
  private knowledge was read and no Telegram message was sent by that check.
- [Firefox checks](../../output/playwright/telegram-conversation/checks.json):
  setup and connected scenes in dark desktop and light mobile views, exact-user
  pairing and explicit uncertain-delivery retry. No page errors or horizontal
  overflow. All account data and Bot API results were synthetic, in a removed
  temporary runtime. Final copy was confirmed in the second bounded UI pass.
- [JEV result](../../output/telegram-jev-result.json): selected `native_and_fixture`
  rather than live end-to-end verification. Only the sanitized evidence summary
  was submitted through the owner-authorized configured provider. This typed
  judgment is not an independent functional test.
- [Application graph](../../graphify-out/application/telegram-refresh-validation.json):
  local AST refresh, matching source hashes, no external calls, and preserved
  parent requirements artifacts. Its 115 source files produce 898 nodes and
  3,511 edges in 29 communities. All eight original requirements artifacts
  match their recorded hashes. The structural graph retains 15 dangling
  endpoints, eight self-loop edges and 92 relation variants collapsed by its
  undirected representation; raw extraction and integrity records preserve
  these limits. Graph structure is not functional evidence.

The local backend and normal worker were restarted with the existing bot pairing
preserved. The Telegram client now grants at least 2000 ms for address-family
connection attempts on ordinary starts; a special launcher flag is unnecessary.
The owner subsequently confirmed that both an answer and an image arrived on
their phone. The [live report](../../output/telegram-live-result.json) records
that confirmation and a healthy connected bot. A read-only audit found no
matching chat/image job records in the inspected local runtime, so that snapshot
does not independently corroborate the API delivery. Live receipt is owner
confirmed; the native and isolated transport evidence above remains distinct.

References: [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage),
[Telegram sendPhoto](https://core.telegram.org/bots/api#sendphoto),
[official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).
