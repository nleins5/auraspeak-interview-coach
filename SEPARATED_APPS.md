# Separated Voice Function Apps

This repo now supports four separately deployable AI function + web apps.

Each app uses the same shared backend infrastructure, but the frontend is built with one fixed function and the backend exposes a fixed endpoint for that function.

## Apps

| App | Frontend build script | Backend endpoint | Vercel config |
| --- | --- | --- | --- |
| AI Feedback | `npm run build:feedback` | `POST /v1/chat/feedback` | `deploy/feedback.vercel.json` |
| Job Interview | `npm run build:interview` | `POST /v1/chat/interview` | `deploy/interview.vercel.json` |
| Presentation | `npm run build:presentation` | `POST /v1/chat/presentation` | `deploy/presentation.vercel.json` |
| English Speaking | `npm run build:english` | `POST /v1/chat/english` | `deploy/english.vercel.json` |
| Social EQ | `npm run build:social` | `POST /v1/chat/social` | `deploy/social.vercel.json` |

## Social EQ Demo Rules

The Social EQ app currently ships with a featured Vietnamese scenario: `Đòi nợ bạn thân`.

- The roleplay is capped at 10 dialogue messages.
- The user gets 3 free practice sessions per day.
- Hints cost 1 coin and are revealed only after purchase.
- The AI evaluates each move using Daniel Goleman's 5 EQ components: self-awareness, self-regulation, motivation, empathy, and social skills.
- The Capybara mascot exposes `isThinking` and `isTalking` animation states for AI processing and AI replies.

The old endpoint still works:

```bash
POST /v1/chat/unified
```

## Local Development

Run the backend:

```bash
npm run dev:voice
```

Run one fixed web app with Vite:

```bash
cd ui
VITE_APP_FUNCTION=feedback npm run dev
VITE_APP_FUNCTION=interview npm run dev
VITE_APP_FUNCTION=presentation npm run dev
VITE_APP_FUNCTION=english npm run dev
VITE_APP_FUNCTION=social npm run dev
```

If `VITE_APP_FUNCTION` is not set, the web app shows all four modes in one UI for development.

## Separate Vercel Deploys

Create four Vercel projects from this same repo and use one config per project:

```bash
vercel --prod --local-config deploy/feedback.vercel.json
vercel --prod --local-config deploy/interview.vercel.json
vercel --prod --local-config deploy/presentation.vercel.json
vercel --prod --local-config deploy/english.vercel.json
vercel --prod --local-config deploy/social.vercel.json
```

Set the same provider environment variables on each Vercel project, depending on what the app needs:

```bash
GROQ_API_KEY=...
NVIDIA_API_KEY_CUSTOM=...
NVIDIA_MODEL_CUSTOM=meta/llama-3.3-70b-instruct
CLOUDFLARE_API_KEY=...
CLOUDFLARE_ACCOUNT_ID=...
DISABLE_DATABASE=1
ROUTING_MODE=chain
REQUEST_TIMEOUT_S=8
MAX_RETRIES_PER_PROVIDER=0
```

Use at least one speech-to-text provider for recording/upload flows and at least one chat provider for AI feedback.
