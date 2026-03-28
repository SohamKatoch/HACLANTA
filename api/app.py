import logging
import os
from datetime import datetime, timezone

import joblib
from flask import Flask, jsonify, request
from flask_cors import CORS

from feature_normalize import model_feature_row, normalize_features, to_float

try:
    from supabase import create_client
except Exception:
    create_client = None

app = Flask(__name__)
CORS(app)
logger = logging.getLogger(__name__)

MODEL_PATH = os.getenv("MODEL_PATH", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "feature_log")
REACTION_TESTS_TABLE = os.getenv("SUPABASE_REACTION_TABLE", "reaction_tests")

model = None
if MODEL_PATH and os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)

supabase = None
if SUPABASE_URL and SUPABASE_KEY and create_client:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json or {}

    user_id = data.get("user_id")
    log_reaction = bool(data.get("log_reaction_event"))
    raw_reaction = to_float(data.get("reaction_time"), default=0.6)

    eye_norm, blink_norm, head_tilt_norm, reaction_norm, blink_rate_raw = normalize_features(
        data.get("eye_closure"),
        data.get("blink_rate"),
        data.get("head_tilt"),
        raw_reaction,
    )

    score = None
    confidence = None
    status = None

    if model is not None:
        sample = model_feature_row(
            data.get("eye_closure"),
            data.get("blink_rate"),
            data.get("head_tilt"),
            raw_reaction,
        )
        pred = int(model.predict(sample)[0])
        if hasattr(model, "predict_proba"):
            proba = float(model.predict_proba(sample)[0][pred])
            confidence = round(proba, 2)
        else:
            confidence = 0.7
        status = "NOT SAFE" if pred == 1 else "SAFE"
    else:
        score = eye_norm * 0.4 + blink_norm * 0.2 + head_tilt_norm * 0.2 + reaction_norm * 0.2
        if score > 0.5:
            status = "NOT SAFE"
            confidence = round(float(score), 2)
        else:
            status = "SAFE"
            confidence = round(float(1 - score), 2)

    if supabase is not None:
        try:
            supabase.table(SUPABASE_TABLE).insert(
                {
                    "user_id": user_id,
                    "eye_closure": eye_norm,
                    "blink_rate": float(blink_rate_raw),
                    "head_tilt": head_tilt_norm,
                    "reaction_time": raw_reaction,
                    "status": status,
                    "confidence": confidence,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            logger.warning("Supabase feature_log insert failed: %s", exc)

    if supabase is not None and log_reaction:
        try:
            supabase.table(REACTION_TESTS_TABLE).insert(
                {
                    "user_id": user_id,
                    "reaction_time_sec": raw_reaction,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            logger.warning("Supabase reaction_tests insert failed: %s", exc)

    return jsonify(
        {
            "status": status,
            "confidence": confidence,
            "score": round(float(score), 3) if score is not None else None,
            "features": {
                "eye_closure": round(float(eye_norm), 3),
                "blink_rate": round(float(blink_rate_raw), 3),
                "head_tilt": round(float(head_tilt_norm), 3),
                "reaction_time": round(float(raw_reaction), 3),
            },
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
