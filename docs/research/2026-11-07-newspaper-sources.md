# Daily newspaper sources — verified 7 November 2026

## Recommendation

Use GMA News Online's publisher-listed Nation, Regions and World RSS feeds; official VALORANT news metadata; Valve's Dota 2 announcements; and the Ethereum Foundation / Bitcoin Core RSS feeds. Add a small BTC/ETH/SOL price panel from CoinGecko only when its anonymous endpoint succeeds. This creates a useful private, personal newspaper without paid services, AI provider credentials, account connections, article scraping or a general web-fetch proxy.

The source selection below supersedes an initial operational-only recommendation of CoinDesk/BBC/Guardian: working HTTP endpoints do not establish permission for an automated AI-derived content pipeline. Their current restrictions make them unsuitable defaults for this feature.

Verification: bounded HTTPS GETs from this machine at approximately **2026-11-07 02:51–02:58 Asia/Manila** (2026-11-06 18:51–18:58 UTC), using Python standard-library HTTP/XML/JSON parsing. No publisher JavaScript was executed. Feed bodies were temporarily inspected under `/tmp`, not committed. A successful request is a point-in-time observation, not an availability guarantee.

## Exact default allowlist

| Source ID / section | Exact endpoint | Verified result and contract |
| --- | --- | --- |
| `gma-nation` / Philippines | `https://data.gmanetwork.com/gno/rss/news/nation/feed.xml` | 200, RSS 2.0, 15 entries, ~15 KB. Latest entry 2026-11-07 00:05 +0800. |
| `gma-regions` / Philippines | `https://data.gmanetwork.com/gno/rss/news/regions/feed.xml` | 200, RSS 2.0, 15 entries, ~14 KB. Latest entry 2026-11-06 22:55 +0800. |
| `gma-world` / World | `https://data.gmanetwork.com/gno/rss/news/world/feed.xml` | 200, RSS 2.0, 15 entries, ~16 KB. Latest entry 2026-11-07 02:45 +0800. |
| `valorant` / Games | `https://playvalorant.com/en-us/news/` | 200, ~535 KB HTML containing inert `__NEXT_DATA__` JSON; 200 article cards. Latest item 2026-11-05 16:00 UTC. This is an undocumented website-data adapter, not a supported public API. |
| `dota2` / Games | `https://store.steampowered.com/feeds/news/app/570/?cc=US&l=english&snr=1_2108_9__2107` | 200, RSS, 10 entries, ~63 KB. Direct `store.steampowered.com/news/app/570/view/...` links and URL GUIDs. Latest available announcement 2026-10-07 00:22 UTC. |
| `ethereum-foundation` / Crypto | `https://blog.ethereum.org/en/feed.xml` | 200, RSS, 646 entries, ~534 KB. Latest entry 2026-11-06 00:00 GMT; trim locally to recent entries. The tested `/feed.xml` redirects to this `/en/feed.xml`, so use the canonical URL directly. |
| `bitcoin-core` / Crypto | `https://bitcoincore.org/en/rss.xml` | 200, RSS, 119 entries, ~609 KB. Latest available entry 2026-10-28 00:00 -0400. Technical project announcements, not broad market journalism. |
| `coingecko` / optional market snapshot | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,php&include_24hr_change=true&include_last_updated_at=true` | 200 without API key, JSON, 423 bytes, all three coins and both currencies present. The documented Demo service requires `x-cg-demo-api-key`; anonymous success must remain best-effort. |

GMA's official [RSS index](https://www.gmanetwork.com/news/rss/) lists these `data.gmanetwork.com` URLs. The older `data.gmanews.tv` Nation/News URLs also returned 200 but need not be allowed. [GMA's user policy](https://www.gmanetwork.com/news/user-policy/) permits personal, educational, noncommercial viewing and downloads; content remains copyrighted. Keep publisher attribution and direct article links, avoid full article reproduction, images and branding, and keep editions private.

The [official Ethereum Foundation blog](https://blog.ethereum.org/) and [Bitcoin Core](https://bitcoincore.org/) are primary project sources. Label them by publisher and do not imply that they offer comprehensive or independent crypto-market coverage. Do not infer general reuse rights from open-source software licenses.

## Parsing and normalization contract

All RSS adapters read `rss/channel/item`. Supported common fields are `title`, `link`, `guid`, `pubDate`, `description`; `category` is optional/repeated. Treat the description as untrusted HTML and convert to bounded plain text; never retain `content:encoded` full articles, load media, follow embedded URLs or run instructions in feed content.

- **GMA:** GUIDs resemble `tag:gmanetwork.com:news_story-1008584`, marked `isPermaLink=false`. Use this opaque string for publisher-level deduplication. The same article can occur in multiple GMA section feeds. Dates contain explicit `+0800`; descriptions are short publisher blurbs. `media:content` exists but should be ignored.
- **Dota RSS:** GUID is the direct Steam announcement URL, `isPermaLink=true`; `pubDate` has an explicit UTC offset. Descriptions can contain long HTML/BBCode content; use only a brief safely converted portion if appropriate, never the entire body.
- **Ethereum:** `guid` and `link` are article URLs; `pubDate` is an RFC-style GMT string. Descriptions are available and categories are optional. The feed contains an archive, so never print every entry.
- **Bitcoin Core:** `guid` and `link` are article URLs. Dates have an explicit offset (sample `-0400`); preserve it during parsing rather than assuming Manila/UTC. Descriptions can contain full release notes: do not copy them into the paper.
- **VALORANT:** parse the text of `<script id="__NEXT_DATA__" type="application/json">` with `JSON.parse`, never `eval` or page execution. Find `props.pageProps.page.blades` entry whose `type === 'articleCardGrid'`, then read `items`. Card fields are `title`, `action.payload.url`, `analytics.contentId`, `publishedAt` (ISO UTC), `analytics.publishDate`, `category.machineName`, and `category.title`. Use `analytics.contentId` as ID, with canonical URL fallback. Resolve relative links against `https://playvalorant.com`; validate the resulting HTTPS host/path. The observed cards have **no summary field**. Show a sourced headline/link/date; do not fabricate an article summary from a headline. Filter game updates / patch notes by category or title, with announcements as a fallback.
- **CoinGecko:** object keys are `bitcoin`, `ethereum`, `solana`. Each contains finite positive `usd`, `php`; optional finite `usd_24h_change`, `php_24h_change`; and `last_updated_at` in Unix **seconds**. A missing/null change is unavailable, never zero. Convert seconds to milliseconds once. Display the provider's observation timestamp and currency. These prices are snapshots, not trade execution quotes. See [Demo simple-price documentation](https://docs.coingecko.com/demo/reference/simple-price).

