# Mari AI personal assistant

<p align="center">
  <img src="src/assets/agents/chibi-v1/mari.webp" alt="Mari AI character portrait" width="160" />
</p>


A private local command center for direct agent conversations and assignments, project services, observable Codex work, and screenshot → design image → human approval → implementation → browser verification.

React JavaScript/JSX, Tailwind CSS, official shadcn/ui, a local Node backend, a separate Node worker, SQLite, and local image artifacts. The interface follows the selected [Mari concept](docs/design/mari-command-center-v2.png). There is no navigation sidebar.

## Run locally

Requires Node.js 24+, the Playwright Firefox runtime, and Codex CLI 0.160.x signed in through ChatGPT. External links use your configured Firefox default. Project captures and login use a dedicated Firefox profile; Brag's isolated Hyperframes renderer requires its separately installed Chromium runtime.

```bash
npm install
npm run build
npm start
```

For development use `npm run dev`; Vite runs at `http://127.0.0.1:5173`, with the backend at `http://127.0.0.1:4310`. Production serves the built UI from the backend address. Open the owner pairing URL printed in the terminal. It contains a one-use access key in its URL fragment; Mari exchanges it for an HttpOnly local session and removes it from the address bar. Browser refresh keeps the session. Restarting the backend prints a new pairing URL.

Do not share that owner URL. Provider credentials remain in Codex's native storage, and service environment files are read only by the local worker. Mari never copies provider authentication tokens into its database or frontend.

Optional configuration:

```bash
MARI_PORT=4310 MARI_DATA_DIR=/absolute/private/runtime-directory npm start
```

Default runtime data is `.mari/` in the repository. To generate a video of or implement Mari itself (or a parent of that directory), first put `MARI_DATA_DIR` outside the target project. The worker refuses an overlapping target/runtime boundary. Choose an existing external runtime directory if you already use one; changing this setting selects a different local database.

## Markets, portfolio and X news

