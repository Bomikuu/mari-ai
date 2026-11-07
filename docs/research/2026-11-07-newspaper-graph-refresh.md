# Daily newspaper application graph refresh — 7 November 2026

The isolated application graph now covers **90 JS/JSX source files**, approximately **81,666 words**, **749 graph nodes**, **2,646 graph edges**, and **28 communities**. It includes the newspaper source adapters, generation routes, native worker, scheduled CLI, shared layout, PDF renderer, React workspace and five newspaper test files. The capture instant is `2026-11-06T19:10:43.526131+00:00`.

## Scope and exact invocation count

Used the existing `graphify-out/application/refresh-local.py` workflow and the installed local Graphify Python. Exactly **one extraction and one render** were run, in this order:

```text
/home/micxsz/.local/share/uv/tools/graphifyy/bin/python graphify-out/application/refresh-local.py extract
/home/micxsz/.local/share/uv/tools/graphifyy/bin/python graphify-out/application/refresh-local.py render
```

The 28 community labels were reviewed against the new partition between extraction and rendering. Newspaper responsibilities form explicit communities named **Newspaper Generation and Scheduling**, **Bounded Newspaper Source Collection**, and **Newspaper Layout and Printing**. Worker, storage, private artifact and native execution relationships also connect to their existing application communities.

Only `.js` and `.jsx` files in `server`, `worker`, `shared`, `scripts`, `src`, `examples`, and `tests` were scanned. All seven installed official shadcn/ui JSX component files remain included. Hidden paths, symlinks, dependencies, runtime data, documentation, CSS, raster contents and build output were excluded. No application source or tests were edited for this refresh. The final screen-only CSS correction is outside this AST scope.

Graphify extraction and rendering recorded **zero LLM input/output tokens** and **zero external API calls**. The existing workflow blocks socket connections in-process before importing Graphify. No browser, publisher request or inference provider was used for the refresh. The cost ledger gained exactly one run, from 15 to 16 entries.

## Verified identities

All **90 current source files** match the final `snapshot.json` SHA-256 map, the exact `source-files.json` list and the complete `manifest.json` scope. Every manifest AST change-detection **MD5** also matches its current source file. The twelve newspaper source/test file SHA-256 hashes and the verification results are recorded in `graphify-out/application/newspaper-refresh-validation.json`.

All **eight top-level requirements graph artifacts remain byte-for-byte unchanged**. Their SHA-256 identities matched `graphify-out/application/requirements-graph-sha256.json` both before extraction and after rendering. No requirements graph artifact was rewritten.

## Extraction limits and graph health

The extractor modeled **712 nodes** and **2,755 raw relationships**. It excluded **32 non-EXTRACTED relationships** and preserved **2,723 EXTRACTED raw relationships** in `extraction.json`. Published graph counts additionally reflect import placeholders and normal undirected aggregation.

The integrity report records **0 missing endpoint edges**, **12 dangling endpoint edges**, **8 self-loop edges**, and **75 same-endpoint relationship variants collapsed by the default undirected graph**. Raw included relationships remain available for audit. Seven code files yielded no modeled symbols; the AST model does not represent every data file or anonymous test callback. External packages, CSS and raster imports can create placeholders or dangling references without inspecting those assets.

The outputs beneath `graphify-out/application/` include `graph.json`, `graph.html`, `GRAPH_REPORT.md`, `extraction.json`, `integrity.json`, `snapshot.json`, `source-files.json`, `manifest.json`, reviewed community labels, the zero-token cost record and the newspaper validation record. Temporary extraction/analysis sidecars were removed by the successful render.

This graph is a structural snapshot. It does not establish passing tests, faithful news summaries, publisher availability, successful browser printing or active automation registration. Those functional checks belong to the separate implementation and finish-verification records.
