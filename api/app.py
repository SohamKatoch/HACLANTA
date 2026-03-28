import logging
import os
from datetime import datetime, timezone

import joblib
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from feature_normalize import model_feature_row, normalize_features, to_float

try:
    from supabase import create_client
except Exception:
    create_client = None

load_dotenv()

app = Flask(__name__)
CORS(app)
logger = logging.getLogger(__name__)

MODEL_PATH = os.getenv("MODEL_PATH", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "feature_log")
REACTION_TESTS_TABLE = os.getenv("SUPABASE_REACTION_TABLE", "reaction_tests")
USERS_TABLE = os.getenv("SUPABASE_USERS_TABLE", "user_data")

ANALYSIS_WEIGHTS = {
    "eye_closure": 0.4,
    "blink_rate": 0.2,
    "head_tilt": 0.2,
    "reaction_time": 0.2,
}
SCORE_THRESHOLD = 0.5

model = None
if MODEL_PATH and os.path.exists(MODEL_PATH):
    model = joblib.load(MODEL_PATH)

supabase = None
if SUPABASE_URL and SUPABASE_KEY and create_client:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


def build_reasons(normalized_features):
    reasons = []

    if normalized_features["eye_closure"] >= 0.55:
        reasons.append("Eye closure stayed elevated in recent samples.")

    if normalized_features["blink_rate"] >= 0.55:
        reasons.append("Blink frequency is trending above the comfort band.")

    if normalized_features["head_tilt"] >= 0.55:
        reasons.append("Head alignment drifted outside the neutral range.")

    if normalized_features["reaction_time"] >= 0.55:
        reasons.append("Reaction time is slower than the target window.")

    if not reasons:
        reasons.append("Recent measurements remain inside the starter safety band.")

    return reasons


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json or {}

    user_id = data.get("user_id")
    display_name = data.get("display_name")
    log_reaction = bool(data.get("log_reaction_event"))
    save_capture = bool(data.get("save_capture"))
    source = str(data.get("source") or "web")
    raw_eye_closure = to_float(data.get("eye_closure"))
    raw_blink_rate = to_float(data.get("blink_rate"))
    raw_head_tilt = to_float(data.get("head_tilt"))
    raw_reaction = to_float(data.get("reaction_time"), default=0.6)

    eye_norm, blink_norm, head_tilt_norm, reaction_norm, blink_rate_raw = normalize_features(
        raw_eye_closure,
        raw_blink_rate,
        raw_head_tilt,
        raw_reaction,
    )
    normalized_features = {
        "eye_closure": round(float(eye_norm), 3),
        "blink_rate": round(float(blink_norm), 3),
        "head_tilt": round(float(head_tilt_norm), 3),
        "reaction_time": round(float(reaction_norm), 3),
    }

    score = None
    confidence = None
    status = None
    provider = None

    if model is not None:
        sample = model_feature_row(
            raw_eye_closure,
            raw_blink_rate,
            raw_head_tilt,
            raw_reaction,
        )

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(sample)[0]
            classes = list(getattr(model, "classes_", []))
            risk_index = classes.index(1) if 1 in classes else -1
            score = float(probabilities[risk_index] if risk_index >= 0 else probabilities[-1])
        else:
            pred = int(model.predict(sample)[0])
            score = 1.0 if pred == 1 else 0.0

        score = round(float(score), 3)
        status = "NOT SAFE" if score >= SCORE_THRESHOLD else "SAFE"
        confidence = round(float(score if status == "NOT SAFE" else 1 - score), 2)
        provider = "python-random-forest"
    else:
        score = (
            eye_norm * ANALYSIS_WEIGHTS["eye_closure"]
            + blink_norm * ANALYSIS_WEIGHTS["blink_rate"]
            + head_tilt_norm * ANALYSIS_WEIGHTS["head_tilt"]
            + reaction_norm * ANALYSIS_WEIGHTS["reaction_time"]
        )
        score = round(float(score), 3)
        if score >= SCORE_THRESHOLD:
            status = "NOT SAFE"
        else:
            status = "SAFE"
        confidence = round(float(score if status == "NOT SAFE" else 1 - score), 2)
        provider = "python-threshold"

    reasons = build_reasons(normalized_features)

    if supabase is not None:
        if user_id:
            try:
                supabase.table(USERS_TABLE).upsert(
                    {
                        "id": user_id,
                        "display_name": display_name,
                        "last_seen_at": datetime.now(timezone.utc).isoformat(),
                    },
                    on_conflict="id",
                ).execute()
            except Exception as exc:
                logger.warning("Supabase user_data upsert failed: %s", exc)

        if save_capture:
            try:
                supabase.table(SUPABASE_TABLE).insert(
                    {
                        "user_id": user_id,
                        "eye_closure": raw_eye_closure,
                        "blink_rate": float(blink_rate_raw),
                        "head_tilt": raw_head_tilt,
                        "reaction_time": raw_reaction,
                        "status": status,
                        "confidence": confidence,
                        "score": score,
                        "source": source,
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
                    "source": source,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
        except Exception as exc:
            logger.warning("Supabase reaction_tests insert failed: %s", exc)

    return jsonify(
        {
            "status": status,
            "confidence": confidence,
            "score": score,
            "provider": provider,
            "weights": ANALYSIS_WEIGHTS,
            "normalized_features": normalized_features,
            "reasons": reasons,
            "saved_capture": save_capture and supabase is not None,
            "features": {
                "eye_closure": round(float(raw_eye_closure), 3),
                "blink_rate": round(float(blink_rate_raw), 3),
                "head_tilt": round(float(raw_head_tilt), 3),
                "reaction_time": round(float(raw_reaction), 3),
            },
        }
    )


@app.route("/history", methods=["GET"])
def history():
    user_id = request.args.get("user_id")
    limit = int(request.args.get("limit", "10"))

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400

    if supabase is None:
        return jsonify({"items": [], "warning": "Supabase is not configured"}), 200

    try:
        response = (
            supabase.table(SUPABASE_TABLE)
            .select(
                "id, user_id, eye_closure, blink_rate, head_tilt, reaction_time, status, confidence, score, source, created_at"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return jsonify({"items": response.data or []})
    except Exception as exc:
        logger.warning("Supabase history query failed: %s", exc)
        return jsonify({"items": [], "error": "history query failed"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
