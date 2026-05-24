# Voice Coach & AI Gateway

A powerful, high-fidelity AI-powered Voice Coach and Multi-Provider AI Routing Gateway. This project provides real-time spoken English training and mock interview evaluations by transcribing speech and utilizing state-of-the-art LLMs to analyze content quality, fluency, pronunciation, grammar, vocabulary, and delivery metrics.

---

## 🌟 Key Features

- **Voice Recording & Audio Processing:** Built-in web audio recorder with support for uploading raw audio files.
- **Detailed Speech Metrics:** Analyzes pauses, speech speed, hesitations, and repeated words.
- **Dual Training Modes:**
  - **Interview Coach (Phỏng vấn):** Simulates a high-standard senior recruiter evaluation, providing a mock hiring recommendation and overall score.
  - **English Coach (English Speaking):** Acts as an elite IELTS/CEFR examiner focusing on natural vocabulary, structural transitions, and grammar corrections.
- **Brutally Honest AI Feedback:** Point-by-point diagnostic scoring across 6 key metrics, providing strengths, specific weaknesses, and a perfect native rewrite of the student's answer.
- **Resilient AI Routing & Failover:** Powered by an underlying AI gateway structure featuring robust multi-provider API routing, automatic fallback, and retries.

---

## 🛠️ Technology Stack

- **Frontend:** React 18, Vite, Tailwind CSS v3, Lucide Icons, and Web Audio API.
- **Backend:** FastAPI (Python 3.11+), Uvicorn, Pydantic, HTTPX, and OpenAI SDK.
- **Deployment:** Zero-config Vercel deployment using Serverless Functions (`api/index.py` handles backend routing via `vercel.json` rewrites).

---

## 📂 Project Structure

```text
├── app/                  # FastAPI backend source code
│   ├── api/              # API router endpoints
│   ├── core/             # AI Prompts & configuration
│   └── main.py           # FastAPI entry point
├── api/
│   └── index.py          # Vercel Serverless Function entry point
├── ui/                   # Vite + React Frontend
│   ├── dist/             # Production build output
│   ├── src/              # React components & UI pages
│   └── package.json
├── package.json          # Root scripts for build/run management
└── vercel.json           # Vercel deployment configuration
```

---

## ⚡ Quick Start & Development

### 1. Prerequisite Configuration (`.env`)

Create a `.env` file in the root directory (or use `.env.local` for local development):

```env
# Cloudflare (Used for AI Gateway/Workers)
CLOUDFLARE_ACCOUNT_ID="your_cloudflare_account_id"
CLOUDFLARE_API_KEY="your_cloudflare_api_key"

# AI Provider API Keys
GROQ_API_KEY="your_groq_api_key"
NVIDIA_API_KEY="your_nvidia_api_key"

# Frontend-Backend Protection Key
VITE_GATEWAY_KEY="voice_function_secret_key"

# Environment Settings
DISABLE_DATABASE="1"
NODE_VERSION="22.11.0"
PYTHON_VERSION="3.11.0"
```

### 2. Local Setup & Run

The project uses `npm` workspaces to manage both frontend and backend tasks.

#### Option A: Quickstart via Root Scripts
Install Node.js dependencies and start the backend/frontend together:

```bash
# Install dependencies
npm install

# Start the uvicorn development server
npm run dev:voice
```

The backend API will run on `http://localhost:8000`.

#### Option B: Standalone Manual Run

**Run Backend (Python):**
Ensure you have a Python virtual environment activated:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Run Frontend (Node):**
```bash
cd ui
npm install
npm run dev
```

---

## 🚀 Production Deployment

### Option A: Vercel (Serverless)

This repository is optimized for one-click deployment to **Vercel**:

1. Push this repository to GitHub.
2. Import the project into your Vercel Dashboard.
3. Configure the **Environment Variables** in Vercel to match your `.env` values (listed above).
4. Deploy! Vercel will automatically read `vercel.json`, build the React UI inside `ui/`, and set up the FastAPI serverless endpoint at `/api/index.py`.

### Option B: Render (Persistent Web Service with Docker)

We have pre-configured a high-performance **multi-stage Docker build** and a blueprint `render.yaml` for a zero-config deployment on Render. Using a Docker environment ensures that the React frontend is compiled cleanly using Node.js, and the FastAPI backend runs on Python, completely side-stepping runtime or dependency mismatch errors on Render.

#### Deploy via Blueprint (Easiest)
1. Push this repository to GitHub.
2. Go to **Render Dashboard** -> **Blueprints** -> **New Blueprint Instance**.
3. Select your repository. Render will automatically detect `render.yaml` and configure a **Docker Web Service** named `voice-function-api`.
4. Add your **Environment Variables** (API keys like `GROQ_API_KEY`, `NVIDIA_API_KEY`, etc.) in the Render UI.
5. Click **Deploy**.

#### Deploy Manually
If you want to configure the service manually on Render:
1. Click **New +** -> **Web Service** in your Render Dashboard.
2. Connect your GitHub repository.
3. Set **Runtime** to **Docker** (crucial!).
4. Keep the default Dockerfile settings (Render will auto-detect the root `Dockerfile`).
5. Add your environment variables under **Advanced**:
   - `DISABLE_DATABASE` = `1`
   - Plus your provider keys (e.g. `GROQ_API_KEY`, `NVIDIA_API_KEY`).
6. Click **Create Web Service**. Render will execute the multi-stage build, compile the React assets, mount them to the FastAPI server, and deploy the service.

---

## 🤝 Integration Guide for Boss

To integrate this Voice Coach engine into another existing project:

1. **API Integration:** The backend exposes a simple endpoint `/v1/chat/unified` that takes user transcriptions/metrics and evaluates them dynamically.
2. **Audio Transcription:** The `/v1/audio/transcriptions` endpoint handles direct file transcription and computes pause/hesitation metrics.
3. **Frontend Component:** The page `ui/src/pages/VoiceCoach.jsx` is highly modular and styled with Tailwind CSS, meaning it can easily be copied and integrated into any React/Next.js dashboard.

---

## 🧩 Separated Apps

This project can also be deployed as four independent function + web apps:

- AI Feedback: `POST /v1/chat/feedback`, `npm run build:feedback`
- Job Interview: `POST /v1/chat/interview`, `npm run build:interview`
- Presentation: `POST /v1/chat/presentation`, `npm run build:presentation`
- English Speaking: `POST /v1/chat/english`, `npm run build:english`
- Social EQ: `POST /v1/chat/social`, `npm run build:social` — mobile-first roleplay demo with the `Đòi nợ bạn thân` scenario, 10-message cap, paid hints, and Daniel Goleman EQ scoring.

See `SEPARATED_APPS.md` for the separate Vercel config files and deploy commands.