Suggested internal article shape:

```ts
type NewspaperStory = {
  id: string;                 // `${publisher}:${opaqueGuidOrCanonicalUrl}`
  sourceId: string;
  publisher: string;
  section: 'philippines' | 'world' | 'games' | 'crypto';
  title: string;
  url: string;
  publishedAt: string | null; // ISO UTC after validated parsing
  retrievedAt: string;        // ISO UTC, never substituted for publication date
  summary: string | null;     // brief faithful paraphrase when supported; no invented facts
  summaryKind: 'paraphrase' | 'none';
};
```

Keep source data separate from any summarizer's instructions. Without an available permitted summarization path, title + publisher + publication date + source link is a complete valid item. Do not label copied publisher descriptions as Mari's original reporting. The user requested English, two A4 pages and BTC/ETH/SOL; story budgets should be layout-driven and leave room for source credits.

## Dota alternatives and patch freshness

[Steam's documented public method](https://partner.steamgames.com/doc/webapi/ISteamNews?language=english) was verified without a key:

`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=12&maxlength=400&feeds=steam_community_announcements`

200 JSON, `appnews.{appid,count,newsitems}`; entries contain `gid` (string, do not cast to JS number), `title`, `url`, `is_external_url`, `author`, `contents`, `feedlabel`, `date` (Unix seconds), `feedname`, `feed_type`, `appid`. The fixed official-announcements filter avoids third-party news mixed into the general app news endpoint. `maxlength=400` returns a bounded publisher blurb rather than a request for full content. API `url` values can use an Akamai external-post redirect; prefer RSS direct article links for the printed source URL and do not add arbitrary redirects to the fetch allowlist.

Optional official patch metadata was also verified:

`https://www.dota2.com/datafeed/patchnoteslist`

200 JSON, `{ success: true, patches: [{ patch_number, patch_name, patch_timestamp }] }`; 118 entries, latest `7.41f` with timestamp `1789455600` (2026-09-15 UTC). Sort by timestamp rather than version-string order. A canonical user link may be formed as `https://www.dota2.com/patches/<validatedPatchNumber>`. This website datafeed is undocumented and optional. Do not call an old patch a new update. At verification time there was no November announcement in the tested official Steam feed; show “Latest available” plus its real date or “No new official update in this edition.”

## Date, coverage and failure behavior

- Edition timezone is **`Asia/Manila`**, not the host machine's timezone. Automatic generation at **07:00 Manila is 23:00 UTC the preceding day**. An edition date and its `generatedAt` are separate from article dates. Freeze its story list and prices so printing later does not change the edition.
- A daily edition should normally select articles published in the prior 24 hours up to its generation cutoff. Games and official crypto projects can have no daily post: show the latest dated item, explicitly labeled, or an honest no-update line. Never change `publishedAt` to make material appear fresh. Unknown/invalid publication dates cannot qualify for “today”; quarantine or visibly label them undated.
- The GMA feeds expose 15 current entries and may span only hours on a busy day. Daily polling cannot guarantee complete 24-hour coverage; say “Selected stories from available feeds.” Persistent deduplicated metadata collected more often can improve coverage later, but is not a requirement for the first edition. Do not promise every major event.
- Primary deduplication is publisher + nonempty GUID; fallback is canonical article URL. Normalize only known tracking query keys and fragments for URL comparison. Do not collapse distinct stories by title alone, and do not merge different publishers' factual assertions into one unsourced story.
- Fetch sources independently with bounded concurrency and `Promise.allSettled`. A source error must not fail the entire newspaper. Track `ok`, `notModified`, `empty`, `timeout`, `httpError`, `parseError`, `stale` and a last-success timestamp per source. Display a small coverage note for unavailable sections.
- On 304 retain the existing valid source cache. If all news requests fail, show a previously saved edition with its original date, or an explicit unavailable state; never render seeded/sample stories as live news. A successful feed containing zero recent posts is different from a failed fetch.
- CoinGecko failure must only remove the market panel or show “Prices unavailable.” Do not use old values without a clear “as of” timestamp. Suggested maximum price age is 30 minutes at generation; omit stale values from a fresh edition. Do not derive a 24-hour change by comparing this edition with yesterday's daily snapshot.
- Honor `Retry-After` on 429/503; do not bypass challenges. Cache conditional validators where provided (GMA and VALORANT returned ETags). Normal daily reading requires very few requests; no aggressive polling is needed. CoinGecko documented access can change or require a key, so do not claim an anonymous rate-limit guarantee.

## Request and content boundary

Keep source endpoints in server-side code, addressed by fixed source IDs. Do not accept an arbitrary URL, hostname, port or redirect destination from the browser, feed XML, stored summary or model output. Permit HTTPS only and exact approved host/path/query combinations. Disable automatic redirects except individually validated known canonical redirects, with a small hop cap; the preferred URLs above require none in the observed response.

For the initial adapter, reasonable limits are 8–10 seconds per source, a bounded overall deadline, 1 MiB per RSS response, 2 MiB for VALORANT HTML, and a small retained item count per source. Reject oversized and malformed bodies, DTDs/external entities, wrong content types and schema drift. Escape output; remove scripts, styles and markup; apply title/summary length limits. No feed-provided instruction may initiate tools, install software, change settings, read local files or contact anyone. Node/server fetching avoids browser CORS restrictions; it does not justify adding a general-purpose CORS proxy.

## Tested but excluded / unresolved sources

| Source / URL | Operational observation | Default decision |
| --- | --- | --- |
| VALORANT `https://playvalorant.com/en-us/rss.xml` | 404 | Use the official news metadata adapter; no fabricated RSS endpoint. |
| Inquirer `https://newsinfo.inquirer.net/feed/` | 403 | Omit; do not bypass blocking. |
| Rappler `https://www.rappler.com/feed/` and `/philippines/feed/` | Both 200, 10 entries, explicit +0800 dates; observed GUIDs empty, requiring URL IDs. General feed includes sports/entertainment. | Omit from initial allowlist; current automated/AI-use permission was not established in this bounded review. A guessed `/about/terms-of-service/` returned 404. |
| BBC World `https://feeds.bbci.co.uk/news/world/rss.xml` | 200, 25 entries, GMT dates. | Omit for transformed/AI-derived newspaper content: [BBC's published terms](https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_19September2022english.pdf) constrain extraction and alterations and require nearby BBC credit for feed display. This older published document is not treated as proof of current broader permission. |
| Guardian `https://www.theguardian.com/world/rss` | 200, 45 entries. RSS [help](https://www.theguardian.com/help/feeds) describes personal, noncommercial reading. | Omit for AI-derived summaries: [current terms](https://www.theguardian.com/help/terms-of-service) expressly restrict AI-related extraction/content synthesis and aggregation/mining. Personal printing permission is not permission for those transformations. |
| CoinDesk `https://www.coindesk.com/arc/outboundfeeds/rss/` | 200 (redirect removes trailing slash), 25 entries, UUID GUIDs. | Omit: [terms effective 2026-10-30](https://www.coindesk.com/terms) prohibit automated access without written permission and limit copying/modification. |
| Cointelegraph `https://cointelegraph.com/rss` | 200, 30 entries, URL GUIDs. | Omit: [terms](https://cointelegraph.com/terms-and-privacy) explicitly restrict automated content pipelines and AI operation without written consent. |
| CryptoSlate `https://cryptoslate.com/feed/` | 200, 10 entries, +0000 dates, WordPress GUIDs. | Its [feed directory](https://cryptoslate.com/feeds/) permits personal informational noncommercial reading, but [full terms](https://cryptoslate.com/terms-and-conditions/) restrict extraction/automated pipelines and republication. Omit from an AI-derived summary default; potential personal feed-reader use needs no article scraping. |
| Solana `https://solana.com/news/rss.xml` and `/news/rss` | Both returned 429. | Omit unverified routes; do not retry around the rate limit. SOL price coverage still works. No claim of Solana news coverage. |
| Coinbase public spot / exchange-rates endpoints | Local TLS certificate verification failed. | Omit this fallback; never disable TLS verification to make it work. |

No external accounts, messages, subscriptions or paid services were created during research.

## Implemented adapter verification

After this research was accepted, `server/newspaper-sources.js` was implemented with the fixed seven news sources above, the official filtered Steam JSON method, and optional CoinGecko. Ten focused tests cover valid contracts, strict source URLs, date windows, markup stripping, malformed/hostile XML, partial failures, redirects/content types/body limits, official Steam filtering, deduplication and cancellation. `node --test tests/newspaper-sources.test.js` passed all ten.

A real Node collector run at **2026-11-06T18:58:11.943Z** returned all seven news sources ready, ten selected candidates, and three current BTC/ETH/SOL price records. Dota 2 and Bitcoin Core items correctly retained their October publication dates and `latestKnown: true`. No TLS verification bypass, API credential or article-page fetch was used.
