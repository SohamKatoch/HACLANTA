# Drive Awake Monitor

Starter app for browser-based drowsiness screening with:

- a Next.js frontend that captures webcam input and computes lightweight heuristic features
- shadcn-style UI primitives for the monitoring dashboard
- a stable `POST /api/analyze` endpoint in Next.js
- a separate Flask service stub that another teammate can later upgrade to a real AI/ML model

This version does not include a trained model. It uses threshold scoring so the app works immediately while keeping the backend contract stable.

## What It Does

- Captures webcam video with `getUserMedia()`
- Extracts lightweight browser-side features on a timer
- Tracks eye closure proxy
- Tracks blink rate
- Tracks head tilt proxy
- Tracks reaction time via a visual cue
- Sends features to `POST /api/analyze`
- Proxies to Flask when `FLASK_API_URL` is configured
- Falls back to local threshold scoring if the Flask service is unavailable

## Project Structure

```text
app/
  api/analyze/route.ts    Next.js analysis endpoint / Flask proxy
  page.tsx                Entry page
components/
  drowsiness-monitor.tsx  Live webcam dashboard
  ui/                     shadcn-style reusable primitives
lib/
  drowsiness.ts           Shared scoring contract and types
  utils.ts                shadcn class helper
backend/
  app.py                  Flask threshold stub
  requirements.txt
components.json           shadcn configuration
```

## Run The Frontend

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run The Flask Stub

Create a Python environment, then install the backend dependencies:

```bash
pip install -r backend/requirements.txt
python backend/app.py
```

The Flask service runs on `http://127.0.0.1:5000`.

## Connect Next.js To Flask

Create `.env.local` from `.env.example`:

```bash
FLASK_API_URL=http://127.0.0.1:5000
```

With that set, the frontend still calls `/api/analyze`, and Next.js forwards the request to Flask. If Flask is offline, the route falls back to built-in threshold logic.

## Payload Contract

The frontend sends:

```json
{
  "eye_closure": 0.37,
  "blink_rate": 12.4,
  "head_tilt": 8.1,
  "reaction_time": 0.52,
  "session_id": "session-abc123",
  "captured_at": "2026-03-28T15:00:00.000Z",
  "feature_source": "browser-heuristic-v1"
}
```

The analyzer returns:

```json
{
  "status": "SAFE",
  "confidence": 0.76,
  "score": 0.24,
  "provider": "python-threshold-stub",
  "weights": {
    "eye_closure": 0.4,
    "blink_rate": 0.2,
    "head_tilt": 0.2,
    "reaction_time": 0.2
  },
  "normalized_features": {
    "eye_closure": 0.37,
    "blink_rate": 0.39,
    "head_tilt": 0.32,
    "reaction_time": 0.37
  },
  "reasons": [
    "Recent measurements remain inside the starter safety band."
  ]
}
```

## Handoff For The AI/ML Model

When the model work lands later, the cleanest swap point is `backend/app.py`:

1. Load the trained model at startup.
2. Convert the incoming payload into the model feature vector.
3. Replace `analyze_features(payload)` with model inference.
4. Keep the response shape stable so the frontend does not need to change.

Possible future upgrades:

- replace heuristics with MediaPipe / OpenCV.js / TF.js facial landmarks
- move feature persistence into Supabase
- add session history and reaction test logging
- retrain a classifier from historical numeric feature data only

## Privacy

This starter is designed around feature-only storage:

- no raw frames are saved
- webcam analysis runs in the browser
- only numeric features need to be sent or stored
