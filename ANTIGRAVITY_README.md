# Interview Coach

Standalone source for the job interview voice coach.

## Run Locally

Backend:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npm run dev:backend
```

Frontend:

```bash
npm install
npm run dev:ui
```

Open:

```text
http://127.0.0.1:5172/
```

API:

```text
POST /v1/chat/interview
POST /v1/audio/transcriptions
```

## Deploy

```bash
vercel --prod
```
