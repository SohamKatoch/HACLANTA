from __future__ import annotations

from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ANALYSIS_WEIGHTS = {
    "eye_closure": 0.4,
    "blink_rate": 0.2,
    "head_tilt": 0.2,
    "reaction_time": 0.2,
}

SCORE_THRESHOLD = 0.5


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def normalize_features(payload: dict[str, Any]) -> dict[str, float]:
    return {
        "eye_closure": clamp(float(payload.get("eye_closure", 0.0))),
        "blink_rate": clamp(float(payload.get("blink_rate", 0.0)) / 32.0),
        "head_tilt": clamp(float(payload.get("head_tilt", 0.0)) / 25.0),
        "reaction_time": clamp(float(payload.get("reaction_time", 0.0)) / 1.4),
    }


def analyze_features(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_features(payload)
    score = round(
        sum(normalized[name] * weight for name, weight in ANALYSIS_WEIGHTS.items()),
        3,
    )
    status = "NOT SAFE" if score >= SCORE_THRESHOLD else "SAFE"
    confidence = round(score if status == "NOT SAFE" else 1 - score, 2)

    reasons: list[str] = []

    if normalized["eye_closure"] >= 0.55:
        reasons.append("Eye closure stayed elevated in recent samples.")
    if normalized["blink_rate"] >= 0.55:
        reasons.append("Blink frequency is trending above the comfort band.")
    if normalized["head_tilt"] >= 0.55:
        reasons.append("Head alignment drifted outside the neutral range.")
    if normalized["reaction_time"] >= 0.55:
        reasons.append("Reaction time is slower than the target window.")
    if not reasons:
        reasons.append("Recent measurements remain inside the starter safety band.")

    return {
        "status": status,
        "confidence": confidence,
        "score": score,
        "provider": "python-threshold-stub",
        "model_ready": False,
        "weights": ANALYSIS_WEIGHTS,
        "normalized_features": normalized,
        "reasons": reasons,
    }


@app.get("/health")
def health() -> Any:
    return jsonify(
        {
            "ok": True,
            "service": "drowsiness-analyzer",
            "model_ready": False,
            "message": "Threshold stub is active. Replace analyze_features() with your model later.",
        }
    )


@app.post("/analyze")
def analyze() -> Any:
    payload = request.get_json(silent=True) or {}

    required_fields = ("eye_closure", "blink_rate", "head_tilt", "reaction_time")
    missing = [field for field in required_fields if field not in payload]

    if missing:
        return (
            jsonify(
                {
                    "error": "Missing required numeric fields.",
                    "missing": missing,
                }
            ),
            400,
        )

    # Future model handoff:
    # 1. Load the trained model at startup.
    # 2. Convert the payload into the model feature vector here.
    # 3. Replace analyze_features(payload) with model inference + calibration logic.
    return jsonify(analyze_features(payload))


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
