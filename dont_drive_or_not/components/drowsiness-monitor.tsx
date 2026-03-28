"use client";

import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faCheck, faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  analyzeDrowsiness,
  clamp,
  type DrowsinessAssessment,
  type DrowsinessFeatures,
} from "@/lib/drowsiness";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  computeFaceGeometry,
  createFaceLandmarker,
  earToEyeClosure,
  type FaceLandmarkerInstance,
  type VisionEngine,
} from "@/lib/face-vision";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { clearStoredSession, getStoredSession, type AppSession } from "@/lib/session";

const SAMPLE_INTERVAL_MS = 450;
const ANALYSIS_INTERVAL_MS = 3500;
const CALIBRATION_FRAMES = 18;
const REACTION_TIMEOUT_MS = 3000;
const REACTION_DELAY_RANGE = [7000, 13000] as const;
const DEFAULT_REACTION_TIME = 0.45;
const HELP_DIALOG_PREFIX = "drive-awake-help-seen";

type MonitorStage = "idle" | "starting" | "calibrating" | "active" | "error";

type LiveMetrics = {
  eyeClosure: number;
  blinkRate: number;
  headTilt: number;
  reactionTime: number;
  brightness: number;
  eyeOpenness: number;
};

type WindowStats = {
  mean: number;
  stdDev: number;
  darkCentroidY: number;
};

type HistoryItem = {
  id: number;
  user_id: string;
  eye_closure: number;
  blink_rate: number;
  head_tilt: number;
  reaction_time: number;
  status: "SAFE" | "NOT SAFE";
  confidence: number;
  score: number | null;
  source: string;
  created_at: string;
};

type AnalyzeApiResponse = DrowsinessAssessment & {
  saved_capture?: boolean;
};

