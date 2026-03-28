# Mistakes to avoid

Document issues we hit or nearly hit so future changes stay consistent.

## Training vs inference mismatch

- **Problem**: `train_model.py` used raw CSV columns while `app.py` fed a **normalized** vector into `RandomForestClassifier.predict`. Models trained on raw scales will behave incorrectly at inference.
- **Fix**: Shared normalization in `api/feature_normalize.py`; both Flask and `train_model.py` import it.

## `head_tilt` units

- **Problem**: The outline mixed “12” (degrees) with \([0,1]\) client values. The current frontend sends **clamped 0–1** proxies. Document the contract in README and API; if you switch to degrees, normalize consistently on the server.

## Supabase silent failures

- **Problem**: `app.py` swallowed insert exceptions with bare `except`, hiding misconfigured keys or schema drift.
- **Fix**: Log failures with `logging.warning` (or similar) so operators see errors without breaking the API response.

## Next.js proxy URL

- **Problem**: Forgetting `FLASK_API_URL` or omitting `/analyze` breaks the proxy with opaque 500s.
- **Fix**: Keep `.env.local.example` explicit; document that the value must be the full analyze URL.

## CORS and cookies

- **Problem**: If the browser ever calls Flask directly from another origin, CORS must allow it. Current design avoids that by proxying through Next (same origin).

## ML labels

- **Problem**: `train_model.py` expects `label` with `0` = SAFE, `1` = NOT SAFE. Inverting labels silently inverts predictions.
- **Fix**: Document in `train_model.py` and CSV export docs.

## Old `.pkl` after normalization change

- **Problem**: If you trained `drowsiness_model.pkl` before training used `feature_normalize.py`, inference vectors no longer match.
- **Fix**: Retrain with the current `train_model.py` and redeploy the new pickle.

## Blink detection semantics

- **Problem**: Counting transitions on a noisy luminance “eye closed” signal can over-count blinks or miss them. Tune `EYE_CLOSED_THRESHOLD` and sampling interval per environment; treat counts as **approximate** until landmark-based detection lands.
