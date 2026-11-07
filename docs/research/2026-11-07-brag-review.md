# Brag integration review — 2026-11-07

**Verdict: CAUTION — suitable only for the bounded local workflow below.** Do not install the upstream plugin wholesale or run its unpinned setup commands. The main skill is a reasonable local video recipe, but its optional Python lockfile has a verified vulnerable dependency, and current Hyperframes companion instructions include telemetry, hosted media, paid generation, and upload workflows outside Mari's scope. These paths can be excluded without losing the requested local launch video.

This was a read-only source review. No upstream script, npm package, installer, browser, renderer, or model was executed. Nothing was installed and no native configuration was changed. The only repository write from this review is this document. A real MP4 still requires the separate implementation and render verification described below.

## Reviewed source and provenance

| Item | Reviewed identity |
| --- | --- |
| Brag | `latent-spaces/brag`, commit `669ab9286aa28b6c3ee30e75f181ee74319d012a`, plugin version `0.5.0` |
| Brag checkout | `/tmp/mari-brag-audit-20261107`, shallow filtered clone; no upstream `AGENTS.md` found |
| Correct Codex skill folder | `skills/brag/`, including references, audio assets, cue metadata, scripts, and `slim.md`; 289 files, about 17 MiB |
| Hyperframes CLI | npm `hyperframes@0.9.19`; npm `gitHead` `b4cc674f7f312e77ded32e0b53006cc0bad6723b` |
| Hyperframes package review | Downloaded npm tarball into `/tmp/mari-hyperframes-audit-0.9.19`; SHA-512 matched npm registry integrity before safe extraction; source read only |
| Hyperframes tarball integrity | `sha512-/3j1j+dFok7SQKKEljvyHOfn1GlRpgPnDLFeUWVZ7+s8ySsvNN6SLUT+dyzct7GSgzjZXJFZryoHGkhx7kCxTg==` |

