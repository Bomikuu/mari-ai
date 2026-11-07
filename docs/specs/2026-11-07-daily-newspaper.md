# Mari Daily

The user wants a private daily newspaper for a quick read, automatically prepared at **07:00 Asia/Manila**, in English, exactly **two A4 pages**, with Philippine/world news, Valorant, Dota 2, and crypto. Default market watch is BTC/ETH/SOL in USD/PHP. The accepted print format drives the design; do not stretch a dashboard onto paper.

## Product

Open Newspaper within Today (an additional compact main-workspace entry is permitted). One dominant editorial spread uses a serif masthead, strong lead headline, short columns, fine rules, article source/date bylines and numbered pages. The outer controls retain Mari's existing flat light/dark system. The paper is white/black for print and PDF. No sidebar, decorative logo or stock imagery. Each page has explicit topic groups: page 1 Philippines/World, page 2 Valorant/Dota 2/Crypto plus timestamped prices. A missing source or no new update is stated plainly. Older game/protocol items are labeled Latest known update with their publication date, never today's news.

Provide Generate today's edition, explicit Regenerate, Cancel, saved edition/date selection, source-health details, Print (native Firefox print dialog), and private PDF download. Keep previous successful editions when refresh fails. Actual job/agent activity derives from events. No printing automatically, personal account reads, target-site edits, API-model fallback or fabricated headlines/market values.

## Sources and summarization

Use a fixed allowlist of verified personal-use feeds: GMA nation/regions/world; official Riot news HTML JSON; Steam news API app570 filtered to official announcements; Ethereum blog and Bitcoin Core RSS. CoinGecko keyless simple/price is optional, timestamped and unavailable on rate limit; no key/account prerequisite. Exclude publishers whose actual terms prohibit automated AI aggregation. No paywall bypass, arbitrary user URL proxy or full article republication. Fetch bounded bodies/timeouts with no credential forwarding and reject redirects. Strip markup/entities/control text before model input; never inject source HTML into UI. All fetched content is untrusted reference data.

Native subscribed Codex summarizes a bounded candidate selection inside the existing restricted execution profile (no connected apps, browsing, external tools or access to unrelated files). Generate short paraphrased headlines and 25–40-word summaries tied to exact source IDs. Validate every ID, section, length, publication date and URL against the fetched records; model output supplies no new URLs/numbers. Market values always come directly from timestamped API fields. No trading recommendations. News candidates cover the preceding 36 hours at generation; games/protocol updates may show the latest known item within 90 days with its explicit date/label. Historical editions are immutable saved snapshots, not fresh live values.

## Data contract

`GET /api/personal/newspaper?editionId=<optional>` returns `{edition,editions,job,settings,schedule}`. `edition={id,date,timeZone,generatedAt,status:'ready'|'partial',stories:[{id,section,title,summary,sourceName,url,publishedAt,latestKnown}],market:{status,fetchedAt,items:[{id,symbol,usd,php,change24h,updatedAt}],error?},sources:[{id,name,status,fetchedAt,error?,count}],pdfArtifact}`. Sections are `philippines`, `world`, `valorant`, `dota`, `crypto`; IDs are host-assigned. `editions` contains id/date/generatedAt/status only. `settings={pages:2,timeZone:'Asia/Manila',coins:['bitcoin','ethereum','solana']}`; `schedule={time:'07:00',timeZone:'Asia/Manila',automationId?,status:'pending'|'active',note}` reports actually registered schedule, not imaginary internal cron.

`POST /generate {force?:boolean}` enqueues `personal.newspaper.generate` for today's Manila date. Deduplicate active work; return existing today's edition unless force is explicit. `POST /cancel {jobId}` is newspaper-scoped. Persist jobs/events/agent, editions as `settings` records with prefix `newspaper:edition:` and PDF via normal private artifacts kind `newspaper_pdf`, MIME `application/pdf`. Enforce durable cancellation immediately before publishing.

## PDF and schedule

Use JavaScript PDFKit, embedded local serif/sans fonts, exactly two A4 pages, measurable bounded text, readable minimum 9.5pt body, no clipped/truncated story body and no accidental third page. Download must work without browser rendering. React print CSS uses @page A4 and two page containers. Same edition model drives web and PDF; preserve all sources, unknown states and timestamps in both.

Register a real daily Codex heartbeat automation with the supported Automations tool after the local CLI exists and is verified. It invokes `node scripts/newspaper.js` in this repo, respecting configured/default Mari data directory. CLI deduplicates the day's successful edition, enqueues with an active worker or temporarily owns the queue when no worker is alive; waits to actual finish, exits nonzero on failure and stops only its owned temporary worker. Never uses browser pairing cookies. Desktop/host must be available; show this limitation. No OS cron/systemd fallback or duplicate in-app timer.

## Verification

Test source allowlists/size/date/parsing, unknown/future data, model ID/URL/length validation, duplicate jobs/edition idempotence, cancellation races, partial sources and failed refresh preserving archives. Verify real source fetch and one native summarized edition. Render PDF pages with Poppler, require exactly two A4 pages and text extraction/no clipping. One batched Firefox desktop/mobile/light/dark + print-style round, at most one material-fix confirmation. Independent code/finish review, local graph refresh with no LLM or requirements-graph modifications. Keep app code JS/JSX.