Open **Markets** in the horizontal controls. CoinGecko supplies real USD aggregate quotes and OHLC candles at 30-minute, 4-hour or 4-day intervals, without candle volume. **Preferences → Market data** also offers Kraken spot candles with finer intervals and volume where reachable. Kraken failed certificate verification on this network during implementation; TLS verification was never disabled. Responses are bounded, cached and coalesced, with backoff and explicitly stale fallback data. Charts refresh conservatively while the workspace is visible; quotes and local alerts update with **Refresh prices**. [TradingView attribution and license](http://127.0.0.1:4310/tradingview-notice.txt) ship with the app.

**Portfolio & trades** records starting holdings, buys and sells manually in USD. Leave starting price empty when basis is unknown. Weighted-average basis includes fees; missing basis/quotes remain unknown. Removing an earlier transaction is rejected when it would invalidate a later sale. Durable form request IDs prevent duplicate retries or resurrection of removed entries. No exchange account or order connection is created. Local one-shot alerts in Preferences are checked only when prices refresh; they do not monitor while Mari is closed or the laptop is asleep.

For **Investment review**, save your goal, horizon, risk tolerance, budget and liquidity needs in Preferences, then refresh quotes. Select the scope and **Load available models**: this reads native Codex metadata without a model turn. When available, this feature defaults to **GPT-6 Luna / low**; choose another reported model/effort if needed. **Analyze this snapshot** queues one explicit, isolated, subscription-authenticated turn. Results separate entry/hold/reduce/exit/wait/insufficient-evidence assessments, evidence, opposing evidence, downside and invalidation. Source times and actual reported usage are retained. Inputs changing or expiring mark saved results stale. No automatic delegation or analysis on every update; global Codex configuration stays untouched. Limited quotes, indicators and cached news can reasonably yield insufficient evidence.

Open **X news → Accounts** to select @handles/groups; none are preselected. **Access & budget** saves an official X developer app bearer token in a private 0600 runtime file without fetching. Reads are separately billed: review [current X pricing](https://docs.x.com/x-api/getting-started/pricing), set a provider-console spending cap, explicitly enable paid reads and choose a positive local daily reservation limit before **Refresh feed**. Mari purchases no credits or auto-recharge. Three-account batches and conservative resource reservations bound local usage; reservations are not actual bills or a replacement for the provider cap. Failed/ambiguous requests keep their reservation. X has no background polling, scraping, posting, following or DM actions.

Filter cached posts by keyword, account, group, date, unread or saved state. Original publication/cache times and source links remain visible. Content older than 24 hours in cache is hidden; cached availability does not confirm a post still exists upstream. Select up to 20 fresh cached posts and open **Summary** for one requested Codex turn. Social claims are attributed rather than treated as verified reporting.

Newspaper reuse is off by default. Markets can contribute three fresh cached CoinGecko USD quotes; unavailable PHP conversion/24-hour change remain unavailable and mark the edition partial. X requires both a global newspaper opt-in and individual post selection. Existing story limits, the 07:00 Asia/Manila automation and at most two A4 pages remain in force. These options add no upstream fetch or extra model turn to the existing newspaper pipeline.

Evidence and access boundaries: [Markets and X verification](docs/research/2026-11-07-markets-and-x.md).

## Dot coordination and handoff

The installed **Mari Handoff** Codex skill lets a dot hand scoped goals to Elesis through a local CLI. Elesis delegates to enabled specialists; their real execution, saved replies, errors and cancellation controls appear in **Agents → Elesis → the handoff conversation → Team**. Personal and registered-project contexts remain separate. Dot can retrieve status/results and cancel its submitted team; service processes are independent.

In your dot’s native profile, open **Computers → Your computer → Allow access**. Keep the computer online, the ChatGPT app open and Mari running. Then tell the dot:

> Use $mari-handoff to give Elesis a goal in Mari: prepare a concise plan for my portfolio. Delegate independent product and design research, follow the team’s progress, and bring me the saved result. Use Personal context.

For a project goal, name the saved project. The skill resolves its actual registered ID rather than accepting an arbitrary directory. Start a new local Codex task or refresh skills if an existing task predates installation. To reinstall this repository’s skill on the same computer, run `node scripts/install-dot-skill.js`; it refuses to overwrite a different skill. The installed skill contains this computer’s absolute CLI path, so review that path if you move the repository.

```bash
node scripts/dot-handoff.js health
node scripts/dot-handoff.js projects
node scripts/dot-handoff.js list
node scripts/dot-handoff.js status YOUR_REQUEST_ID
node scripts/dot-handoff.js result YOUR_REQUEST_ID
node scripts/dot-handoff.js cancel YOUR_REQUEST_ID
```

`submit` accepts bounded JSON on stdin: `{ "requestId": "stable-goal-id", "projectId": null, "instruction": "Your scoped goal", "title": "Dot · goal" }`. Use an ID returned by `projects` instead of `null` for project work. Replaying an identical request returns the original team, including when the worker is offline; changed content with that ID is rejected. At most three Dot goals can be active. New submissions require a fresh, process-verified normal worker; the connector starts no temporary worker. `status --after CURSOR` returns subsequent scoped events, and `result` explicitly distinguishes partial specialist output from final synthesis. Failures require explicit owner retry in Mari. Pass an existing absolute `--data-dir` when using a custom runtime.

This is **Dot → a connected local Codex task → Mari handoff**, using the existing subscribed Codex queue. It does not embed a Dot model, authenticate a cloud Dot session, or create a public remote execution endpoint. Local OS-owner access is the trust boundary; the source label is provenance only. No provider tokens are copied. Agent turns use the usual Codex allowance. Original-project changes still require capture → design image → owner approval of that revision → explicit Implement → verification. The connector offers analysis and artifacts within those permissions.

The local CLI and a real concurrent Codex team have been verified. Owner-initiated cloud Dot dispatch still needs a connected-computer test. See [verification and boundaries](docs/research/2026-11-07-dot-handoff.md), [official computer access](https://learn.chatgpt.com/docs/dots/computers-and-apps), and [Dot tasks](https://learn.chatgpt.com/docs/dots/tasks-and-memory).

Use **Light / Dark** in the header to switch appearance. Light uses white and neutral gray surfaces; dark draws from Mari's midnight coat, blue hair, gold, and rose details (`#0a0d18` canvas, `#11172a` panels). This latest character-derived palette supersedes the earlier pure-black direction. Mari follows the system preference until you choose a mode, then remembers that choice in this browser. Actions, dialogs, forms, resources, logs, and globe lines share the theme; the portrait keeps its drawn colors. The **MARI / PERSONAL AI** header button returns home. The text title and subtitle remain in Core, pairing, and loading views; only the separate graphic illustration logo is removed.

## First workflow

1. Choose **Use demo** to register the isolated example, or add a project by local directory. Discovery runs only inside a folder you explicitly select.
2. Review each service's command, working directory, environment-file path and expected URL. Confirm and start it. The demo has independent frontend (port 4173) and API (port 4174, readiness route `/health`) services.
3. Wait for actual HTTP readiness. A port occupied by another process stays external; Mari cannot stop it.
4. Request a page capture with desktop/mobile settings. Open the task to inspect screenshots and real execution events.
5. Choose **Codex built-in** to request an image through the authenticated CLI, or **ChatGPT handoff** to download the screenshot/prompt, generate an image in your own chat, and import it.
6. Review the exact proposal revision, approve it, then separately choose **Implement**. A new revision needs fresh approval.
7. Review browser verification, changed files, checks and remaining differences. Accept the result or request a correction within the bounded verification workflow.

The first live demo's newly generated image still needs your own approval. Mari never approves a real proposal on your behalf. Example content is isolated from your existing websites.

## Projects, skills and agent profiles

Use **Scan folder → Browse** to open the Linux folder chooser. The selected path is filled automatically; if the desktop chooser is unavailable, Mari lists folders with Home/Parent navigation and optional manual path entry. Browse also works in **Add project**. Mari searches only the selected root, up to three levels and 500 directories, and shows up to 100 project roots and 100 nested components. Runnable child apps are grouped as service candidates, shared libraries stay as packages, and independently nested Git repositories stay separate. Register the parent project, then use **Services → Configure** to review a detected command and its actual working directory; missing startup commands remain explicit. Child package-manager overrides are preserved. Scanning and service configuration never start services; first execution still requires command review. Older saved scans prompt for **Rescan** before registration. **Projects** retains the searchable saved list. [Verification](docs/research/2026-11-07-project-structure-verification.md).

**Skills** reads the installed inventory from your native Codex app-server without an AI turn. Search, filter by scope, switch between Mari's context and the selected project, and inspect installed instructions as text. Inventory errors remain visible.

**Agents** manages reusable Codex profiles with search, category filters, named Grand Chase chibi portraits and an initials fallback. Select a card to chat or assign work; use its pencil to edit the role, installed skill bindings, category or portrait. Import/export JSON preserves that identity. Review twelve starters across Leadership, Product & Design, Engineering, Quality & Security, Growth and Operations, with unique character names and separate role titles; General supports custom and older profiles. The active portraits are generated chibi fan art based on your supplied roster reference, as labeled in the picker. [Generation provenance](docs/design/agent-portraits/chibi-v1.generation.json) records the exact prompt/source; the earlier screenshot crops remain historical reference. Saved portrait selections are preserved.

In an agent workspace, choose **Personal · no project** or a saved project, then select a conversation or **New chat**. Each conversation retains its context and captured profile instructions; start a new chat after editing a profile to use its updates for direct messages and individual tasks. Choose **Chat** for a message or **Assign task** for a tracked result, then send with the button or Ctrl/⌘ + Enter. **Tasks** holds results and downloadable responses/files. **Activity** shows actual commands, tool calls, output and errors, with filters and a scoped timeline download. Current worker/execution status, elapsed time, last activity, Cancel and Retry reflect real jobs; saved history stays readable offline. Roster captions show actual live or queued work. The worker supports up to three independent agent turns, while work for the same profile or conversation waits its turn.

Direct work uses your existing native ChatGPT sign-in for research, analysis and text artifacts. A project conversation receives a bounded, secret-filtered source snapshot; direct turns can write only inside their owned workspace. Connected-app writes, hooks and browser runtimes are disabled in these turns. To change a website, use **Open the capture and design workflow**, which retains the conversation's project or asks you to choose one, then follow exact-image approval before implementation.

You can still choose a profile in capture settings or the task workspace for the next AI action. Running jobs retain captured instructions, skill hashes and identity for live and historical displays. Installing a starter saves configuration and starts no work; profiles grant no extra permissions or approval authority, and portrait identity has no connection to game canon or execution state. The global command dock hides in the roster and direct-chat workspace; chat has its own composer. [Verification evidence](docs/research/2026-11-07-agent-chat-verification.md) records the real three-turn native connection/resume and assigned-artifact check.

The Mari core anchors its generated 2D portrait at the bottom, in front of a faint Three.js globe at twice its base projected diameter. The v3 atlas has 24 drawings with a cold, closed-lip expression. Mari normally faces front and breathes: frames 0–11 loop every 2.88 seconds without a blink. After 25.92 seconds she leans briefly to one side, returns to front for 29.04 seconds, then leans the other way. Each lean lasts 3.6 seconds; the full sequence repeats every 62.4 seconds. The MARI text title and PERSONAL AI subtitle remain visible. The [Grand Chase Mari reference](https://gcc.playpark.com/update/get-acquainted-with-the-awesome-characters/) informs the appearance; the personality is the user's art direction. Portrait motion is decorative and independent of task or agent status, with no simulated talking or listening. One **Pause / Resume** control affects both avatar and globe. Pause, reduced motion, and hidden/offscreen visibility stop motion; the portrait resets to neutral frame 0 and resumes with the full frontal breathing rest before another lean. Image loading and failure have plain-text fallbacks, and the globe retains a static fallback when 3D rendering is unavailable. The factual caption remains separate. The earlier v1/v2 atlases and still SVG eye treatment are historical source. These timings and layout are source contracts, not a browser smoothness claim.

## Execution and status

The worker owns services in dedicated process groups. It validates process identities before signals and never kills arbitrary processes by port/name. Service jobs are independent of AI job cancellation. Closing the browser leaves local work running. Stopping the launcher intentionally shuts down its worker and verified managed services.

Worker connectivity, agent execution, process ownership, and HTTP readiness are separate signals. Historical agents remain inspectable without being presented as connected. Stale health is unknown. Logs identify service, browser, agent and system sources; known secrets and credential patterns are redacted before storage and export.

In **Agents → Elesis → Chat**, choose **Delegate goal**, describe the result you want and submit it. The goal captures the current coordinator and eligible specialist profiles, including their instructions and installed skills. Elesis selects 1–6 enabled specialists automatically within that conversation’s project or personal scope. **Team** shows each assignment’s real status, current action/command, elapsed/last-activity time and saved result; long goals and assignments expand to show their full instructions. **Inspect** opens the specialist’s independent chat, tasks, commands, errors and artifacts; the return link opens the CEO goal. After all specialists succeed, Elesis synthesizes their saved responses in **Chat**. Cancel team affects only its own jobs; Retry stopped work preserves completed specialist results. Interrupted work requires explicit retry. Delegation cannot expand permissions or authorize website source edits. [Team verification](docs/research/2026-11-07-agent-teams-verification.md) distinguishes the real native overlap trial from synthetic interaction fixtures and structural checks.

The desktop roster follows your four-column order: **Elesis, Lire, Arme, Amy / Mari, Rohan, Lass, Zero / Jin, Dio, Ryan, Sieghart**. The superseded reviewer profile is retained under Include archived profiles. Exact legacy starter names migrate while preserving saved instructions, custom roles and history. Editing a profile exposes its separate role, archive state and explicit delegation setting. Names must be unique; importing an existing name requires choosing another name in the JSON first. Installing a profile does not start work.

Tasks, immutable images, approvals, jobs and event history persist locally. Retry/resume retains completed captures and stages. The single leased worker permits up to three independent agent turns concurrently. Work for the same profile or conversation is serialized; other AI workflows remain exclusive. Project service jobs are independent. Usage-limit failures pause for explicit retry; there is no API-billing fallback.

Built-in image generation is marked verified only after a real image file is returned and validated. An enabled CLI feature flag is insufficient. ChatGPT handoff is manual; Mari does not automatically access ordinary ChatGPT conversations. Automatic design proposals operate on the selected page/viewport; captures can cover bounded batches.

## Today: Google and Pixelpop

Open **Today** in the horizontal workspace controls. It works without selecting a project and keeps personal tasks separate from screenshot/design tasks.

- **Google:** check the Gmail and Google Calendar accounts available through your native Codex MCP connection, then refresh the brief. Mari reads a bounded set of recent unread email and the selected Manila calendar day. Source links, fetch times, partial failures, and running/cancelled jobs stay visible. Reads use exact allowlisted tools; they do not send email, change events, start a model turn, or use API billing. No Google OAuth token is copied into Mari.
- **Pixelpop:** open Connections and sign in to your Pixelpop backend. The deployed backend is `https://pixelpopup-backend.vercel.app`; local `http://localhost:8000` is also supported. Mari keeps a separate backend session in the private runtime directory (`pixelpop-session.json`, mode 0600), discards the password, and never returns upstream cookies to the browser. Disconnect logs out that dedicated session and removes its local file.
- **Tasks:** search pending/completed Pixelpop tasks; create, edit, complete, and delete supported records. Task data uses Pixelpop's shared workspace. Completed records are read-only in the interface. Financial deadlines are excluded.
- **Nutrition:** browse a date's meals and actual totals, log/edit/delete food entries, set your own nutrition targets, and record weight. Nutrition belongs to the signed-in Pixelpop account. Unlogged values stay unknown. Pixelpop has no hydration API, so Mari does not invent a synced water counter or give medical recommendations.

Expired Pixelpop sessions require sign-in again. An offline source or failed Google refresh does not erase useful cached data or mark it as fresh. The personal area uses Mari's existing owner pairing and CSRF protections.

After updating backend/worker code, restart Mari from its terminal to load the new routes and worker handlers. Build the frontend with `npm run build` for production. Stopping the launcher also stops its managed development services; restart only when appropriate for your running projects.

Personal integration design and validation scope: [specification](docs/specs/2026-11-07-personal-integrations.md), [plan](docs/plans/2026-11-07-personal-integrations.md).

## Daily newspaper

Open **Newspaper** in the workspace tools, or **Today → Open newspaper**. Mari Daily is a compact English broadsheet: Philippine/world news, Valorant, Dota 2, crypto and a BTC/ETH/SOL USD/PHP snapshot. It prefers one A4 front page, retaining a second page when all full summaries cannot fit at 8.2pt. A strong lead, optional publisher images, red section headings, top-stories rail and markets band follow the approved reference. The paper keeps source links, publication dates and preparation times. Older game/protocol items say Latest known update; unavailable sources/prices remain explicit. This is a selection from available feeds, not complete news coverage.

Use **Paper layout** for the exact measured composition or **Reading view** for larger text (the default on phones). Use **Download PDF** for the saved one- or two-page file, or **Print** for Firefox's native print dialog. Nothing prints automatically. Select a saved edition to revisit its original snapshot. **Regenerate today** explicitly creates another revision; cancellation and failures preserve previous editions. Sources and actual execution details expand below/above the paper.

A layout-only update can reformat a saved edition without another model call: `node scripts/newspaper-reflow.js [editionId]`. It uses the configured Mari data directory, retains the original reporting/preparation times, stores the preceding PDF in rendering history, and only reads optional publisher image metadata. Existing artifacts are never overwritten. Image access errors omit the image and preserve the story. New rendering failures leave the saved edition untouched.

Open **Personal sources and email rules** inside Newspaper to choose email, primary Google Calendar and selected X inputs. Sender addresses/domains, a bounded Gmail search rule, and calendar-invitation exclusions are saved locally. Google refresh uses direct read-only MCP calls with no inference turn and a separate private cache from Today. Mail/calendar text never enters the public-news model prompt or execution logs. Security-code previews are hidden; original Gmail links remain available.

The **For you** section prints on the same sheet when space permits, otherwise on a second A4 sheet. It shows up to eight agenda entries, three matching emails and three attributed X-post excerpts; omitted counts are explicit and the reading view retains all returned calendar/email items (up to 30/20). Source times, unavailable/stale/empty states and the private-edition label remain on paper. The news keeps all eight bounded full summaries, using a compact grid only when a dense edition needs to share the two-sheet budget.

X newspaper sources use enabled accounts selected in **X news**. Cached posts require no new API request. **Refresh X when preparing the paper** is a separate opt-in that still requires configured official API access, paid-read consent and existing provider/local budget controls. Manual and scheduled X refresh share a persistent lease to prevent duplicate paid calls. A missing credential or failed read leaves explicit partial coverage; no posts are invented.

The registered **Mari Daily newspaper** Codex heartbeat runs daily at **07:00 Asia/Manila**, using this local repository's default `.mari` database (or `MARI_DATA_DIR` when configured). Codex desktop and the computer must be available. It runs:

```bash
node scripts/newspaper.js --scheduled
```

The scheduled command refreshes a pre-7am manual edition once, then reuses an edition prepared after 7am. Manual `node scripts/newspaper.js` reuses today's saved edition; add `--force` for an explicit regeneration or `--data-dir /absolute/private/runtime` for a chosen database. A temporary worker consumes only newspaper jobs and leaves project/voice services and unrelated queued work alone. If you change the scheduled runtime directory, update the Codex automation to use the same directory; a different database has a separate archive and schedule record.

Feeds use verified GMA personal-use RSS, official Riot/Valve announcements, Ethereum and Bitcoin Core updates. CoinGecko's anonymous endpoint is optional and may be unavailable/rate-limited. No paid news/model key or silent provider fallback is used. Native subscribed Codex writes bounded source-backed paraphrases; the host attaches original source URLs and market values. Restricted publisher feeds were excluded. Details: [source review](docs/research/2026-11-07-newspaper-sources.md), [verification](docs/research/2026-11-07-newspaper-verification.md).

## GitHub project activity

Select a saved local project and open **GitHub** in the horizontal workspace controls. Mari detects a GitHub.com remote, prefers an unambiguous origin, and offers an inline repository link when detection is missing or ambiguous. Manual links are saved only in Mari and leave local Git configuration alone.

Use **Check connection** to verify the installed native Codex GitHub app and read-tool availability. **Refresh GitHub** reads up to 20 open pull requests, 10 review requests, and 20 issues, plus available statuses/workflows for the local HEAD commit. The actual worker action, elapsed time, cancellation state, fetch times, cached failures, and source links remain visible. Switching projects keeps GitHub open with the new project's own context.

Checks cover legacy commit statuses and the connector's first page of PR-triggered workflow runs, capped at 80 combined rows. This excludes complete check-run and all-workflow coverage. A project without a local HEAD commit can still show PRs/issues; its CI data stays unavailable. Counts mean loaded records and do not assert a full repository total or known omitted records.

This integration uses the existing Codex GitHub MCP connection with exact read-tool allowlists. It starts no model turn, copies no OAuth credentials, and performs no GitHub writes. Private repository access depends on the permissions of the connected GitHub account. No account data is fetched automatically when the pane opens; saved state is polled independently from an explicit upstream refresh.

GitHub evidence and limitations: [specification](docs/specs/2026-11-07-github-integration.md), [verification](docs/research/2026-11-07-github-integration.md), and [finish review](docs/design/github-finish-review.md).

## Project videos and Mari's voice

Choose **Create video** beside a saved project, or open **Video** in the horizontal tools. Start the project's services and wait for readiness, enter a short brief, choose 15–25 seconds and landscape/portrait, then **Generate video**. Settings persist per project. Brag uses the native subscribed Codex worker and pinned local Hyperframes to create an MP4 from a private source snapshot and an actual Firefox capture. The original project stays unchanged. The finished video, poster and copy/credits stay in private local artifacts, with manual playback and download. Execution details show actual actions; **Cancel job** stops this execution independently of project services. Generation has no hosted media, paid-provider fallback or publishing step.

The audited Brag skill and same-release companion skills are installed locally, with Hyperframes 0.9.19 and user-local FFmpeg/FFprobe. Its optional Python audio analyzer is excluded. Telemetry and automatic setup are disabled. Installation and third-party boundaries are recorded in the [Brag review](docs/research/2026-11-07-brag-review.md).

Open **Voice**, choose **Start VoiceStudio**, then **Generate sample** and press the audio player's play control. **Use workspace status** prepares text from the current project's actual service and executor states. The default is Bella, a local feminine KittenTTS preset at speed 0.95. Preset/speed settings persist; this engine controls voice and pacing rather than emotions. No microphone capture, performer cloning or automatic playback is enabled. Cancelling a speech request discards its result; the local engine may finish the in-flight computation.

VoiceStudio 0.5.7 is installed outside the repository in `~/.local/share/mari-ai/tools/voicestudio`, with a CPU-only environment and cached KittenTTS Mini 0.8 model. Its API listens only on `127.0.0.1:3900`. Mari distinguishes an externally started backend from its own process; **Stop VoiceStudio** and normal Mari shutdown stop only verified Mari-owned processes. To run it separately, execute `~/.local/share/mari-ai/tools/voicestudio/run-backend.sh` and stop it with Ctrl+C. Details: [installation and voice API](docs/research/2026-11-07-voicestudio-install.md).

## Checks and design records

```bash
npm test
npm run build
```

- [Specification](docs/superpowers/specs/2026-11-06-mari-command-center-design.md)
- [Implementation plan](docs/superpowers/plans/2026-11-06-mari-command-center.md)
- [Projects, skills and profiles extension; historical globe stage](docs/superpowers/specs/2026-11-06-projects-skills-agents-globe.md)
- [Codex capability evidence](docs/research/2026-11-06-codex-capabilities.md)
- [JEV architecture check](docs/research/2026-11-06-jev-architecture-check.md)
- Local requirements graph: generated under `graphify-out/` (not versioned).
- [Verification evidence and remaining boundary](docs/verification.md)

JEV checks use its configured provider under the user's explicit exception. Codex work and design generation remain subscription-only. No automatic commits, merges, deployments or remote access are configured.

## Knowledge and phone access

Open **Knowledge** in the horizontal workspace controls.

- **Local memory:** create, edit and search notes, decisions and preferences. Choose **Personal**, one registered **Project**, or explicitly **Shared · all conversations**. New notes have context enabled; you can turn it off before saving. Enabled knowledge is captured for new agent turns and delegated goals; agents do not save memories automatically. Each capture contains up to eight sources, 4,000 characters per source and 12,000 excerpt characters total. The coordinator, specialists and synthesis keep that goal's same captured revisions. Personal/project scopes stay separate unless the owner selects Shared. In the agent's **Activity → Instructions, scope & files**, expand Captured knowledge to inspect each excerpt, scope, full revision, source link, capture/save/fetch/source-modification dates and stale/truncated flags. Knowledge dates include the full date and time in Asia/Manila; unavailable inspector dates say Not recorded.
- **Obsidian later:** notes persist in the database and as private Markdown mirrors under `<MARI_DATA_DIR>/memory/notes` (normally `.mari/memory/notes`). Use a note's **Markdown** download, or copy the files into your future vault. Mari currently manages its own notes folder; no existing vault is scanned or modified.
- **Google Drive:** check the existing native Google Drive connection, search a bounded metadata page, or paste a specific Google Drive/Docs/Sheets file URL. **Import text** saves up to 20,000 readable characters with source URL, revision and fetch date. Preview it, choose scope and explicitly enable **Use in new agent turns**. Imports begin disabled. Refresh is explicit; failures preserve cached text and mark it stale. Unsupported/binary-only responses produce an error. The read adapter uses only `google_drive.search` and `google_drive.fetch`, never a model turn, account write, background crawl or copied OAuth token. Page cursors are opaque and owner-protected. Existing queued captures remain unchanged after a note/document is edited, disabled or removed.
- **Telegram:** create a dedicated bot through [BotFather](https://t.me/BotFather), enter its token once in Mari's Telegram tab and choose an enabled coordinator and fixed Personal/project context. Open the ten-minute pairing link in your own private Telegram chat, press Start, then confirm that exact private user back in Mari. Existing webhook bots are rejected without changing their webhook. The token lives only in `<MARI_DATA_DIR>/telegram-credentials.json` (0600); it is never returned by the API, exported to agents or placed in logs. Disconnect removes it. Bot setup, pairing and goal execution require the relevant connection/worker state shown in the interface.

From the paired private chat, send normal messages to talk with **Mari** and receive the completed answer directly. Follow-ups share a dedicated phone conversation in the configured Personal/project context; `/new` closes that conversation and cancels its unfinished turns while preserving saved history. Use `/image your prompt` to request one image through native subscription-authenticated generation. Mari validates and saves the real image, then uploads a bounded JPEG photo; the original remains downloadable in Agents → Mari → Tasks. No image-provider key or API-billed fallback is used. `/goal your requested result` still delegates through the configured coordinator and now returns its final synthesis. `/status` covers recent phone chat/image jobs and goals; `/cancel ID` cancels one owned job or team, and `/cancel` selects the latest active phone request. `/help` lists the commands. At most three phone requests may be active. Phone cancellation applies only to that binding's own phone goals; unrelated work and project services remain independent. Telegram cannot approve images, implement websites, change connected accounts or grant agents broader permissions. Mari and its normal worker must be running; no public server endpoint or tunnel is opened, and a phone does not gain access to a localhost workspace URL. Requested answers and images return to the paired phone; complete history, execution details and original files remain available in Mari. Normal chat requires an enabled, unarchived Mari profile. Turning off phone requests stops chat/image work as well as preventing new goals. Changing the paired user or fixed context suppresses obsolete content delivery.

Notification settings cover completed/failed/cancelled phone goals and pending input/approval requests; optionally include goals started in Mari after pairing. Optional notifications contain coordinator names, identifiers and status. Direct replies to new phone requests carry the requested answer or image and are independent of the optional status-notification switch. Older phone goals and desktop goals are not automatically exported as full answers. Current notification consent and the exact confirmed pairing gate delivery. Turning notifications off cancels affected pending alerts; changing the paired user also invalidates the old binding and its phone-goal cancellation access. Explicit command/pairing replies have separate consent from optional alerts. An affected request already in flight is aborted where possible and remains uncertain because it may already have reached Telegram. Long answers are split into ordered messages without dropping Unicode characters. A failed or uncertain part blocks later parts until explicit retry; ambiguous photo uploads are never automatically replayed. The Telegram client allows at least two seconds for address-family connection attempts, so the verified host IPv4 route is not abandoned after the Node default 250 milliseconds. Normal `npm start` needs no special network flag.

[Telegram chat and image verification](docs/research/2026-11-07-telegram-conversation-verification.md) records native generation, isolated transport/browser checks and the remaining owner phone test.

Incoming receipts and goal creation persist atomically, preventing duplicate goals when updates replay. **Sent** means Telegram confirmed API acceptance, not that you read the message. Uncertain delivery is not replayed automatically; explicitly retrying may duplicate a message Telegram already accepted. A notification error does not fail the goal. Temporary restricted workers, including newspaper runs, do not poll Telegram.

The native verification checked Drive connectivity without reading files and proved a captured synthetic memory reached one real subscribed Codex turn. The ten Firefox captures and route/worker/send/pairing checks use isolated synthetic fixtures, including an older cached source. The recorded full suite passed 205 tests, the focused suite passed 24, and the production build passed. Live Telegram still needs your own bot token and private-user confirmation; selected Drive imports await your file choice. No real Drive files or Telegram messages were used during implementation. See the [specification](docs/superpowers/specs/2026-11-07-knowledge-phone-design.md), [verification evidence](docs/research/2026-11-07-knowledge-access-verification.md) and [SHIP finish review](docs/design/knowledge-access-finish-review.md).


## Repository map

- `src/`: React workspace, official shadcn/ui components, themes and character assets.
- `server/`: local Express API, owner sessions, SQLite persistence and integration boundaries.
- `worker/`: background jobs, native Codex execution and project/integration workflows.
- `shared/`: shared contracts and catalogs.
- `scripts/`: development launcher, newspaper command and Dot handoff CLI.
- `examples/`: isolated demonstration project.
- `tests/`: Node test-runner coverage.
- `docs/`: product specifications, architecture decisions and historical verification records.

The portrait above is the existing Mari roster artwork, not a screenshot of the current interface. See [asset provenance](docs/design/agent-portraits/) for the character-art records. Local runtime data, credentials, dependency folders, build output and generated review captures are excluded from version control. Existing verification records describe their recorded revisions; they are not a fresh certification of the current checkout.
