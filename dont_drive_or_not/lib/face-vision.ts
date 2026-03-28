import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/** MediaPipe Face Landmarker indices (facemesh topology) for classic 6-point EAR. */
const LEFT_EAR_INDICES = [33, 160, 158, 153, 144, 163] as const;
const RIGHT_EAR_INDICES = [263, 387, 385, 380, 373, 390] as const;

export type VisionEngine = "mediapipe" | "heuristic" | "loading";

export type FaceGeometryMetrics = {
  earLeft: number;
  earRight: number;
  earAvg: number;
  headTiltDeg: number;
};

function landmarkDistance(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  width: number,
  height: number,
) {
  const dx = (a.x - b.x) * width;
  const dy = (a.y - b.y) * height;
  return Math.hypot(dx, dy);
}

/**
 * Eye Aspect Ratio after Soukupová & Čech (2016), using pixel-scaled distances.
 */
export function computeEyeAspectRatio(
  landmarks: NormalizedLandmark[],
  indices: readonly number[],
  width: number,
  height: number,
): number {
  const p = indices.map((i) => landmarks[i]);
  if (p.some((pt) => !pt)) {
    return 0.28;
  }

  const vertical1 = landmarkDistance(p[1], p[5], width, height);
  const vertical2 = landmarkDistance(p[2], p[4], width, height);
  const horizontal = landmarkDistance(p[0], p[3], width, height);

  if (horizontal < 1e-4) {
    return 0.28;
  }

  return (vertical1 + vertical2) / (2 * horizontal);
}

/** Degrees from horizontal: line through outer eye corners (33 ↔ 263). */
export function computeHeadTiltDeg(
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
): number {
  const left = landmarks[33];
  const right = landmarks[263];
  if (!left || !right) {
    return 0;
  }

  const dx = (right.x - left.x) * width;
  const dy = (right.y - left.y) * height;
  const rad = Math.atan2(dy, dx);
  return Math.abs((rad * 180) / Math.PI);
}

export function computeFaceGeometry(
  landmarks: NormalizedLandmark[],
  videoWidth: number,
  videoHeight: number,
): FaceGeometryMetrics {
  const earLeft = computeEyeAspectRatio(
    landmarks,
    LEFT_EAR_INDICES,
    videoWidth,
    videoHeight,
  );
  const earRight = computeEyeAspectRatio(
    landmarks,
    RIGHT_EAR_INDICES,
    videoWidth,
    videoHeight,
  );
  const earAvg = (earLeft + earRight) / 2;
  const headTiltDeg = computeHeadTiltDeg(landmarks, videoWidth, videoHeight);

  return { earLeft, earRight, earAvg, headTiltDeg };
}

/**
 * Map EAR drop relative to open-eye baseline to a 0–1 closure signal (higher = more closed).
 */
export function earToEyeClosure(ear: number, baselineEar: number) {
  if (!Number.isFinite(ear) || !Number.isFinite(baselineEar) || baselineEar < 0.05) {
    return 0;
  }

  const span = Math.max(baselineEar * 0.55, 0.04);
  const raw = (baselineEar - ear) / span;
  return Math.min(1, Math.max(0, raw));
}

export async function createFaceLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

  const wasmVersion = "0.10.17";
  const wasmPath = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${wasmVersion}/wasm`;
  const modelPath =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  const filesetResolver = await FilesetResolver.forVisionTasks(wasmPath);

  const baseOptions = {
    modelAssetPath: modelPath,
    delegate: "GPU" as const,
  };

  const options = {
    baseOptions,
    runningMode: "VIDEO" as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  try {
    try {
      return await FaceLandmarker.createFromOptions(filesetResolver, options);
    } catch {
      return await FaceLandmarker.createFromOptions(filesetResolver, {
        ...options,
        baseOptions: { ...baseOptions, delegate: "CPU" },
      });
    }
  } catch {
    return null;
  }
}

export type FaceLandmarkerInstance = NonNullable<Awaited<ReturnType<typeof createFaceLandmarker>>>;
