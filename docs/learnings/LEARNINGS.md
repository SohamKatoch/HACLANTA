# Project learnings — drowsiness / cognitive monitor

## Architecture (agreed stack)

- **Next.js (`web/`)**: `getUserMedia` webcam, canvas sampling, lightweight proxies for eye closure / head tilt / blink rate, reaction-time cue. POSTs JSON to `/api/analyze`; the route proxies to Flask (`FLASK_API_URL`).
- **Flask (`api/`)**: `POST /analyze` accepts `eye_closure`, `blink_rate`, `head_tilt`, `reaction_time`, optional `user_id`. Returns `status` (`SAFE` | `NOT SAFE`), `confidence`, optional `score` (heuristic path), and echoed `features`.
- **Supabase**: Stores **numeric features only** (no images). Tables: `feature_log` (per analysis), `reaction_tests` (optional per reaction event), `user_data` (optional anonymous profile).
- **ML**: Optional `drowsiness_model.pkl` from `train_model.py`. Inference uses **normalized** feature vectors; training must apply the **same** normalization (see `api/feature_normalize.py`).

## Feature normalization (inference and training)

| Input | Meaning | Normalization to \([0,1]\) |
|-------|---------|----------------------------|
| `eye_closure` | Client estimate (higher ≈ more closed) | clip to \([0,1]\) |
| `blink_rate` | Blinks in last 60s window | `min(blink_rate / 30, 1)` |
| `head_tilt` | Client proxy (asymmetry) | clip to \([0,1]\) |
| `reaction_time` | Seconds to click cue | `min(reaction_time / 1.5, 1)` |

Heuristic score (no model):  
`0.4 * eye + 0.2 * blink + 0.2 * head + 0.2 * reaction_norm` → if `> 0.5` then `NOT SAFE`.

## Retraining workflow (outline)

1. Export labeled rows from `feature_log` (or a curated table) to CSV with columns matching training script expectations.
2. Run `python train_model.py` from `api/` (see script for paths).
3. Set `MODEL_PATH` in `.env` and restart Flask.

## Privacy

- Do not persist video frames or base64 images; only scalars and timestamps.
- `user_id` can be a random browser-generated ID (no PII required).

## Optional next steps

- **MediaPipe / OpenCV.js** in the browser for real landmarks (replace luminance heuristics).
- **Server-side OpenCV + MediaPipe** for richer features and a second `/analyze_video` path (heavier ops).
- **Supabase RLS**: enable row policies before production keys hit the client.
