# Drive Awake / Insurance Risk Demo

This project is a browser-based driver readiness and risk-monitoring demo for live presentations.

It includes:

- `dont_drive_or_not/`: Next.js frontend for landing, auth, driver monitor, and insurance dashboard
- `api/`: Flask backend for scoring, history, and Supabase-backed overview data
- `supabase/schema.sql`: schema for demo storage
- `docs/`: supporting notes and demo materials

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind-style utility classes, shadcn-style components
- Vision layer: browser webcam + MediaPipe Face Landmarker with heuristic fallback
- Backend: Flask + Python scoring service
- Data: Supabase for seeded/demo history and backend reads

## Quick Start With Docker

Run the frontend in Docker:

```powershell
cd dont_drive_or_not
docker build -t drive-awake-monitor .
docker run --rm -p 3000:3000 drive-awake-monitor
```

Open `http://localhost:3000`.

If you also want the Dockerized frontend to call the local Flask backend:

```powershell
docker run --rm -p 3000:3000 -e FLASK_API_URL=http://host.docker.internal:5000 drive-awake-monitor
```

## Quick Start Without Docker

Start the backend:

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python app.py
```

Start the frontend in a second terminal:

```powershell
cd dont_drive_or_not
npm install
npm run dev
```

Open `http://localhost:3000`.

## Required Environment Setup

Backend environment lives in `api/.env`.

Important variables:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_TABLE`
- `SUPABASE_REACTION_TABLE`
- `SUPABASE_USERS_TABLE`

Frontend environment lives in `dont_drive_or_not/.env.local`.

Important variable:

- `FLASK_API_URL=http://127.0.0.1:5000`

Notes:

- `.env` and `.env.local` are intentionally ignored by git
- if you deploy this project, these values must be added in the deployment platform settings
- if `FLASK_API_URL` is missing, the frontend falls back to local threshold scoring
- if Supabase keys are missing in `api/.env`, Supabase-backed history and insurance dashboard data will not load

## Using The App

### Driver Flow

1. Open `http://localhost:3000/signup`
2. Create a demo driver account
3. Log in at `http://localhost:3000/login`
4. Open `http://localhost:3000/monitor`
5. Allow camera access
6. Start monitoring and capture readings
7. Review the confidence history and graph

### Insurance Dashboard

Open `http://localhost:3000/admin`

Credentials:

- username: `admin`
- password: `1234`

What the dashboard does:

- shows the insurance dashboard summary cards
- reads driver/history data from the backend when `FLASK_API_URL` and Supabase are configured
- merges that with local admin-side settings like thresholds and alert flags
- lets you add/edit users, set thresholds, and flag alerts
- lets you send a dangerous-driving notification to a selected driver
- shows a snarky summary panel for demo effect

Important limitation:

- the current Supabase schema does not store full email and VIN metadata for seeded users, so some seeded records may show placeholder email or blank VIN unless you map them locally or extend the schema

## Supabase Demo Data

Run [supabase/schema.sql](supabase/schema.sql) first in Supabase, then use your demo seed SQL in the Supabase SQL editor.

Once seeded, the data will appear in the insurance dashboard only when:

1. Flask is running
2. `api/.env` contains valid Supabase credentials
3. `dont_drive_or_not/.env.local` contains a valid `FLASK_API_URL`

## Project Map

```text
api/                  Flask backend and scoring service
docs/                 notes and demo materials
dont_drive_or_not/    frontend app
supabase/             SQL schema
```

## Demo Script

Use [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a presentation talk track covering the framework, code architecture, and live walkthrough.

## Architecture Notes

Use [docs/ARCHITECTURE_OVERVIEW.md](docs/ARCHITECTURE_OVERVIEW.md) for a fuller explanation of the end-to-end architecture, backend flow, and ML/scoring design.
