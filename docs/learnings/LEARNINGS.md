# Project Learnings - Drowsiness / Cognitive Monitor

## Architecture

- **Next.js (`dont_drive_or_not/`)**: `getUserMedia` webcam capture, browser-side feature extraction, and proxy routes for Flask.
- **Flask (`api/`)**: `POST /analyze` accepts `eye_closure`, `blink_rate`, `head_tilt`, `reaction_time`, and optional user metadata. It returns `status`, `confidence`, `score`, `normalized_features`, and `reasons`.
- **Supabase**: Stores numeric features only. No images or raw frames are persisted.
- **ML**: Optional `drowsiness_model.pkl` from `train_model.py`. Inference must use the same normalization path as heuristic scoring.

## Feature Normalization

| Input | Meaning | Normalization to `[0,1]` |
|-------|---------|---------------------------|
| `eye_closure` | Client estimate, higher means more closed | `clip(eye_closure, 0, 1)` |
| `blink_rate` | Blinks in the last 60 seconds | `min(blink_rate / 32, 1)` |
| `head_tilt` | Tilt in degrees | `min(head_tilt / 25, 1)` |
| `reaction_time` | Seconds to click the cue | `min(reaction_time / 1.4, 1)` |

Heuristic score:

`0.4 * eye + 0.2 * blink + 0.2 * head + 0.2 * reaction`

If `score >= 0.5`, the starter classifier returns `NOT SAFE`.

## Scoring Baseline Note

- See `docs/learnings/SCORING_BASELINE.md` for the detailed baseline and weighting explanation.
- That note covers:
  - per-session calibration
  - normalization constants
  - heuristic weights
  - a worked numeric example

## Retraining Workflow

1. Export labeled rows from `feature_log` or a curated table to CSV.
2. Run `python train_model.py` from `api/`.
3. Set `MODEL_PATH` in `.env` and restart Flask.

## Privacy

- Do not persist video frames or base64 images.
- Store only numeric features, timestamps, and optional anonymous IDs.
- `user_id` can be a browser-generated identifier rather than PII.

## Route Flow

- `/` is the landing page
- `/login` is the lightweight sign-in page
- `/monitor` is the live monitor route

The live monitor stays in `dont_drive_or_not/components/drowsiness-monitor.tsx`.

## Auth Placeholder

- The current `/login` flow is only a UX placeholder.
- Session state is stored locally in the browser through `dont_drive_or_not/lib/session.ts`.
- `/monitor` redirects to `/login` when no local session exists.
- This should be replaced with real auth before production.

## Why Flask Still Exists

- Holds server-only Supabase secrets
- Owns analysis orchestration
- Supports future ML inference
- Leaves room for heavier Python/OpenCV processing later

## Frontend Consolidation

- The old separate `web/` frontend was removed.
- The active product flow now lives entirely inside `dont_drive_or_not/`.