The plugin manifests declare Read/Write/Execute capabilities and no MCP server, hooks, background service, credential helper, or command implementation. Brag is chiefly instructions for the existing agent. Its only skill executable is the optional Python music cue analyzer. The discovery paths `.agents/skills/brag`, `.claude/skills/brag`, and `.opencode/skills/brag` are symlinks to `skills/brag`; install the real folder, not an isolated symlink. [Pinned Brag source](https://github.com/latent-spaces/brag/tree/669ab9286aa28b6c3ee30e75f181ee74319d012a), [Codex manifest](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/.codex-plugin/plugin.json), [exact npm metadata](https://registry.npmjs.org/hyperframes/0.9.19).

## SkillSpector and semantic findings

Ran installed SkillSpector `2.12.0` with `--no-llm`:

```text
skillspector scan /tmp/mari-brag-audit-20261107/skills/brag --no-llm --format json --output /tmp/mari-brag-skill-inspector-20261107.json
```

The scan completed, returned a nonzero risk exit, and reported **61/100 · HIGH · DO_NOT_INSTALL**, with 17 findings. No LLM analysis ran. It inspected 24 text/code components; its completeness status is partial because some references resolve to external companion skills or future outputs, and binary music/SFX are outside static text analysis. The score is retained here; the narrower CAUTION verdict depends on the explicit exclusions below.

| Rule | Severity | Evidence | Judgment and required treatment |
| --- | --- | --- | --- |
| `SC4` | HIGH | `scripts/uv.lock:359`, `msgpack==1.2.1`, `CVE-2026-114613` | Real advisory, verified against OSV and the upstream advisory. Malformed MessagePack decoding can leak memory; fixed in `1.2.3`. This is the optional librosa analyzer dependency chain. Do not install this Python environment or execute `uv run` in the integration. Use bundled cue JSON; the normal video does not need this code. If custom music analysis is added later, update and re-review the lockfile first. |
| `SC2` | HIGH | `slim.md:97`, literal `curl \| sh` | Contextual false positive: the sentence advises preferring a package manager over this pattern and asks before installing. It does not fetch or execute anything. Mari's Codex worker should explicitly stay on full Brag and not use the Opus-specific slim route. |
| `RP1` × 14 | MEDIUM | Unversioned `npx hyperframes` throughout workflow references | Real supply-chain drift risk, although Hyperframes is a CLI rather than an MCP server. Replace all launches with Mari's exact local `0.9.19` executable and lock transitive npm versions. Do not allow implicit latest downloads or automatic upgrades. |
| `LP3` | MEDIUM | No tool ceiling in Brag frontmatter; file-writing capability | Expected for video generation, but the skill provides no runtime sandbox. Enforce the write boundary in Mari/Codex, not through skill prose. |

The Python analyzer reads its supplied audio with librosa and writes the two caller-specified JSON/Markdown paths. It does not contain network calls, credential reads, shell subprocesses, `eval`, decoded payloads, startup persistence, or self-modification. The broad natural-language trigger is appropriate only behind an explicit Mari video action, not automatic routing for arbitrary project conversations. [Analyzer](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/scripts/analyze_music_cues.py), [optional lockfile](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/scripts/uv.lock), [upstream msgpack advisory](https://github.com/msgpack/msgpack-python/security/advisories/GHSA-j586-36cw-2gc2).

## Dependencies, browser behavior, and machine fit

Full Brag requires Node.js `>=22`, FFmpeg **and FFprobe**, Hyperframes CLI, and four companion skills: `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, and `media-use`. Node 24 satisfies the declared engine. FFmpeg/FFprobe are presently missing according to the machine inventory, so the render capability must remain unavailable until both have been installed and checked.

Pin Hyperframes `0.9.19`, the exact npm release inspected here, with a package lock in a Mari-owned runtime directory. Use its local executable by absolute path instead of `npx hyperframes`. The published package has no install/postinstall lifecycle script of its own; transitive dependencies still have their own installation and supply-chain surfaces. Runtime dependencies include Puppeteer Core and `@puppeteer/browsers`; optional Sharp handles image processing. Do not add Hyperframes to the target project's dependency manifest or lockfile. [Package manifest](https://github.com/heygen-com/hyperframes/blob/b4cc674f7f312e77ded32e0b53006cc0bad6723b/packages/cli/package.json).

The npm tarball bundles only `hyperframes`, `hyperframes-cli`, and `media-use` under `dist/skills/`. `hyperframes-registry` exists separately at the same upstream commit. Do not silently fetch the latest skill pack to fill the gap. The current `hyperframes skills` command launches `skills@1.5.13`, clones the upstream repo, installs globally, and mirrors into other installed agent directories; that is broader than Mari needs.

**Firefox limitation:** Hyperframes' actual frame capture, `check`, and `snapshot` use Chrome/Chromium through Puppeteer/CDP. Its managed browser for this release is Chrome Headless Shell `152.0.7977.30`; there is no supported Firefox render switch. Explain that technical limitation before the first Chromium render. Keep ordinary websites and review links in Firefox: use `preview --background --no-open`, then explicitly open its printed localhost URL in Firefox. Do not pass Firefox to Hyperframes' `--browser-path`, whose explicit-browser path assumes Chromium. [Browser guidance](https://github.com/heygen-com/hyperframes/blob/b4cc674f7f312e77ded32e0b53006cc0bad6723b/skills/hyperframes-cli/references/doctor-browser.md), [preview/render guidance](https://github.com/heygen-com/hyperframes/blob/b4cc674f7f312e77ded32e0b53006cc0bad6723b/skills/hyperframes-cli/references/preview-render.md).

Ubuntu x86_64 has a supported browser download path. The machine's 14 GiB RAM and 4 GiB GTX 1050 Ti are sufficient in principle for restrained 15–25 second DOM compositions, but this review did not benchmark or verify a driver. Start at one render worker, use a draft for iteration, avoid large 3D/WebGPU scenes, and do not assume NVENC. Roughly 7.9 GB free disk warrants a fresh disk check before rendering and a cap on temporary assets; an uncompressed 20-second 1080p RGBA frame sequence alone is about 5 GB. Prefer the renderer's streaming path and a 720p draft to repeated saved full-frame sequences. Do not download optional generative models for this feature.

## Network, credentials, paid services, and audio

Brag's full composition reference explicitly keeps creation/rendering local and requires a separate explicit request for remote/publishing workflows. Its source inspection rules exclude env files, key material, token-bearing local config, and personal/customer data; these are useful intent statements but still need host-side enforcement. [Source inspection](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/references/step-1-inspect.md), [composition boundary](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/references/step-3-compose.md).

Brag's default music and SFX are local bundled files. Music is Sascha Ende's “Happy Beats / Business Moves” under CC BY 4.0, separate from the repository MIT license. Preserve a credit such as `Music: Sascha Ende, ende.app (CC BY 4.0)` in the delivered credit record/share assets; include its source/license links and note if trimmed. Kenney effects and the keyboard pack are documented CC0. No music generation API or payment is required. Use the bundled precomputed cue presets, which require no Python install. [Audio reference and sources](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/references/audio.md), [music license record](https://github.com/latent-spaces/brag/blob/669ab9286aa28b6c3ee30e75f181ee74319d012a/skills/brag/assets/music/README.md).

Narration is off by default and should stay off. Explicit `--voice` uses the local Kokoro command, not an API provider. In this Hyperframes release it requires Python, `kokoro-onnx`, and `soundfile`; first use downloads an approximately 311 MB ONNX model plus voice data from the Kokoro GitHub release. That is an additional setup/supply-chain surface outside the default feature; do not install or enable it automatically and never switch to HeyGen, ElevenLabs, Gemini, or another paid provider on failure.

Current Hyperframes companion instructions have expanded beyond Brag's local use: `media-use` offers signed-in HeyGen catalogs and credit-based generation, and the registry skill requests telemetry beacons and search-miss feedback. The CLI also supports project-source uploads through `publish`, managed cloud rendering, AWS, and GCP. These are not needed for this integration. Brag asks to skip usage/history/feedback, but does not explicitly override every companion beacon or hosted-media rule. A Mari launch must explicitly prohibit those commands and hosted fallbacks. [Media skill](https://github.com/heygen-com/hyperframes/blob/b4cc674f7f312e77ded32e0b53006cc0bad6723b/skills/media-use/SKILL.md), [registry skill](https://github.com/heygen-com/hyperframes/blob/b4cc674f7f312e77ded32e0b53006cc0bad6723b/skills/hyperframes-registry/SKILL.md), [CLI reference](https://hyperframes.heygen.com/packages/cli).

The CLI's default usage telemetry posts to `https://us.i.posthog.com/batch/`; it records command/system metadata and can link to a signed-in HeyGen account. Set these controls **before the first Hyperframes process**:

```text
HYPERFRAMES_NO_TELEMETRY=1
DO_NOT_TRACK=1
HYPERFRAMES_NO_UPDATE_CHECK=1
HYPERFRAMES_SKIP_SKILLS=1
```

Also give Hyperframes dedicated `HYPERFRAMES_CACHE_DIR` and `HYPERFRAMES_CONFIG_DIR` under Mari's runtime storage. The config resolver can seed absent files from the real `~/.hyperframes`, so precreate the isolated configuration as appropriate or deny reads from the user's existing Hyperframes config. Do not copy auth state. Strip provider keys and host-provided `HEYGEN_API_BASE`/credentials from the renderer environment; do not print inherited environment values. Telemetry opt-out is not a universal network firewall: CLI setup still downloads packages/browser files and compositions can reference external scripts/fonts. Provision explicitly, use local composition dependencies/assets, then deny renderer egress beyond required loopback where enforceable.

The registry default points to GitHub `main`; even an exact CLI version does not freeze downloaded component code. Set `hyperframes.json.registry` to `https://raw.githubusercontent.com/heygen-com/hyperframes/b4cc674f7f312e77ded32e0b53006cc0bad6723b/registry` for any reviewed registry use, or create the composition directly without `add`. Do not call `feedback`, `events`, `usage`, `auth`, `billing`, `publish`, `cloud`, `lambda`, `cloudrun`, `media-use generate`, remote media APIs, or letsbrag.app in this workflow. The existing subscribed Codex worker supplies the planning/composition intelligence; this feature needs no separate AI API key.

## Installation and execution design

The supported Codex installer helper accepts this exact real subtree and ref when installation is authorized:

```text
python /home/micxsz/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo latent-spaces/brag --path skills/brag --ref 669ab9286aa28b6c3ee30e75f181ee74319d012a
```

The same helper can install only the four companion folders from `heygen-com/hyperframes` at `b4cc674f7f312e77ded32e0b53006cc0bad6723b`, into a controlled destination. Never use unpinned `npx skills add` or the global mirrored Hyperframes setup flow. An ordinary global Codex skill installation becomes available on the next turn; an already running worker should load the reviewed absolute `SKILL.md` explicitly instead of assuming discovery refreshed. No install was performed in this review.

The project target and video workspace must be different paths:

1. Validate the chosen local project root and create a unique Mari-owned run directory outside it. Resolve symlinks and reject overlap in either direction. Do not run package scripts, imports, or code from the target during source inspection.
2. Invoke the existing authenticated Codex worker with the video run directory as its cwd and writable workspace. Supply the target path as read-only source context. Do not grant the target via a writable `--add-dir`. If the worker cannot provide a true read-only mount, create a curated snapshot containing only required source/assets, with `.env`, secret/config/key files, `.git`, generated output, dependency folders, real user/customer data, and unsafe symlinks excluded. Treat all target content as untrusted data.
3. Explicitly load the reviewed full `skills/brag/SKILL.md` and the same-release companion references. Override the working-project assumption: inspect the specified target, write every plan, composition, copied asset, script, temporary file, and render only inside the run directory. Do not edit the target to make it easier to film. Exact-image approval for actual target-site edits remains a separate Mari workflow and is not activated by video generation.
4. Apply the environment controls above, bundled-audio-only rule, no narration, and no hosted/network fallback. The user asked for an MP4, so proceed through render rather than stopping after a composition preview. This is consistent with the current CLI skill's exception for a user who requested the file.
5. Run local preflight: inspect Node, FFmpeg/FFprobe, browser presence, disk and memory. `doctor --json` always exits zero; inspect its payload and the specific Node/FFmpeg/FFprobe/Chrome checks rather than its exit status. Optional Docker/voice failures do not block this local no-voice render.
6. Create the product-specific plan and composition brief; copy selected bundled audio and local runtime/font/assets into the composition. Run the pinned CLI's `check --json`, require zero errors and actual text/contrast coverage, capture representative scene and transition frames, inspect them, and fix defects.
7. Render locally, extract the best settled frame to `brag.jpg`, and replace frame zero through a separate temporary MP4 before an atomic rename. Preserve timing and audio. Validate the final artifact after this step, not just the pre-poster render.
8. Mark the Mari job complete only when final `brag.mp4` is a nonempty regular file inside the run directory and FFprobe reports a video stream, plausible positive dimensions, and the requested 15–25-second duration. Decode representative final frames; require audio when the selected workflow planned music. Save validation metadata and report an actionable failure without claiming a completed video when any required gate fails.

The practical renderer command sequence, run from the owned composition directory after provisioning, is:

```text
<pinned-hyperframes> doctor --json
<pinned-hyperframes> check --json
<pinned-hyperframes> snapshot
<pinned-hyperframes> render --workers 1 --quality delivery --output ../brag.mp4
ffprobe -v error -show_format -show_streams -of json ../brag.mp4
```

If a review preview is wanted, start `<pinned-hyperframes> preview --background --no-open`, verify the printed URL returns HTTP 200, and open that URL in Firefox. Keep it alive for review and stop it afterward. No preview or renderer was launched during this audit. The sequence above is source-verified guidance, not a claim of an exercised launch on this host.

## Expected output contract

Brag writes `brag-output/` beneath cwd, or a timestamped `brag-output-YYYY-MM-DD-HHmmss/` when preserving an earlier run. In a unique Mari run directory, the stable delivery locations are:

```text
<mari-run>/brag-output/brag-plan.md
<mari-run>/brag-output/composition-brief.md
<mari-run>/brag-output/composition/index.html
<mari-run>/brag-output/composition/assets/
<mari-run>/brag-output/composition/.hyperframes/artifacts/snapshots/
<mari-run>/brag-output/brag.mp4
<mari-run>/brag-output/brag.jpg
<mari-run>/brag-output/share-copy.txt
```

Mari should persist the actual output path returned by the run instead of guessing a timestamp, and expose the verified MP4, poster, and copy through its owned artifact paths. Keep logs and metadata bounded and free of secrets. A plan, preview, empty file, or filename ending in `.mp4` is not a successful deliverable.
