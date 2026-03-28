# Architecture And ML Flow

## What The System Is

Drive Awake is a two-sided demo application:

- a driver-facing monitoring app
- an insurance-facing risk dashboard

The goal is to capture driver-readiness signals, convert them into a simple risk score, store the results, and present them in a form that both the driver and the insurer can act on.

## High-Level Architecture

```text
Browser Camera
  ->
Next.js Frontend
  ->
Next.js API Routes
  ->
Flask Backend
  ->
Supabase
```

There are two primary UI surfaces:

- `driver monitor`
- `insurance dashboard`

## Frontend

The frontend lives in `dont_drive_or_not/` and is built with:

- Next.js
- React
- TypeScript

Main routes:

- `/`
  - landing page
- `/signup`
  - local demo account creation
- `/login`
  - local demo login
- `/monitor`
  - driver monitoring experience
- `/admin`
  - insurance dashboard

### What The Driver Monitor Does

The driver monitor:

1. opens the webcam in the browser
2. calibrates a short user-specific baseline
3. tracks eye closure, blink rate, head tilt, and reaction time
4. sends numeric features to `/api/analyze`
5. receives a score, confidence, status, and reasons
6. stores and renders recent history

### What The Insurance Dashboard Does

The insurance dashboard:

1. fetches aggregated user/history data from the backend
2. merges that backend data with local dashboard settings
3. displays users, alerts, metrics, and thresholds
4. allows alert review and dangerous-driving notifications

## Next.js API Layer

The frontend does not call Flask directly from UI components.

Instead it uses Next.js route handlers:

- `/api/analyze`
  - proxies scoring requests to Flask if `FLASK_API_URL` exists
  - otherwise falls back to local threshold scoring
- `/api/history`
  - proxies user history requests to Flask
- `/api/admin-overview`
  - proxies insurance dashboard overview requests to Flask
- `/api/score-commentary`
  - generates the top commentary text

This middle layer makes the frontend easier to run locally and easier to adapt for deployment.

## Flask Backend

The Flask backend lives in `api/`.

It does three core things:

1. receives feature payloads
2. computes a risk score
3. optionally writes and reads data from Supabase

Primary endpoints:

- `/analyze`
  - score one set of driver features
- `/history`
  - return historical captures for one user
- `/admin/overview`
  - return insurance-dashboard user + history data

## Supabase

Supabase is the persistence layer for demo history.

Current tables:

- `user_data`
- `feature_log`
- `reaction_tests`

What gets stored:

- user identifiers and metadata
- numeric feature readings
- reaction-time events
- status, confidence, and score

What does not get stored by default:

- raw image frames
- full video recordings

## ML And Scoring Flow

The current system uses a starter scoring pipeline with two possible backend paths.

### Path 1: Heuristic Threshold Scoring

This is the default if no trained model is configured.

The backend receives:

- `eye_closure`
- `blink_rate`
- `head_tilt`
- `reaction_time`

It normalizes those values into a shared risk scale and computes a weighted score.

Current weighting:

- eye closure: `0.4`
- blink rate: `0.2`
- head tilt: `0.2`
- reaction time: `0.2`

Then it applies a threshold:

- `score >= 0.5` -> `NOT SAFE`
- otherwise -> `SAFE`

This gives:

- `status`
- `confidence`
- `score`
- `reasons`

### Path 2: Optional ML Model

If `MODEL_PATH` is configured in the backend, Flask can load a trained model.

The intended ML flow is:

1. read the same numeric features
2. convert them into the model feature row
3. run inference
4. produce a risk probability or prediction
5. map that into the same response contract

That means the frontend does not need to change when you swap the heuristic scorer for a trained model.

## Why The ML Design Matters

The important design decision is that the frontend and backend communicate through a stable numeric contract.

That gives you:

- a working demo immediately
- a simple fallback path if the model is unavailable
- an easy upgrade path to a real classifier later

## Current Demo Limitations

- some insurance-dashboard controls are still local-demo behavior
- admin auth is demo-only, not production auth
- seeded metadata may be incomplete unless `email` and `vehicle_vin` exist in Supabase
- the current scoring system is a starter baseline, not a clinically validated impairment model

## Production Direction

A production version would likely add:

- real auth and role-based access control
- stronger backend validation
- fuller insurance metadata
- server-side notification delivery
- a trained model with evaluated metrics
- clearer audit trails for dashboard actions
