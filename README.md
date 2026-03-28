# Driver Safety Monitor Scaffold

This repo now has:

- `web/`: Next.js frontend (webcam capture, lightweight feature extraction, reaction test, POST to `/api/analyze`)
- `api/`: Flask backend (`/analyze` scoring endpoint, optional ML model, optional Supabase logging)
- `supabase/schema.sql`: `user_data`, `feature_log`, `reaction_tests` (numeric data only)
- `docs/learnings/`: architecture notes (`LEARNINGS.md`) and pitfalls (`MISTAKES.md`)

## 1) Run Flask API

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

## 2) Run Next.js frontend

**Linux / macOS**

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev
```

**Windows**

```powershell
cd web
npm install
copy .env.local.example .env.local
npm run dev
```

Next runs at `http://localhost:3000`.

The frontend calls `fetch('/api/analyze')`, and the Next API route proxies to `FLASK_API_URL`.

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
