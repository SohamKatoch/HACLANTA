# DONT- Drive Or Not

DONT- Drive Or Not is a driver-readiness demo that helps a user check whether they look safe to drive based on webcam-derived signals like eye closure, blink rate, head tilt, and reaction time. It also includes an insurance-facing dashboard that turns those readings into a simple risk view for alerts, monitoring, and demo decision-making.

The app includes:

- a driver-facing monitor at `/monitor`
- an insurance dashboard at `/admin`
- a Next.js frontend in `dont_drive_or_not/`
- a Flask backend in `api/`

This README is focused on how to install and run the app.

## Prerequisites

- Node.js 20+ or 22+
- npm
- Python 3.10+

## Install The Frontend

```powershell
cd dont_drive_or_not
npm install
```

## Run The Frontend

```powershell
cd dont_drive_or_not
npm run dev
```

Then open `http://localhost:3000`.

If you only want the UI demo, this is enough. The frontend can still run without Flask and will fall back to built-in scoring.

## Optional Frontend Environment

Create `dont_drive_or_not/.env.local` if you want extra integrations:

```env
FLASK_API_URL=http://127.0.0.1:5000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

Notes:

- `FLASK_API_URL` lets Next.js proxy analysis/history/admin requests to Flask
- if `FLASK_API_URL` is missing, the app still works with local fallback scoring
- `GEMINI_API_KEY` is only for the score commentary box

## Install The Backend

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run The Backend

```powershell
cd api
.venv\Scripts\Activate.ps1
python app.py
```

The Flask backend runs at `http://127.0.0.1:5000`.

## Optional Backend Environment

Create `api/.env` if you want Supabase-backed history and dashboard data:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SUPABASE_TABLE=feature_log
SUPABASE_REACTION_TABLE=reaction_tests
SUPABASE_USERS_TABLE=user_data
MODEL_PATH=
```

If these are not set, the backend still runs, but Supabase-backed features will be limited.

## App Routes

- `/` landing page
- `/signup` demo account creation
- `/login` demo login
- `/monitor` driver monitor
- `/admin` insurance dashboard

Admin demo credentials:

- username: `admin`
- password: `1234`

## Project Structure

```text
api/                  Flask backend
docs/                 architecture and demo docs
dont_drive_or_not/    Next.js frontend
supabase/             SQL schema
```

## More Docs

- [Architecture overview](docs/ARCHITECTURE_OVERVIEW.md)
- [Demo script](docs/DEMO_SCRIPT.md)
