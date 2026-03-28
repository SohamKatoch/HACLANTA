export type DrowsinessStatus = "SAFE" | "NOT SAFE";

export type DrowsinessFeatures = {
  eye_closure: number;
  blink_rate: number;
  head_tilt: number;
  reaction_time: number;
  session_id?: string;
  captured_at?: string;
  feature_source?: string;
  user_id?: string;
  display_name?: string;
  source?: string;
  save_capture?: boolean;
  log_reaction_event?: boolean;
};

export type NormalizedFeatures = {
  eye_closure: number;
  blink_rate: number;
  head_tilt: number;
  reaction_time: number;
};

export type DrowsinessAssessment = {
  status: DrowsinessStatus;
  confidence: number;
  score: number;
  provider: string;
  weights: Record<keyof NormalizedFeatures, number>;
  normalized_features: NormalizedFeatures;
  reasons: string[];
};

export const ANALYSIS_WEIGHTS: Record<keyof NormalizedFeatures, number> = {
  eye_closure: 0.4,
  blink_rate: 0.2,
  head_tilt: 0.2,
  reaction_time: 0.2,
};

export const SCORE_THRESHOLD = 0.5;

export function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function normalizeFeatures(
  features: DrowsinessFeatures,
): NormalizedFeatures {
  return {
    eye_closure: clamp(features.eye_closure),
    blink_rate: clamp(features.blink_rate / 32),
    head_tilt: clamp(features.head_tilt / 25),
    reaction_time: clamp(features.reaction_time / 1.4),
  };
}

export function analyzeDrowsiness(
  features: DrowsinessFeatures,
  provider = "local-threshold",
): DrowsinessAssessment {
  const normalized = normalizeFeatures(features);

  const score = Number(
    (
      normalized.eye_closure * ANALYSIS_WEIGHTS.eye_closure +
      normalized.blink_rate * ANALYSIS_WEIGHTS.blink_rate +
      normalized.head_tilt * ANALYSIS_WEIGHTS.head_tilt +
      normalized.reaction_time * ANALYSIS_WEIGHTS.reaction_time
    ).toFixed(3),
  );

  const status: DrowsinessStatus =
    score >= SCORE_THRESHOLD ? "NOT SAFE" : "SAFE";

  const confidence = Number(
    (status === "NOT SAFE" ? score : 1 - score).toFixed(2),
  );

  const reasons: string[] = [];

  if (normalized.eye_closure >= 0.55) {
    reasons.push("Eye closure stayed elevated in recent samples.");
  }

  if (normalized.blink_rate >= 0.55) {
    reasons.push("Blink frequency is trending above the comfort band.");
  }

  if (normalized.head_tilt >= 0.55) {
    reasons.push("Head alignment drifted outside the neutral range.");
  }

  if (normalized.reaction_time >= 0.55) {
    reasons.push("Reaction time is slower than the target window.");
  }

  if (reasons.length === 0) {
    reasons.push("Recent measurements remain inside the starter safety band.");
  }

  return {
    status,
    confidence,
    score,
    provider,
    weights: ANALYSIS_WEIGHTS,
    normalized_features: normalized,
    reasons,
  };
}
