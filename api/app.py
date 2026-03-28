import os
from datetime import datetime, timezone

import joblib
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from supabase import create_client
except Exception:
    create_client = None

app = Flask(__name__)
CORS(app)

MODEL_PATH = os.getenv("MODEL_PATH", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "feature_log")

model = None
if MODEL_PATH and os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)

supabase = None
if SUPABASE_URL and SUPABASE_KEY and create_client:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json or {}

    eye_closure = to_float(data.get("eye_closure"))
    blink_rate_raw = to_float(data.get("blink_rate"))
    head_tilt = to_float(data.get("head_tilt"))
    reaction_time = to_float(data.get("reaction_time"), default=0.6)
    user_id = data.get("user_id")

    blink_rate = np.clip(blink_rate_raw / 30.0, 0.0, 1.0)
    reaction_norm = np.clip(reaction_time / 1.5, 0.0, 1.0)
    head_tilt_norm = np.clip(head_tilt, 0.0, 1.0)
    eye_norm = np.clip(eye_closure, 0.0, 1.0)

    score = None
    confidence = None
    status = None

    if model is not None:
        sample = np.array([[eye_norm, blink_rate, head_tilt_norm, reaction_norm]])
        pred = int(model.predict(sample)[0])
        if hasattr(model, "predict_proba"):
            proba = float(model.predict_proba(sample)[0][pred])
            confidence = round(proba, 2)
        else:
            confidence = 0.7
        status = "NOT SAFE" if pred == 1 else "SAFE"
    else:
        score = eye_norm * 0.4 + blink_rate * 0.2 + head_tilt_norm * 0.2 + reaction_norm * 0.2
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
                    "reaction_time": reaction_time,
                    "status": status,
                    "confidence": confidence,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception:
            pass

    return jsonify(
        {
            "status": status,
            "confidence": confidence,
            "score": round(float(score), 3) if score is not None else None,
            "features": {
                "eye_closure": round(float(eye_norm), 3),
                "blink_rate": round(float(blink_rate_raw), 3),
                "head_tilt": round(float(head_tilt_norm), 3),
                "reaction_time": round(float(reaction_time), 3),
            },
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
