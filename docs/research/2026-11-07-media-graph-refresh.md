# Local application graph refresh — 2026-11-07

The final application graph covers **78 JS/JSX source files**, approximately **69,764 words**, **637 nodes**, **2282 edges**, and **23 communities**. It includes the new Brag/voice server, worker, UI and test code. Community labels were reviewed against the final partition. Capture time: `2026-11-06T18:38:36.422548+00:00`.

## Scope and invocations

Used the existing `graphify-out/application/refresh-local.py` workflow and installed local Graphify Python. Only named JS/JSX directories were scanned: `server`, `worker`, `shared`, `scripts`, `src`, `examples`, and `tests`. Dependencies, runtime data, hidden paths, docs, CSS and raster contents were excluded. No application source or tests were edited for this graph refresh.

Ran the following pair three times. The first snapshot was superseded by final media parsing/output sandboxing and process cleanup; the third refreshed two factual UI copy corrections after the independent finish review. The final graph matches the shipping source:

```text
/home/micxsz/.local/share/uv/tools/graphifyy/bin/python graphify-out/application/refresh-local.py extract
/home/micxsz/.local/share/uv/tools/graphifyy/bin/python graphify-out/application/refresh-local.py render
```

All three refresh passes used **zero LLM input/output tokens** and **zero external API calls**. The existing script blocks socket connections in-process. No browser or model/provider call was used for graph extraction or rendering. The generated graph remains a structural snapshot, not functional proof of the application or its media outputs.

## Verified final identities

All **78** current selected source files match the final `snapshot.json` SHA-256 map and `source-files.json` file list. Every `manifest.json` AST change-detection MD5 also matches its current source file. `worker/brag.js` is `c5252661f1264e1ad2b3b24f9f59507a56263c666133badadf6133b02647a9b1`; `worker/codex.js` is `8e5ff209526ab7dd0d0811a296741223089627653cbfae0457f9030e8fd4cd38`. The media code review's hash table was refreshed to these same final source revisions.

All **eight top-level requirements graph artifacts remain byte-for-byte unchanged**, verified by independent before/after SHA-256 comparison. Their preserved identities are recorded in `graphify-out/application/requirements-graph-sha256.json`. No top-level requirements artifact was rewritten.

## Extraction limits and graph health

The extractor modeled **603 nodes** and **2,366 raw relationships**. It excluded **28 non-EXTRACTED relationships**, preserving **2,338 EXTRACTED raw relationships** in `extraction.json`. Final graph node/edge counts include external/import placeholders and the graph builder's normal aggregation.

The integrity report records **0 missing endpoint edges**, **11 dangling endpoint edges**, **7 self-loop edges**, and **54 same-endpoint relationship variants collapsed by the default undirected graph**. These diagnostic limits remain visible; raw included relationships are retained for audit. Seven code files yielded no symbols because this AST model does not represent all data files or anonymous test callbacks. CSS/raster imports can produce dangling external placeholders; their file contents were not inspected.

The final outputs are `graph.json`, `graph.html`, `GRAPH_REPORT.md`, `extraction.json`, `integrity.json`, `snapshot.json`, `source-files.json`, `manifest.json`, community labels and the zero-token cost record beneath `graphify-out/application/`.
