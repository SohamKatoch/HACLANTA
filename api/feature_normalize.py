"""Shared feature scaling for heuristic scoring and sklearn inference."""

import numpy as np


def normalize_features(eye_closure, blink_rate, head_tilt, reaction_time):
    """
    Returns (eye_norm, blink_norm, head_tilt_norm, reaction_norm, blink_rate_raw).
    blink_rate_raw is the unscaled count for logging to Supabase.
    """
    eye_norm = float(np.clip(to_float(eye_closure), 0.0, 1.0))
    blink_rate_raw = to_float(blink_rate)
    blink_norm = float(np.clip(blink_rate_raw / 30.0, 0.0, 1.0))
    head_tilt_norm = float(np.clip(to_float(head_tilt), 0.0, 1.0))
    reaction_time_f = to_float(reaction_time, default=0.6)
    reaction_norm = float(np.clip(reaction_time_f / 1.5, 0.0, 1.0))
    return eye_norm, blink_norm, head_tilt_norm, reaction_norm, blink_rate_raw


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def model_feature_row(eye_closure, blink_rate, head_tilt, reaction_time):
    """Single row [eye_norm, blink_norm, head_tilt_norm, reaction_norm] for sklearn."""
    e, b, h, r, _ = normalize_features(eye_closure, blink_rate, head_tilt, reaction_time)
    return np.array([[e, b, h, r]])
