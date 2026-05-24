# Antigravity Handoff: Voice Coach

This project is currently wrapped as a voice-coach frontend plus FastAPI backend.

Primary app:
- `http://localhost:8000/playground`
- Screen: `ui/src/pages/VoiceCoach.jsx`
- Backend routes:
  - `POST /v1/audio/transcriptions`
  - `POST /v1/chat/unified`

## What Works

- Simple standalone Voice Coach UI, separate from the old Aether/Gateway chat UI.
- Two modes:
  - `Phỏng vấn`
  - `English Speaking`
- Voice flow:
  - record or upload audio
  - speech-to-text
  - transcript shown in UI
  - AI feedback using the configured task prompt
- STT fallback:
  - Groq Whisper if `GROQ_API_KEY` is valid
  - Cloudflare Workers AI Whisper if Cloudflare keys are configured
- AI scoring prompt lives in `app/core/prompts.py`.
- Voice-specific provider routing lives in `providers.json` under `interview` and `english`.

## Quick Start In Antigravity

```bash
cp .env.example .env
npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm run build:ui
./scripts/start-voice-backend.sh
```

Open:

```text
http://localhost:8000/playground
```

## Required Env For Real Voice

Use at least one STT provider:

```bash
GROQ_API_KEY=...
```

or:

```bash
CLOUDFLARE_API_KEY=...
CLOUDFLARE_ACCOUNT_ID=...
```

Use at least one chat/scoring provider. Smoke-tested:

```bash
NVIDIA_API_KEY_CUSTOM=...
NVIDIA_MODEL_CUSTOM=meta/llama-3.3-70b-instruct
```

For voice-only local work, keep:

```bash
DISABLE_DATABASE=1
GATEWAY_SECRET=
ROUTING_MODE=chain
REQUEST_TIMEOUT_S=8
MAX_RETRIES_PER_PROVIDER=0
```

## Smoke Tests

Health:

```bash
curl -s http://localhost:8000/health
```

AI scoring:

```bash
curl -s -X POST http://localhost:8000/v1/chat/unified \
  -H 'Content-Type: application/json' \
  --data '{"query":"I wake up at seven and I go to work by bus.","task":"english","user_id":"smoke_test","history":[]}'
```

STT with a local audio file:

```bash
curl -s -X POST http://localhost:8000/v1/audio/transcriptions \
  -F 'language=en' \
  -F 'file=@/path/to/audio.wav'
```

On macOS you can create a quick audio sample:

```bash
say -o /tmp/voice-coach-test.aiff 'I wake up at seven and I go to work by bus.'
curl -s -X POST http://localhost:8000/v1/audio/transcriptions \
  -F 'language=en' \
  -F 'file=@/tmp/voice-coach-test.aiff'
```

## Microphone Note

If the record button does not start recording, it is usually browser permission.

On macOS:

```text
System Settings -> Privacy & Security -> Microphone
```

Allow the browser or Antigravity/Codex app, then refresh `/playground`.

The UI also supports `Tải file audio`, which bypasses browser mic permission and still tests the real STT + AI flow.

## Files To Care About

- `ui/src/pages/VoiceCoach.jsx`: standalone voice frontend
- `app/api/v1/audio.py`: STT endpoint with Groq -> Cloudflare fallback
- `app/api/v1/chat.py`: unified chat endpoint and task prompt injection
- `app/core/prompts.py`: Interview and English coach prompts
- `providers.json`: routing for `interview` and `english`
- `scripts/start-voice-backend.sh`: local voice backend runner
- `.env.example`: safe env template

## Do Not Copy Secrets Blindly

`env_for_boss.txt`, `.env`, and `.env.vercel` are intentionally ignored by `.gitignore`.
Use `.env.example` as the template and paste only the keys you actually want to use in Antigravity.
