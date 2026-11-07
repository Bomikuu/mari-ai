# VoiceStudio local installation — 7 November 2026

VoiceStudio's actual FastAPI backend and KittenTTS engine are installed under `/home/micxsz/.local/share/mari-ai/tools/voicestudio`. The backend generated a real feminine synthetic speech preview through its HTTP API. This is a backend-only installation for Mari; it does not include the Electron desktop/web UI or the unrelated cloning, transcription and dubbing dependencies/models.

## Installed artifacts

| Artifact | Installed version / identity |
| --- | --- |
| VoiceStudio | `0.5.7`, source commit `3a236a595c4a201ca81052523daa729fc8de4ba5` (upstream main snapshot, pinned by commit) |
| Source | `/home/micxsz/.local/share/mari-ai/tools/voicestudio/source` |
| Isolated Python environment | `/home/micxsz/.local/share/mari-ai/tools/voicestudio/venv`, CPython `3.11.17` |
| PyTorch / torchaudio | `2.8.0+cpu` / `2.8.0+cpu`, official CPU wheels; no CUDA stack |
| FastAPI / uvicorn | `0.136.3` / `0.52.4` |
| KittenTTS SDK / ONNX Runtime | `0.8.1` / `1.29.0` |
| Model | `KittenML/kitten-tts-mini-0.8`, revision `c02725660cea441db4c383af69f1f26f5cd00947` |
| Model download | `81,549,641` bytes across five files; approximately 78 MiB installed |
| Default Mari voice | `expr-voice-2-f` (`Bella`), English, speed `0.95` |
| Configuration | `/home/micxsz/.local/share/mari-ai/tools/voicestudio/config.env` |
| Exact installed dependency inventory | `/home/micxsz/.local/share/mari-ai/tools/voicestudio/installed-requirements.txt` |

The SDK and direct backend dependencies were selected from upstream `uv.lock`, then installed into the isolated environment. The resolved complete environment is recorded in `installed-requirements.txt`. No upstream install script was executed. The source checkout is unmodified. Do not run `uv run` or `uv sync` in this source checkout for normal use: those commands can install the much larger default development/CUDA dependency set.

Approximate disk use after installation: 1.4 GiB environment, 68 MiB source, 78 MiB model, under 1 MiB local data and preview. The filesystem retained approximately 6.4 GiB free. Loaded backend RSS was approximately 616 MiB. These are observed values, not a guarantee for longer concurrent work.

## Run and stop

Run in a terminal:

```sh
/home/micxsz/.local/share/mari-ai/tools/voicestudio/run-backend.sh
```

The launcher changes to the pinned source and executes:

```sh
/home/micxsz/.local/share/mari-ai/tools/voicestudio/venv/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 3900 --workers 1 --no-proxy-headers
```

It exports the colocated `config.env`, which selects the CPU and KittenTTS, isolates data/models/settings, limits CPU workers to two, disables analytics and background ASR/watermark preload, and sets `HF_HUB_OFFLINE=1` for normal cached operation. The model was downloaded through VoiceStudio's own install API before enabling offline mode. To explicitly install another model later, temporarily change that offline setting and restart.

Stop with Ctrl+C in that terminal. No system service, automatic startup entry, public listener, system package, browser-default change, or cloud account was created. Removal is reversible by deleting only this user-owned installation directory after stopping its process; it also contains its local data and preview.

## HTTP contract for Mari's Node adapter

Base URL: `http://127.0.0.1:3900`. This listener must remain on loopback. Upstream trusts loopback clients; setting `OMNIVOICE_API_KEY` does **not** require a key for them. The service is therefore accessible to other local processes. Its foreign-origin and host checks remain intact. Mari should call it from its server rather than directly from a foreign browser origin, and should not forward arbitrary engine, host, filesystem or model-management input from clients.

- `GET /health`: HTTP 503 with `{status:"starting",step,label,version}` during startup; HTTP 200 with `{status:"ok",device:"cpu",version:"0.5.7"}` when ready.
- `GET /startup/progress`: startup stages.
- `GET /engines/tts`: active engine and `backends[]`; the Kitten row contains `preset_voices`, `default_voice`, supported languages, sample rate and actual availability.
- `GET /engines/kittentts/health`: package/configuration health. This alone is not evidence that a model can synthesize; the real speech tests below supplied that evidence.
- `POST /v1/audio/speech`: JSON, synchronous binary audio response. Use explicit `response_format:"wav"`; the default is MP3, which needs FFmpeg.

```json
{
  "model": "kittentts",
  "input": "Mari is ready.",
  "voice": "expr-voice-2-f",
  "response_format": "wav",
  "speed": 0.95,
  "language": "en"
}
```

The successful response is `audio/wav` (24 kHz, mono, PCM16). Maximum input on this route is 4096 characters. Short generation is synchronous, so there is no short-job polling endpoint. Kitten has eight fixed presets: `expr-voice-{2,3,4,5}-{m,f}`. Female presets are Bella `2-f`, Luna `3-f`, Rosie `4-f`, and Kiki `5-f`. VoiceStudio accepts the preset IDs above; do not assume friendly names will select a preset. Kitten has speed control but no voice design, cloning, emotion or acting-instruction support. The calm direction is a pacing/preset baseline for the user to assess, not a claim of an emotion-conditioned performance.

