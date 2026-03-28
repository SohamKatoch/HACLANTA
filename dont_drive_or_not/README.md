# Drive Awake Monitor

Starter app for browser-based drowsiness screening with:

- a Next.js frontend that captures webcam input and runs **MediaPipe Face Landmarker** (when the model loads) for **face landmarks**, **Eye Aspect Ratio (EAR)**, **blink** timing, and **head tilt** from eye-corner geometry
- a **canvas heuristic fallback** if the model fails to load or the user denies GPU/WASM
- shadcn-style UI primitives for the monitoring dashboard
- a stable `POST /api/analyze` endpoint in Next.js
- a separate Flask service stub that another teammate can later upgrade to a real AI/ML model

The webcam still uses the browser **Media Capture API** (`getUserMedia`). **OpenCV.js** is not bundled here (large payload); server-side **Python + OpenCV** could process frames later if you move capture off the client.

This version does not include a trained model. It uses threshold scoring so the app works immediately while keeping the backend contract stable.

## What It Does

- Captures webcam video with `getUserMedia()`
- Runs **MediaPipe** `FaceLandmarker` in **VIDEO** mode (WASM + model from CDN) when available
- Derives **eye closure** from EAR vs a short per-session calibration
- Counts **blinks** (closed→open cycles) over a rolling 60s window
- Estimates **head tilt** (degrees) from outer eye-corner alignment
- Tracks **reaction time** via a visual cue (unchanged)
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
  face-vision.ts          MediaPipe init, EAR, head tilt helpers
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

## Run With Docker

If you want to run the Next.js app in a container, use these two commands inside `dont_drive_or_not/`:

```bash
docker build -t drive-awake-monitor .
docker run --rm -p 3000:3000 drive-awake-monitor
```

Then open `http://localhost:3000`.

### If You Also Want The Flask API

If your Flask backend is running on your computer, pass `FLASK_API_URL` when starting the container:

```bash
docker run --rm -p 3000:3000 -e FLASK_API_URL=http://host.docker.internal:5000 drive-awake-monitor
```

Use `host.docker.internal` so the container can reach the Flask server running on your machine.

### What These Commands Do

- `docker build -t drive-awake-monitor .` creates the image
- `docker run --rm -p 3000:3000 ...` starts the app on port `3000`
- `--rm` removes the container after you stop it
- `-e FLASK_API_URL=...` is only needed when you want Next.js to forward requests to Flask

If you skip `FLASK_API_URL`, the app still runs and uses the built-in fallback scoring logic.

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
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

With that set, the frontend still calls `/api/analyze`, and Next.js forwards the request to Flask. If Flask is offline, the route falls back to built-in threshold logic.

If you want the small AI commentary box above the monitor to use Gemini, put your free-tier key in `dont_drive_or_not/.env.local` as `GEMINI_API_KEY`. If you skip it, the app falls back to built-in local commentary instead of making external model calls.

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
  "feature_source": "mediapipe-ear-v1"
}
```

`feature_source` is `mediapipe-ear-v1` when MediaPipe is active, or `browser-heuristic-v1` when the canvas fallback is used.

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
