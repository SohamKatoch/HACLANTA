# Scoring Baseline And How It Works

This note explains the current starter scoring system across the frontend and Flask backend.

## End-To-End Flow

1. The monitor collects live signals in the browser.
2. The browser calibrates a personal baseline before scoring the session.
3. The frontend sends numeric features to `POST /api/analyze`.
4. Flask normalizes those features into a common `0-1` risk scale.
5. Flask either:
   - runs the heuristic threshold scorer, or
   - runs an optional trained model if `MODEL_PATH` is configured.

## The Baseline

The frontend establishes a short per-session baseline before active monitoring begins.

- Calibration length: `18` frames
- Sample cadence: every `450 ms`
- Approximate calibration time: `18 * 0.45 = 8.1 seconds`

Two baseline modes exist:

- MediaPipe mode:
  - uses Eye Aspect Ratio (EAR)
  - stores an average open-eye EAR from the first calibration frames
- Heuristic fallback mode:
  - uses eye-region contrast from the canvas
  - stores an average open-eye contrast baseline from the first calibration frames

That means the app is not comparing everyone to one fixed face template. It first learns what "normal" looks like for the current user in the current lighting conditions.

## Raw Inputs Sent To Flask

The frontend sends four main features:

- `eye_closure`
  - already on a `0-1` scale
  - higher means more closed
- `blink_rate`
  - blinks counted over the last `60` seconds
- `head_tilt`
  - degrees of tilt
- `reaction_time`
  - seconds to respond to the cue

## Server Normalization

Flask converts each feature into a shared `0-1` risk scale:

- `eye_closure`
  - `clip(eye_closure, 0, 1)`
- `blink_rate`
  - `clip(blink_rate / 32, 0, 1)`
- `head_tilt`
  - `clip(head_tilt / 25, 0, 1)`
- `reaction_time`
  - `clip(reaction_time / 1.4, 0, 1)`

Those divisors are the current starter baselines:

- `32 blinks/min`
  - above this starts to look unusually unstable for the simple heuristic
- `25 degrees`
  - a practical "outside neutral" threshold for head tilt
- `1.4 seconds`
  - a slow reaction target boundary for the starter monitor

## Weighted Score

After normalization, Flask computes:

`score = 0.4 * eye + 0.2 * blink + 0.2 * head + 0.2 * reaction`

Current weights:

- eye closure: `0.4`
- blink rate: `0.2`
- head tilt: `0.2`
- reaction time: `0.2`

Threshold:

- if `score >= 0.5` -> `NOT SAFE`
- else -> `SAFE`

## Worked Example

Example raw inputs:

- `eye_closure = 0.62`
- `blink_rate = 18`
- `head_tilt = 9`
- `reaction_time = 0.81`

Normalized:

- `eye = 0.62`
- `blink = 18 / 32 = 0.563`
- `head = 9 / 25 = 0.36`
- `reaction = 0.81 / 1.4 = 0.579`

Weighted score:

- `0.4 * 0.62 = 0.248`
- `0.2 * 0.563 = 0.113`
- `0.2 * 0.36 = 0.072`
- `0.2 * 0.579 = 0.116`

Total:

- `score = 0.248 + 0.113 + 0.072 + 0.116 = 0.549`

Result:

- `NOT SAFE`

## Why These Numbers Exist

These are starter calibration numbers, not clinically validated thresholds.

They were chosen because they:

- match the current frontend units
- are easy to reason about in demos
- let the browser fallback and Flask scoring stay aligned
- create a stable contract for later ML replacement

## Optional Model Path

If a model file is configured:

- Flask still uses the same normalization first
- the model predicts a risk score
- the backend converts that to:
  - `status`
  - `confidence`
  - `score`

That keeps the response shape compatible with the heuristic path.

## Important Contract Notes

- `head_tilt` must be treated as degrees, not as a pre-normalized `0-1` value
- Supabase history should store raw values for review
- response `normalized_features` should always reflect the server-side scoring inputs

## Future Improvements

- replace starter thresholds with real labeled validation
- learn personalized thresholds from more session history
- split "fatigue" vs "impairment" risk bands instead of one binary threshold
- version the scoring contract when thresholds change
