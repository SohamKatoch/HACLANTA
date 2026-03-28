# Driver Safety Monitor Scaffold

This repo now has:

- `dont_drive_or_not/`: Next.js frontend (landing page, login page, live monitor, POST to `/api/analyze`)
- `api/`: Flask backend (`/analyze` scoring endpoint, optional ML model, optional Supabase logging)
- `supabase/schema.sql`: `user_data`, `feature_log`, `reaction_tests` (numeric data only)
- `docs/learnings/`: architecture notes (`LEARNINGS.md`) and pitfalls (`MISTAKES.md`)

## Quick Start With Docker

Use this if you want to run the app with the frontend inside a container.

```powershell
cd dont_drive_or_not
docker build -t drive-awake-monitor .
docker run --rm -p 3000:3000 drive-awake-monitor
```

Then open `http://localhost:3000` and allow camera access in the browser.

If you also want the containerized frontend to call the Flask API running on your machine:

```powershell
docker run --rm -p 3000:3000 -e FLASK_API_URL=http://host.docker.internal:5000 drive-awake-monitor
```

## Quick Start Without Docker

If you want to run everything locally without Docker:

1. Start the Flask API.
2. Start the Next.js frontend.
3. Open `http://localhost:3000`.

### Flask API

**Linux / macOS**

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

**Windows (PowerShell)**

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Flask runs at `http://127.0.0.1:5000`.
If you want Supabase logging, set `SUPABASE_URL` and your server-side `SUPABASE_KEY` in `api/.env`.

### Next.js Frontend

**Linux / macOS**

```bash
cd dont_drive_or_not
npm install
npm run dev
```

**Windows**

```powershell
cd dont_drive_or_not
npm install
npm run dev
```

Next runs at `http://localhost:3000`.

The frontend calls `fetch('/api/analyze')`, and the Next route in `dont_drive_or_not/app/api/analyze/route.ts` can proxy to `FLASK_API_URL`.

## Detailed Local Setup

### 1) Run Flask API

**Linux / macOS**

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

**Windows (PowerShell)**

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Flask runs at `http://127.0.0.1:5000`.
If you want Supabase logging, set `SUPABASE_URL` and your server-side `SUPABASE_KEY` in `api/.env`.

### 2) Run Next.js frontend

**Linux / macOS**

```bash
cd dont_drive_or_not
npm install
npm run dev
```

**Windows**

```powershell
cd dont_drive_or_not
npm install
npm run dev
```

Next runs at `http://localhost:3000`.

The frontend calls `fetch('/api/analyze')`, and the Next route in `dont_drive_or_not/app/api/analyze/route.ts` can proxy to `FLASK_API_URL`.

## Supabase SQL

Run `supabase/schema.sql` in the Supabase SQL editor before turning on logging from Flask.
Even with hosted Supabase, this file should stay in the repo because it is the source of truth for recreating the cloud tables in a new project or environment.

## Auth status

The current `/login` flow is still a browser-local placeholder session for the monitor UI.
Supabase is being used for server-side data storage here, not for Supabase Auth yet.

## API contract

Request body:

```json
{
  "eye_closure": 0.42,
  "blink_rate": 18,
  "head_tilt": 0.12,
  "reaction_time": 0.85,
  "user_id": "optional-anonymous-id",
  "log_reaction_event": false
}
```

Set `log_reaction_event` to `true` to insert a row into Supabase `reaction_tests` (when configured). The UI exposes this as an optional checkbox.

Response example:

```json
{
  "status": "SAFE",
  "confidence": 0.71,
  "score": 0.29,
  "features": {
    "eye_closure": 0.42,
    "blink_rate": 18.0,
    "head_tilt": 0.12,
    "reaction_time": 0.85
  }
}
```

## Optional ML model training

If you have historical labeled data:

```powershell
cd api
python train_model.py
```

This writes `drowsiness_model.pkl`. Set `MODEL_PATH` in `api/.env` to use it.