const LOCAL_HISTORY_PREFIX = "drive-awake-history";
const DEFAULT_METRICS: LiveMetrics = {
  eyeClosure: 0,
  blinkRate: 0,
  headTilt: 0,
  reactionTime: DEFAULT_REACTION_TIME,
  brightness: 0,
  eyeOpenness: 0,
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function smooth(previous: number, next: number, weight = 0.25) {
  return previous + (next - previous) * weight;
}

function formatPercent(value: number) {
  return `${Math.round(clamp(value) * 100)}%`;
}

function formatConfidence(value: number) {
  return `${Math.round(clamp(value) * 100)}%`;
}

function createSessionId() {
  return `session-${Math.random().toString(36).slice(2, 10)}`;
}

function getRandomDelay() {
  const [min, max] = REACTION_DELAY_RANGE;
  return Math.floor(min + Math.random() * (max - min));
}

function getHistoryStorageKey(userId: string) {
  return `${LOCAL_HISTORY_PREFIX}:${userId}`;
}

function getHelpDialogStorageKey(userId: string) {
  return `${HELP_DIALOG_PREFIX}:${userId || "guest"}`;
}

function readStoredHistory(userId: string): HistoryItem[] {
  if (typeof window === "undefined" || !userId) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getHistoryStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredHistory(userId: string, items: HistoryItem[]) {
  if (typeof window === "undefined" || !userId) {
    return;
  }

  window.localStorage.setItem(getHistoryStorageKey(userId), JSON.stringify(items));
}

function mergeHistoryItems(primary: HistoryItem[], secondary: HistoryItem[]) {
  const seen = new Set<string>();
  const merged = [...primary, ...secondary].filter((item) => {
    const key = `${item.created_at}-${item.confidence}-${item.user_id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return merged.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function buildHistoryItem(
  userId: string,
  features: DrowsinessFeatures,
  assessment: DrowsinessAssessment,
): HistoryItem {
  return {
    id: Date.now(),
    user_id: userId,
    eye_closure: features.eye_closure,
    blink_rate: features.blink_rate,
    head_tilt: features.head_tilt,
    reaction_time: features.reaction_time,
    status: assessment.status,
    confidence: assessment.confidence,
    score: assessment.score,
    source: assessment.provider ?? features.source ?? "browser-local",
    created_at: features.captured_at ?? new Date().toISOString(),
  };
}

function analyzeRegion(
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
): WindowStats {
  const x0 = Math.max(0, Math.floor(xStart));
  const x1 = Math.min(frameWidth, Math.floor(xEnd));
  const y0 = Math.max(0, Math.floor(yStart));
  const y1 = Math.min(frameHeight, Math.floor(yEnd));

  let sampleCount = 0;
  let total = 0;
  let totalSquared = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * frameWidth + x) * 4;
      const luminance =
        data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;

      total += luminance;
      totalSquared += luminance * luminance;
      sampleCount += 1;
    }
  }

  if (sampleCount === 0) {
    return {
      mean: 0,
      stdDev: 0,
      darkCentroidY: (y1 - y0) / 2,
    };
  }

  const mean = total / sampleCount;
  const variance = Math.max(totalSquared / sampleCount - mean * mean, 0);
  const stdDev = Math.sqrt(variance);

  let weightedY = 0;
  let weightTotal = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * frameWidth + x) * 4;
      const luminance =
        data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      const weight = Math.max(0, mean - luminance);

      weightedY += (y - y0) * weight;
      weightTotal += weight;
    }
  }

  return {
    mean,
    stdDev,
    darkCentroidY: weightTotal > 0 ? weightedY / weightTotal : (y1 - y0) / 2,
  };
}

function metricTone(value: number, kind: "inverse" | "direct") {
  const normalized = kind === "inverse" ? 1 - clamp(value) : clamp(value);

  if (normalized >= 0.7) {
    return "text-[var(--risk)]";
  }

  if (normalized >= 0.45) {
    return "text-[var(--warn)]";
  }

  return "text-[var(--safe)]";
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <Card className="h-full border-slate-200 bg-white">
      <CardContent className="p-4 sm:p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:text-xs sm:tracking-[0.25em]">
          {label}
        </p>
        <p className={`mt-2 text-2xl font-semibold sm:mt-3 sm:text-3xl ${tone}`}>{value}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-600 sm:mt-2 sm:text-sm sm:leading-6">
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

export default function DrowsinessMonitor({
  requireSession = false,
}: Readonly<{
  requireSession?: boolean;
}>) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const reactionCueTimeoutRef = useRef<number | null>(null);
  const reactionExpireTimeoutRef = useRef<number | null>(null);
  const reactionStartedAtRef = useRef<number | null>(null);
  const queueReactionCueRef = useRef<() => void>(() => {});
  const calibrationSamplesRef = useRef<number[]>([]);
  const baselineOpennessRef = useRef<number | null>(null);
  const blinkClosedRef = useRef(false);
  const blinkTimestampsRef = useRef<number[]>([]);
  const reactionSamplesRef = useRef<number[]>([]);
  const sessionIdRef = useRef(createSessionId());

  const [stage, setStage] = useState<MonitorStage>("idle");
  const [metrics, setMetrics] = useState<LiveMetrics>(DEFAULT_METRICS);
  const [assessment, setAssessment] = useState<DrowsinessAssessment | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [reactionCueVisible, setReactionCueVisible] = useState(false);
  const [reactionLabel, setReactionLabel] = useState(
    "A cue will flash while monitoring is active.",
  );
  const [cueProcessingComplete, setCueProcessingComplete] = useState(false);
  const [lastReactionTime, setLastReactionTime] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState("Driver");
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionUserId, setSessionUserId] = useState("");
  const [sessionVin, setSessionVin] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [scoreCommentary, setScoreCommentary] = useState(
    "Run a capture and I will give you a tiny AI read on your confidence score.",
  );
  const [scoreCommentaryLoading, setScoreCommentaryLoading] = useState(false);
  const [scoreCommentaryProvider, setScoreCommentaryProvider] = useState("local-fallback");
  const [capturePending, setCapturePending] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [visionEngine, setVisionEngine] = useState<VisionEngine>("heuristic");
  const commentaryStatus = assessment?.status ?? null;
  const commentaryConfidence =
    assessment !== null ? Math.round(assessment.confidence * 100) / 100 : null;
  const commentaryScore =
    typeof assessment?.score === "number"
      ? Math.round(assessment.score * 100) / 100
      : null;
  const commentaryRequestKey = assessment
    ? `${assessment.status}:${Math.round(assessment.confidence * 100)}:${Math.round((assessment.score ?? 0) * 100)}`
    : "";

  function applySession(session: AppSession) {
    setSessionName(session.name);
    setSessionEmail(session.email);
    setSessionUserId(session.userId);
    setSessionVin(session.vin);
  }

  function clearReactionTimers() {
    if (reactionCueTimeoutRef.current) {
      window.clearTimeout(reactionCueTimeoutRef.current);
      reactionCueTimeoutRef.current = null;
    }

    if (reactionExpireTimeoutRef.current) {
      window.clearTimeout(reactionExpireTimeoutRef.current);
      reactionExpireTimeoutRef.current = null;
    }
  }

  function stopMediaStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function resetSessionState(nextStage: MonitorStage = "idle") {
    clearReactionTimers();
    setReactionCueVisible(false);
    setCueProcessingComplete(false);
    setReactionLabel("A cue will flash while monitoring is active.");
    setLastReactionTime(null);
    setAssessment(null);
    setSubmissionError(null);
    setCaptureNotice(null);
    setCameraError(null);
    setMetrics(DEFAULT_METRICS);
    calibrationSamplesRef.current = [];
    baselineOpennessRef.current = null;
    blinkClosedRef.current = false;
    blinkTimestampsRef.current = [];
    reactionSamplesRef.current = [];
    reactionStartedAtRef.current = null;
    sessionIdRef.current = createSessionId();
    setStage(nextStage);
  }

  function stopMonitoring() {
    clearReactionTimers();
    stopMediaStream();
    resetSessionState("idle");
  }

  function registerReactionSample(sampleSeconds: number, label: string) {
    reactionSamplesRef.current = [...reactionSamplesRef.current, sampleSeconds].slice(-5);
    const rollingAverage = average(reactionSamplesRef.current);

    reactionStartedAtRef.current = null;
    setReactionCueVisible(false);
    setReactionLabel(label);
    setLastReactionTime(sampleSeconds);
    setMetrics((current) => ({
      ...current,
      reactionTime: Number(smooth(current.reactionTime, rollingAverage, 0.35).toFixed(2)),
    }));
  }

  function queueReactionCue() {
    clearReactionTimers();

    if (stage !== "active") {
      return;
    }

    reactionCueTimeoutRef.current = window.setTimeout(() => {
      reactionStartedAtRef.current = performance.now();
      setCueProcessingComplete(false);
      setReactionCueVisible(true);
      setReactionLabel("Cue live. Tap the reaction pad now.");

      reactionExpireTimeoutRef.current = window.setTimeout(() => {
        if (reactionStartedAtRef.current !== null) {
          registerReactionSample(2.5, "Reaction cue missed. Penalty sample recorded.");
          queueReactionCue();
        }
      }, REACTION_TIMEOUT_MS);
    }, getRandomDelay());
  }

  queueReactionCueRef.current = queueReactionCue;

  function handleReactionPad() {
    if (reactionStartedAtRef.current === null) {
      return;
    }

    const sampleSeconds = Number(
      ((performance.now() - reactionStartedAtRef.current) / 1000).toFixed(2),
    );

    if (reactionExpireTimeoutRef.current) {
      window.clearTimeout(reactionExpireTimeoutRef.current);
      reactionExpireTimeoutRef.current = null;
    }

    registerReactionSample(
      sampleSeconds,
      `Reaction captured in ${sampleSeconds.toFixed(2)}s.`,
    );
    queueReactionCue();
  }

  async function handleCueCapture() {
    if (stage !== "active" || !reactionCueVisible || capturePending) {
      return;
    }

    handleReactionPad();
    await captureCurrentSnapshot();
  }

  const analyzeFrame = useEffectEvent(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    const frameWidth = 320;
    const frameHeight = 240;
    canvas.width = frameWidth;
    canvas.height = frameHeight;

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, frameWidth, frameHeight);
    const { data } = context.getImageData(0, 0, frameWidth, frameHeight);

    const fullFrame = analyzeRegion(
      data,
      frameWidth,
      frameHeight,
      0,
      frameWidth,
      0,
      frameHeight,
    );
    const brightness = clamp(fullFrame.mean / 255);

    if ((stage === "calibrating" || stage === "active") && visionEngine === "loading") {
      setReactionLabel("Loading MediaPipe face model...");
      setMetrics((current) => ({
        ...current,
        brightness: Number(smooth(current.brightness, brightness, 0.2).toFixed(3)),
      }));
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const landmarker = faceLandmarkerRef.current;

    if (landmarker && vw > 0 && vh > 0) {
      const detection = landmarker.detectForVideo(video, performance.now());
      const landmarks = detection.faceLandmarks?.[0];

      if (landmarks?.length) {
        const geom = computeFaceGeometry(landmarks, vw, vh);
        const eyeOpenness = geom.earAvg * 100;

        if (baselineOpennessRef.current === null) {
          calibrationSamplesRef.current = [...calibrationSamplesRef.current, geom.earAvg];

          if (calibrationSamplesRef.current.length >= CALIBRATION_FRAMES) {
            baselineOpennessRef.current = average(calibrationSamplesRef.current);
            setStage("active");
            setReactionLabel("Calibration complete. Monitoring is live.");
          } else {
            setReactionLabel(
              `Calibrating EAR baseline ${calibrationSamplesRef.current.length}/${CALIBRATION_FRAMES}.`,
            );
          }
        }

        const baselineEar = baselineOpennessRef.current ?? geom.earAvg;
        const rawEyeClosure = earToEyeClosure(geom.earAvg, baselineEar);

        if (rawEyeClosure >= 0.62 && !blinkClosedRef.current) {
          blinkClosedRef.current = true;
        } else if (rawEyeClosure <= 0.28 && blinkClosedRef.current) {
          blinkClosedRef.current = false;
          blinkTimestampsRef.current = [...blinkTimestampsRef.current, Date.now()];
        }

        const sixtySecondsAgo = Date.now() - 60_000;
        blinkTimestampsRef.current = blinkTimestampsRef.current.filter(
          (timestamp) => timestamp >= sixtySecondsAgo,
        );

        setMetrics((current) => ({
          eyeClosure: Number(smooth(current.eyeClosure, rawEyeClosure).toFixed(3)),
          blinkRate: Number(
            smooth(current.blinkRate, blinkTimestampsRef.current.length, 0.3).toFixed(2),
          ),
          headTilt: Number(smooth(current.headTilt, geom.headTiltDeg).toFixed(2)),
          reactionTime: current.reactionTime,
          brightness: Number(smooth(current.brightness, brightness, 0.2).toFixed(3)),
          eyeOpenness: Number(smooth(current.eyeOpenness, eyeOpenness, 0.25).toFixed(3)),
        }));

        return;
      }

      if (visionEngine === "mediapipe") {
        setReactionLabel("Align your face in the frame...");
        setMetrics((current) => ({
          ...current,
          brightness: Number(smooth(current.brightness, brightness, 0.2).toFixed(3)),
        }));
        return;
      }
    }

    const leftEye = analyzeRegion(
      data,
      frameWidth,
      frameHeight,
      frameWidth * 0.18,
      frameWidth * 0.42,
      frameHeight * 0.18,
      frameHeight * 0.4,
    );
    const rightEye = analyzeRegion(
      data,
      frameWidth,
      frameHeight,
      frameWidth * 0.58,
      frameWidth * 0.82,
      frameHeight * 0.18,
      frameHeight * 0.4,
    );

    const eyeOpenness = (leftEye.stdDev + rightEye.stdDev) / 2;

    if (baselineOpennessRef.current === null) {
      calibrationSamplesRef.current = [...calibrationSamplesRef.current, eyeOpenness];

      if (calibrationSamplesRef.current.length >= CALIBRATION_FRAMES) {
        baselineOpennessRef.current = average(calibrationSamplesRef.current);
        setStage("active");
        setReactionLabel("Calibration complete. Monitoring is live.");
      } else {
        setReactionLabel(
          `Calibrating contrast baseline ${calibrationSamplesRef.current.length}/${CALIBRATION_FRAMES}.`,
        );
      }
    }

    const baseline = (baselineOpennessRef.current ?? eyeOpenness) || 1;
    const rawEyeClosure = clamp((baseline - eyeOpenness) / Math.max(baseline * 0.45, 1));

    if (rawEyeClosure >= 0.62 && !blinkClosedRef.current) {
      blinkClosedRef.current = true;
    } else if (rawEyeClosure <= 0.28 && blinkClosedRef.current) {
      blinkClosedRef.current = false;
      blinkTimestampsRef.current = [...blinkTimestampsRef.current, Date.now()];
    }

    const sixtySecondsAgo = Date.now() - 60_000;
    blinkTimestampsRef.current = blinkTimestampsRef.current.filter(
      (timestamp) => timestamp >= sixtySecondsAgo,
    );

    const eyeSeparation = frameWidth * 0.4;
    const verticalDelta = rightEye.darkCentroidY - leftEye.darkCentroidY;
    const headTilt = Math.abs((Math.atan2(verticalDelta, eyeSeparation) * 180) / Math.PI);

    setMetrics((current) => ({
      eyeClosure: Number(smooth(current.eyeClosure, rawEyeClosure).toFixed(3)),
      blinkRate: Number(smooth(current.blinkRate, blinkTimestampsRef.current.length, 0.3).toFixed(2)),
      headTilt: Number(smooth(current.headTilt, headTilt).toFixed(2)),
      reactionTime: current.reactionTime,
      brightness: Number(smooth(current.brightness, brightness, 0.2).toFixed(3)),
      eyeOpenness: Number(smooth(current.eyeOpenness, eyeOpenness, 0.25).toFixed(3)),
    }));
  });

  const submitForAnalysis = useEffectEvent(async () => {
    if (stage !== "active") {
      return;
    }

    const payload: DrowsinessFeatures = {
      eye_closure: Number(metrics.eyeClosure.toFixed(3)),
      blink_rate: Number(metrics.blinkRate.toFixed(2)),
      head_tilt: Number(metrics.headTilt.toFixed(2)),
      reaction_time: Number(metrics.reactionTime.toFixed(2)),
      session_id: sessionIdRef.current,
      captured_at: new Date().toISOString(),
      feature_source:
        visionEngine === "mediapipe" ? "mediapipe-ear-v1" : "browser-heuristic-v1",
      user_id: sessionUserId || undefined,
      display_name: sessionName,
      source: "dont-drive-or-not",
    };

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Analyzer returned ${response.status}`);
      }

      const result = (await response.json()) as DrowsinessAssessment;

      startTransition(() => {
        setAssessment(result);
        setSubmissionError(null);
      });
    } catch {
      startTransition(() => {
        setAssessment(analyzeDrowsiness(payload, "local-browser-fallback"));
        setSubmissionError("The analyzer endpoint is unreachable, so local fallback scoring is in use.");
      });
    }
  });

  const fetchHistory = useEffectEvent(async () => {
    if (!sessionUserId) {
      setHistory([]);
      return;
    }

    const localItems = readStoredHistory(sessionUserId);
    if (localItems.length > 0) {
      setHistory(localItems);
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch(
        `/api/history?user_id=${encodeURIComponent(sessionUserId)}&limit=10`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`History returned ${response.status}`);
      }

      const result = (await response.json()) as { items?: HistoryItem[] };
      const mergedItems = mergeHistoryItems(result.items ?? [], localItems);
      setHistory(mergedItems);
      writeStoredHistory(sessionUserId, mergedItems);
    } catch {
      setHistory(localItems);
      if (localItems.length === 0) {
        setHistoryError("History is unavailable until the Flask and Supabase connection is active.");
      }
    } finally {
      setHistoryLoading(false);
    }
  });

  async function captureCurrentSnapshot() {
    const storedSession = getStoredSession();
    const activeSession =
      sessionUserId && sessionName
        ? {
            name: sessionName,
            email: sessionEmail,
            userId: sessionUserId,
            vin: sessionVin,
            signedInAt: storedSession?.signedInAt ?? new Date().toISOString(),
          }
        : storedSession;

    if (!activeSession?.userId) {
      setCaptureNotice("Your sign-in session is missing. Please sign in again before capturing.");
      if (requireSession) {
        router.push("/login");
      }
      return;
    }

    if (!sessionUserId || sessionUserId !== activeSession.userId) {
      applySession(activeSession);
    }

    const payload: DrowsinessFeatures = {
      eye_closure: Number(metrics.eyeClosure.toFixed(3)),
      blink_rate: Number(metrics.blinkRate.toFixed(2)),
      head_tilt: Number(metrics.headTilt.toFixed(2)),
      reaction_time: Number(metrics.reactionTime.toFixed(2)),
      session_id: sessionIdRef.current,
      captured_at: new Date().toISOString(),
      feature_source:
        visionEngine === "mediapipe" ? "mediapipe-ear-v1" : "browser-heuristic-v1",
      user_id: activeSession.userId,
      display_name: activeSession.name,
      source: "dont-drive-or-not",
      save_capture: true,
    };

    setCapturePending(true);
    setCaptureNotice(null);
    setSubmissionError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Capture returned ${response.status}`);
      }

      const result = (await response.json()) as AnalyzeApiResponse;

      startTransition(() => {
        setAssessment(result);
        setCueProcessingComplete(true);
        setCaptureNotice(
          result.saved_capture
            ? "Snapshot captured and added to this user's history."
            : "Snapshot captured and saved locally on this device.",
        );
      });

      const localItem = buildHistoryItem(activeSession.userId, payload, result);
      const mergedLocalHistory = mergeHistoryItems(
        [localItem],
        readStoredHistory(activeSession.userId),
      );
      writeStoredHistory(activeSession.userId, mergedLocalHistory);
      setHistory(mergedLocalHistory);

      const historyResponse = await fetch(
        `/api/history?user_id=${encodeURIComponent(activeSession.userId)}&limit=10`,
        {
          cache: "no-store",
        },
      );

      if (historyResponse.ok) {
        const historyResult = (await historyResponse.json()) as { items?: HistoryItem[] };
        const mergedItems = mergeHistoryItems(
          historyResult.items ?? [],
          readStoredHistory(activeSession.userId),
        );
        writeStoredHistory(activeSession.userId, mergedItems);
        setHistory(mergedItems);
      }
    } catch {
      const fallbackAssessment = analyzeDrowsiness(payload, "local-browser-fallback");
      const localItem = buildHistoryItem(activeSession.userId, payload, fallbackAssessment);
      const mergedLocalHistory = mergeHistoryItems(
        [localItem],
        readStoredHistory(activeSession.userId),
      );
      writeStoredHistory(activeSession.userId, mergedLocalHistory);
      startTransition(() => {
        setAssessment(fallbackAssessment);
        setCueProcessingComplete(false);
        setCaptureNotice("Snapshot capture failed before it could be stored.");
        setHistory(mergedLocalHistory);
      });
    } finally {
      setCapturePending(false);
    }
  }

  useEffect(() => {
    if (stage !== "calibrating" && stage !== "active") {
      return;
    }

    const intervalId = window.setInterval(() => {
      analyzeFrame();
    }, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [stage]);

  useEffect(() => {
    if (stage !== "active") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void submitForAnalysis();
    }, ANALYSIS_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [stage]);

  useEffect(() => {
    if (!sessionReady || !sessionUserId) {
      return;
    }

    void fetchHistory();
  }, [sessionReady, sessionUserId]);

  useEffect(() => {
    if (!sessionReady || typeof window === "undefined") {
      return;
    }

    const helpSeen = window.localStorage.getItem(
      getHelpDialogStorageKey(sessionUserId || "guest"),
    );

    if (!helpSeen) {
      setHelpDialogOpen(true);
    }
  }, [sessionReady, sessionUserId]);

  useEffect(() => {
    if (!commentaryRequestKey || commentaryConfidence === null || commentaryStatus === null) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setScoreCommentaryLoading(true);

      try {
        const response = await fetch("/api/score-commentary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confidence: commentaryConfidence,
            score: commentaryScore,
            status: commentaryStatus,
          }),
        });

        if (!response.ok) {
          throw new Error(`Commentary returned ${response.status}`);
        }

        const result = (await response.json()) as {
          provider?: string;
          text?: string;
        };

        if (!cancelled && result.text) {
          setScoreCommentary(result.text);
          setScoreCommentaryProvider(result.provider ?? "local-fallback");
        }
      } catch {
        if (!cancelled) {
          setScoreCommentary(
            "That score came back with a little personality. One more clean capture and this monitor might start acting like your toughest critic.",
          );
          setScoreCommentaryProvider("local-fallback");
        }
      } finally {
        if (!cancelled) {
          setScoreCommentaryLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [commentaryConfidence, commentaryRequestKey, commentaryScore, commentaryStatus]);

  useEffect(() => {
    if (stage === "active") {
      queueReactionCueRef.current();
      return clearReactionTimers;
    }

    clearReactionTimers();
  }, [stage]);

  useEffect(() => {
    const stored = getStoredSession();

    if (stored) {
      applySession(stored);
      setSessionReady(true);
      return;
    }

    if (requireSession) {
      router.replace("/login");
      return;
    }

    setSessionReady(true);
  }, [requireSession, router]);

  useEffect(() => {
    return () => {
      clearReactionTimers();
      stopMediaStream();
    };
  }, []);

  const visionSessionActive = stage === "calibrating" || stage === "active";

  useEffect(() => {
    if (!visionSessionActive) {
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      setVisionEngine("heuristic");
      return;
    }

    let cancelled = false;
    setVisionEngine("loading");

    void (async () => {
      const lm = await createFaceLandmarker();
      if (cancelled) {
        lm?.close();
        return;
      }
      faceLandmarkerRef.current = lm;
      setVisionEngine(lm ? "mediapipe" : "heuristic");
    })();

    return () => {
      cancelled = true;
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
    };
  }, [visionSessionActive]);

  async function startMonitoring() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support webcam access.");
      setStage("error");
      return;
    }

    resetSessionState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStage("calibrating");
    } catch (error) {
      stopMediaStream();
      setCameraError(
        error instanceof Error
          ? error.message
          : "Camera permission was denied or no webcam is available.",
      );
      setStage("error");
    }
  }

  const stageLabel =
    stage === "idle"
      ? "Idle"
      : stage === "starting"
        ? "Starting"
        : stage === "calibrating"
          ? "Calibrating"
          : stage === "active"
            ? "Monitoring"
            : "Camera error";

  const assessmentTone =
    assessment?.status === "NOT SAFE"
      ? "text-[var(--risk)]"
      : assessment?.status === "SAFE"
        ? "text-[var(--safe)]"
        : "text-slate-950";
  const stageBadgeVariant =
    stage === "error"
      ? "danger"
      : stage === "active"
        ? "safe"
        : stage === "calibrating"
          ? "warn"
          : "default";
  const providerBadgeVariant =
    assessment?.status === "NOT SAFE"
      ? "danger"
      : assessment?.status === "SAFE"
        ? "safe"
        : "default";
  const visionEngineLabel =
    visionEngine === "mediapipe"
      ? "MediaPipe | face landmarks | EAR"
      : visionEngine === "loading"
        ? "Loading vision model..."
        : "Heuristic vision fallback";
  const stageDescription =
    stage === "idle"
      ? "Start a session to calibrate the webcam and establish your baseline."
      : stage === "starting"
        ? "Connecting to the webcam and preparing the monitor."
        : stage === "calibrating"
          ? "Hold steady while the monitor learns your eye and reaction baseline."
          : stage === "active"
            ? "Live drowsiness analysis is running with reaction prompts and rolling metrics."
            : "The monitor hit a camera issue. You can restart after fixing permissions.";
  const captureButtonEnabled = stage === "active" && reactionCueVisible && !capturePending;
  const cueBannerText = capturePending
    ? "Processing capture..."
    : captureButtonEnabled
      ? "Ready to capture"
      : reactionLabel;
  const confidenceHistory = useMemo(() => {
    const groupedHistory = new Map<
      string,
      {
        fullLabel: string;
        id: string;
        label: string;
        points: Array<{
          confidence: number;
          fullLabel: string;
          id: string;
        }>;
        subLabel: string;
      }
    >();

    [...history]
      .sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      )
      .forEach((item, index) => {
        const createdAt = new Date(item.created_at);
        const groupKey = [
          createdAt.getFullYear(),
          createdAt.getMonth(),
          createdAt.getDate(),
          createdAt.getHours(),
          createdAt.getMinutes(),
        ].join("-");
        const existingGroup = groupedHistory.get(groupKey) ?? {
          id: groupKey,
          label: createdAt.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          }),
          subLabel: createdAt.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          fullLabel: createdAt.toLocaleString(),
          points: [],
        };

        existingGroup.points.push({
          id: `${item.id}-${item.created_at}-${index}`,
          confidence: Math.round(item.confidence * 100),
          fullLabel: createdAt.toLocaleString(),
        });
        groupedHistory.set(groupKey, existingGroup);
      });

    const groups = [...groupedHistory.values()];
    const groupSpan = 690 - 54;
    const labelStep = groups.length > 6 ? Math.ceil(groups.length / 6) : 1;

    const plottedGroups = groups.map((group, index) => ({
      ...group,
      x: groups.length === 1 ? 372 : 54 + (index / (groups.length - 1)) * groupSpan,
      showLabel:
        groups.length <= 6 ||
        index === 0 ||
        index === groups.length - 1 ||
        index % labelStep === 0,
    }));

    const points = plottedGroups.flatMap((group) =>
      group.points.map((point) => ({
        ...point,
        label: group.label,
        subLabel: group.subLabel,
        x: group.x,
        y: 20 + ((100 - point.confidence) / 100) * 180,
      })),
    );

    return {
      groups: plottedGroups,
      points,
      recentPoints: [...points].slice(-3).reverse(),
    };
  }, [history]);
  const profileInitials = (sessionName || sessionEmail || "Driver")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "DR";

  function handleSignOut() {
    clearStoredSession();
    router.push("/login");
  }

  function handleHelpDialogChange(open: boolean) {
    setHelpDialogOpen(open);

    if (!open && typeof window !== "undefined") {
      window.localStorage.setItem(
        getHelpDialogStorageKey(sessionUserId || "guest"),
        "seen",
      );
    }
  }

  if (!sessionReady) {
    return (
      <main className="flex min-h-[40dvh] w-full items-center justify-center py-8">
        <div className="rounded-full border border-slate-200 bg-white px-5 py-3 font-mono text-xs uppercase tracking-[0.25em] text-slate-500 shadow-sm">
          Preparing Session
        </div>
      </main>
    );
  }

  return (
    <Dialog onOpenChange={handleHelpDialogChange} open={helpDialogOpen}>
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
        <Card className="mb-4 rounded-[1.4rem] border-slate-200 bg-slate-100/90 shadow-none">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500 sm:text-[11px]">
                AI Read
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700 sm:text-[15px]">
                {scoreCommentaryLoading ? "Thinking up a quick read..." : scoreCommentary}
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              {scoreCommentaryProvider.includes("gemini") ? "Gemini" : "SaS-GPT"}
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[var(--panel-strong)] p-6 shadow-sm">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />

        <div className="mb-6 grid grid-cols-[44px_1fr_44px] items-center">
          <div />
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500 sm:text-xs">
              VIN Number
            </p>
            <p className="mt-2 text-base font-semibold tracking-[0.08em] text-slate-950 sm:text-lg">
              {sessionVin || "--"}
            </p>
          </div>
          <div className="justify-self-end">
            <Button
              aria-label="Open profile and sign out"
              className="size-11 rounded-full border border-slate-200 bg-white p-0 text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={handleSignOut}
              size="icon"
              title="Sign out"
              type="button"
              variant="outline"
            >
              <span className="text-sm font-semibold tracking-[0.08em]">{profileInitials}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500 sm:text-xs sm:tracking-[0.35em]">
                  {visionEngineLabel}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">
                    Drive Awake Monitor
                  </h1>
                  <DialogTrigger asChild>
                    <button
                      aria-label="How to use the app"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950"
                      type="button"
                    >
                      <FontAwesomeIcon className="text-base" icon={faCircleQuestion} />
                    </button>
                  </DialogTrigger>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  {stageDescription}
                </p>
              </div>

              <Badge
                className="shrink-0 self-start px-3 py-1.5 text-[10px] tracking-[0.2em] sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.25em]"
                variant={stageBadgeVariant}
              >
                {stageLabel}
              </Badge>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,44rem)_10rem] lg:items-start lg:justify-center">
              <div className="order-2 mx-auto w-full max-w-4xl lg:order-1">
                <Card className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[#171411] shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
                  <video
                    ref={videoRef}
                    autoPlay
                    className="aspect-video h-full w-full object-cover [transform:scaleX(-1)]"
                    muted
                    playsInline
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),transparent_22%,transparent_70%,rgba(0,0,0,0.28))]" />
                  <div className="absolute left-3 top-4 flex flex-wrap gap-2">
                    <div className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/90">
                      Camera
                    </div>
                    <div className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/90">
                      {visionEngine === "mediapipe"
                        ? "MediaPipe"
                        : visionEngine === "loading"
                          ? "Vision..."
                          : "Heuristic"}
                    </div>
                  </div>
                  <div className="absolute right-3 top-4">
                    <div className="rounded-full bg-black/45 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-white/85">
                      Live metrics only
                    </div>
                  </div>
                  <AnimatePresence mode="wait">
                    {cueProcessingComplete ? (
                      <motion.div
                        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                        className="absolute right-3 top-14 flex size-11 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-500 text-white shadow-[0_12px_28px_rgba(34,197,94,0.35)]"
                        exit={{ opacity: 0, scale: 0.6, x: 20, y: -20 }}
                        initial={{ opacity: 0, scale: 0.45, x: 20, y: -20 }}
                        key="cue-done"
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      >
                        <FontAwesomeIcon className="text-base" icon={faCheck} />
                      </motion.div>
                    ) : (
                      <motion.div
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className={`absolute left-3 right-3 top-16 rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-sm ${
                          captureButtonEnabled
                            ? "border-emerald-300/50 bg-emerald-500/25 text-white"
                            : "border-white/10 bg-black/35 text-white/88"
                        }`}
                        exit={{ opacity: 0, scale: 0.6, x: -100, y: 120 }}
                        initial={{ opacity: 0, scale: 0.92, y: -16 }}
                        key="cue-card"
                        transition={{ duration: 0.35, ease: "easeOut" }}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/80">
                          Cue
                        </p>
                        <p className="mt-1">{cueBannerText}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </div>

              <div className="order-1 flex flex-col items-stretch justify-center gap-3 lg:order-2">
                <Button
                  className="bg-[linear-gradient(135deg,#1f7a4f,#33a56b)] text-white shadow-[0_16px_35px_rgba(31,122,79,0.28)] ring-1 ring-emerald-200/70 hover:brightness-105"
                  onClick={() => void startMonitoring()}
                  type="button"
                >
                  {stage === "idle" || stage === "error" ? "Start" : "Restart"}
                </Button>

                <div className="flex flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <Button
                    aria-label="Capture when cue is ready"
                    className={`size-24 rounded-full border-4 p-0 shadow-[0_16px_40px_rgba(201,113,50,0.28)] transition-all sm:size-28 ${
                      captureButtonEnabled
                        ? "border-emerald-300 bg-[var(--safe)] text-white hover:bg-[var(--safe)]/92"
                        : "border-[#f2b17f] bg-[var(--accent)] text-white/95 hover:bg-[var(--accent)]"
                    }`}
                    disabled={!captureButtonEnabled}
                    onClick={() => void handleCueCapture()}
                    size="icon"
                    type="button"
                  >
                    <FontAwesomeIcon className="text-3xl sm:text-4xl" icon={faCamera} />
                  </Button>
                  <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                    {capturePending
                      ? "Capturing"
                      : captureButtonEnabled
                        ? "Cue ready"
                        : "Wait for cue"}
                  </p>
                </div>

                <div className="grid flex-1 gap-3 lg:flex-none">
                  <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-none">
                    <CardContent className="p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Last
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {lastReactionTime ? `${lastReactionTime.toFixed(2)}s` : "--"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-none">
                    <CardContent className="p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Rolling
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {metrics.reactionTime.toFixed(2)}s
                      </p>
                    </CardContent>
                  </Card>
                  <Button onClick={stopMonitoring} type="button" variant="secondary">
                    Stop
                  </Button>
                </div>
              </div>
            </div>

            {(cameraError || submissionError || captureNotice) && (
              <Alert className="rounded-xl sm:rounded-2xl">
                <AlertTitle>Monitor Notice</AlertTitle>
                <AlertDescription>
                  {cameraError ?? submissionError ?? captureNotice}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <MetricCard
                hint={
                  visionEngine === "mediapipe"
                    ? "Drowsiness proxy from Eye Aspect Ratio vs your calibrated open-eye baseline."
                    : "Approximate closure from eye-region luminance contrast (no face model)."
                }
                label="Eye Closure"
                tone={metricTone(metrics.eyeClosure, "direct")}
                value={formatPercent(metrics.eyeClosure)}
              />
              <MetricCard
                hint="Full blink cycles (eye closed -> open) in the last 60 seconds."
                label="Blink Rate"
                tone={metricTone(metrics.blinkRate / 32, "direct")}
                value={`${metrics.blinkRate.toFixed(1)}/min`}
              />
              <MetricCard
                hint={
                  visionEngine === "mediapipe"
                    ? "Head roll from the outer eye-corner line vs horizontal (landmark geometry)."
                    : "Tilt estimated from dark-centroid alignment in fixed eye ROIs."
                }
                label="Head Tilt"
                tone={metricTone(metrics.headTilt / 25, "direct")}
                value={`${metrics.headTilt.toFixed(1)} deg`}
              />
              <MetricCard
                hint="Rolling average from the live cue-response test."
                label="Reaction Time"
                tone={metricTone(metrics.reactionTime / 1.4, "direct")}
                value={`${metrics.reactionTime.toFixed(2)}s`}
              />
            </div>

            <Card className="rounded-[1.35rem] border-slate-200 bg-white sm:rounded-[1.65rem]">
              <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-6">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:text-xs sm:tracking-[0.25em]">
                    Analyzer Result
                  </p>
                  <CardTitle className={`mt-2 text-xl sm:mt-3 sm:text-2xl ${assessmentTone}`}>
                    {assessment?.status ?? "Awaiting data"}
                  </CardTitle>
                </div>
                <Card className="shrink-0 rounded-xl border-slate-200 bg-slate-50 shadow-none sm:rounded-2xl">
                  <CardContent className="px-3 py-2 text-right sm:px-4 sm:py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                      Confidence
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-slate-950 sm:mt-1 sm:text-2xl">
                      {assessment ? formatConfidence(assessment.confidence) : "--"}
                    </p>
                  </CardContent>
                </Card>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
                <Progress
                  indicatorClassName={
                    assessment?.status === "NOT SAFE" ? "bg-[var(--risk)]" : "bg-[var(--safe)]"
                  }
                  value={Number(((assessment?.score ?? 0) * 100).toFixed(0))}
                />

                <div className="mt-4 grid gap-2 sm:mt-6 sm:gap-3">
                  {(assessment?.reasons ?? [
                    "Start a monitoring session to generate browser-side features and call the analysis endpoint.",
                  ]).map((reason) => (
                    <Card className="rounded-xl border-slate-200 bg-slate-50 shadow-none sm:rounded-2xl" key={reason}>
                      <CardContent className="px-3 py-2.5 text-xs leading-5 text-slate-700 sm:px-4 sm:py-3 sm:text-sm sm:leading-6">
                        {reason}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-3">
                  <Badge variant={providerBadgeVariant}>
                    Provider: {assessment?.provider ?? "pending"}
                  </Badge>
                  <Badge variant="outline">Brightness: {formatPercent(metrics.brightness)}</Badge>
                  <Badge variant="outline">
                    {visionEngine === "mediapipe" ? "EAR baseline" : "Contrast baseline"}:{" "}
                    {baselineOpennessRef.current
                      ? visionEngine === "mediapipe"
                        ? baselineOpennessRef.current.toFixed(3)
                        : baselineOpennessRef.current.toFixed(1)
                      : "--"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.35rem] border-slate-200 bg-white sm:rounded-[1.65rem]">
              <CardHeader className="space-y-1 p-4 sm:p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:text-xs sm:tracking-[0.25em]">
                  Capture History
                </p>
                <CardDescription className="text-xs leading-relaxed sm:text-sm">
                  Newest captures first.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                {historyLoading ? (
                  <p className="text-sm text-slate-600">Loading history...</p>
                ) : historyError ? (
                  <p className="text-sm text-[var(--warn)]">{historyError}</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No captures yet. Use the green capture flow to save confidence snapshots here.
                  </p>
                ) : (
                  <div className="-mx-1 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 sm:mx-0 sm:rounded-[1.25rem]">
                    <table className="w-full min-w-[340px] text-left text-xs sm:text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            Time
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            Confidence
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((item) => (
                          <tr className="border-t border-slate-200" key={item.id}>
                            <td className="px-3 py-3 text-slate-700">
                              {new Date(item.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {Math.round(item.confidence * 100)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Accordion className="mt-1">
              <AccordionItem open>
                <AccordionTrigger>
                  <span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Confidence Graph
                    </span>
                    <span className="mt-1 block text-base font-semibold text-slate-950">
                      Confidence over time
                    </span>
                  </span>
                  <span className="text-slate-400 transition-transform group-open:rotate-180">
                    ^
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {confidenceHistory.points.length === 0 ? (
                    <p className="text-sm text-slate-600">
                      Capture a few readings and the confidence line graph will appear here.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <svg
                          aria-label="Confidence over time line graph"
                          className="h-56 w-full"
                          role="img"
                          viewBox="0 0 720 240"
                        >
                          {[0, 25, 50, 75, 100].map((tick) => {
                            const y = 20 + ((100 - tick) / 100) * 180;
                            return (
                              <g key={tick}>
                                <line
                                  stroke="rgba(148,163,184,0.28)"
                                  strokeDasharray="4 6"
                                  strokeWidth="1"
                                  x1="54"
                                  x2="690"
                                  y1={y}
                                  y2={y}
                                />
                                <text
                                  fill="#64748b"
                                  fontSize="11"
                                  textAnchor="end"
                                  x="44"
                                  y={y + 4}
                                >
                                  {tick}%
                                </text>
                              </g>
                            );
                          })}
                          {confidenceHistory.groups.map((group) => (
                            <g key={group.id}>
                              <line
                                stroke="rgba(148,163,184,0.2)"
                                strokeWidth="1"
                                x1={group.x}
                                x2={group.x}
                                y1="20"
                                y2="200"
                              />
                              {group.showLabel ? (
                                <>
                                  <text
                                    fill="#0f172a"
                                    fontSize="11"
                                    textAnchor="middle"
                                    x={group.x}
                                    y={218}
                                  >
                                    {group.label}
                                  </text>
                                  <text
                                    fill="#94a3b8"
                                    fontSize="10"
                                    textAnchor="middle"
                                    x={group.x}
                                    y={231}
                                  >
                                    {group.subLabel}
                                  </text>
                                </>
                              ) : null}
                            </g>
                          ))}
                          {confidenceHistory.points.length > 1 ? (
                            <polyline
                              fill="none"
                              points={confidenceHistory.points
                                .map((point) => `${point.x},${point.y}`)
                                .join(" ")}
                              stroke="#1f7a4f"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="4"
                            />
                          ) : null}
                          {confidenceHistory.points.map((point) => {
                            return (
                              <g key={point.id}>
                                <circle cx={point.x} cy={point.y} fill="rgba(31,122,79,0.15)" r="11" />
                                <circle cx={point.x} cy={point.y} fill="#1f7a4f" r="6" />
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {confidenceHistory.recentPoints.map((point) => (
                          <Card
                            className="rounded-xl border-slate-200 bg-slate-50 shadow-none"
                            key={point.id}
                          >
                            <CardContent className="p-4">
                              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                {point.label}
                              </p>
                              <p className="mt-2 text-lg font-semibold text-slate-950">
                                {point.confidence}%
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{point.fullLabel}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
        </div>

        <canvas ref={canvasRef} className="hidden" />
        </Card>
      </main>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How to use Drive Awake</DialogTitle>
          <DialogDescription>
            A quick camera check before you save a confidence reading.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Card className="rounded-2xl border-slate-200 bg-slate-50 shadow-none">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                1. Start
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Press the green Start button to turn on your camera and finish calibration.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 bg-slate-50 shadow-none">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                2. Wait
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Watch the cue inside the viewfinder. When it turns ready, the camera button becomes green.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 bg-slate-50 shadow-none">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                3. Capture
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Tap the green camera button to record the reading and save the confidence result.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200 bg-slate-50 shadow-none">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                4. Review
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Check the confidence panel, saved history, and graph below the camera view.
              </p>
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button onClick={() => handleHelpDialogChange(false)} type="button">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