Alternative `POST /generate` uses multipart fields `text`, `engine=kittentts`, `preset_voice=expr-voice-2-f`, `language=en`, `speed=0.95`. It returns WAV and `X-Audio-Id`, `X-Audio-Path`, `X-Audio-Duration`, `X-Gen-Time`; saved audio is served by `GET /audio/<id>.wav`, with generation history at `GET /history`. `stream=true` uses NDJSON events. MCP is mounted at `/mcp/`, but its `generate_speech` interface lacks explicit engine/preset selection, so REST is the useful integration here.

Model installation uses `POST /models/install` with JSON `{"repo_id":"KittenML/kitten-tts-mini-0.8","target":"local"}`; progress is `GET /models/install/status` (`jobs[]`) or SSE `GET /setup/download-stream?target=local`; `GET /models` reports installed models. The actual installation completed successfully.

## Model licence facts

The user explicitly authorized installing this model for personal use. No licence-acceptance POST was made. Live `GET /models/licenses/details/KittenML%2Fkitten-tts-mini-0.8` reports `license:"apache-2.0"`, `license_category:"commercial"`, `acceptance.required:false`, `state:"not_required"`, `history:[]`. A static inference that the registry's `review_status:"unreviewed"` implied an acceptance gate was incorrect; upstream's category function derives this category from the Apache identifier. The saved live disclosure is `/home/micxsz/.local/share/mari-ai/tools/voicestudio/kitten-model-terms.json`.

The same disclosure records incomplete component review and unknown output/voice-rights scope. Its category is upstream application behavior, not an independent guarantee of commercial clearance or rights over every output. Primary source: [Kitten model card at installed revision](https://huggingface.co/KittenML/kitten-tts-mini-0.8/blob/c02725660cea441db4c383af69f1f26f5cd00947/README.md).

For a different model where `acceptance.required` is true, retrieve current disclosure and fingerprint first, show its terms to the user, and only record their explicit acknowledgement with `POST /models/licenses/accept` and `{repo_id,fingerprint,accepted:true}`. Never fabricate acknowledgement or reuse another model's fingerprint.

## Verification evidence

- Actual `GET /health` returned HTTP 200, CPU, version `0.5.7`; Kitten engine health returned HTTP 200 and `ok:true`.
- VoiceStudio's own model download job reached completion at the pinned revision.
- Actual `POST /v1/audio/speech` returned HTTP 200 and 333,562-byte WAV for: “I am Mari. Systems are ready. Take your time. I am listening.”
- Preview: `/home/micxsz/.local/share/mari-ai/tools/voicestudio/mari-cold-calm-preview.wav`.
- WAV inspection: 6.948 seconds, mono, 24,000 Hz, 16-bit PCM, peak 0.7943, RMS 0.1001, no nonfinite samples and no clipped samples.
- A warm request for “Mari is ready.” completed in 1.606 seconds and returned 61,806 bytes.
- Restart through the persisted launcher passed health again; cached synthesis with `HF_HUB_OFFLINE=1` returned HTTP 200, `audio/wav`, 88,208 bytes in 3.558 seconds for “Local voice is ready.”
- AudioSeal is not installed in this minimal environment. Upstream's `mark_synthetic` call still runs, but its invisible neural watermark is unavailable. Label the preview/generated voice as synthetic; do not claim it carries an AudioSeal watermark.
- No subjective listening-quality or emotion-control claim is implied by the waveform checks.

SHA-256:

```text
482a436c4f1f3192153710376e459ff3689517ebcda7c2b051e2fd4187b41851  kittentts-0.8.1-py3-none-any.whl
0f5bbae4fc4800c98dbc544a87ecfa79510de2fb8222db30d12e5bfe9177df91  kitten_tts_mini_v0_8.onnx
322ba436c0d809102cdcebc80e8adf67656e7f5e7fe58fa6fcb758f2db899a6a  mari-cold-calm-preview.wav
```

Relevant upstream source: [Kitten engine](https://github.com/debpalash/VoiceStudio/blob/3a236a595c4a201ca81052523daa729fc8de4ba5/backend/services/tts_backend.py#L2442), [speech endpoint](https://github.com/debpalash/VoiceStudio/blob/3a236a595c4a201ca81052523daa729fc8de4ba5/backend/api/routers/openai_compat.py), [licence category](https://github.com/debpalash/VoiceStudio/blob/3a236a595c4a201ca81052523daa729fc8de4ba5/backend/services/model_licenses.py#L155), [loopback authentication](https://github.com/debpalash/VoiceStudio/blob/3a236a595c4a201ca81052523daa729fc8de4ba5/backend/core/auth.py#L477), [Linux install](https://github.com/debpalash/VoiceStudio/blob/3a236a595c4a201ca81052523daa729fc8de4ba5/docs/install/linux.md).
