"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  analyzeDrowsiness,
  clamp,
  type DrowsinessAssessment,
  type DrowsinessFeatures,
} from "@/lib/drowsiness";
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
    <Card className="rounded-xl backdrop-blur-sm sm:rounded-[1.35rem]">
      <CardContent className="p-3 sm:p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-black/45 sm:text-xs sm:tracking-[0.25em]">
          {label}
        </p>
        <p className={`mt-2 text-2xl font-semibold sm:mt-3 sm:text-3xl ${tone}`}>{value}</p>
        <p className="mt-1.5 text-[11px] leading-snug text-black/55 sm:mt-2 sm:text-sm sm:leading-6">
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
  const [lastReactionTime, setLastReactionTime] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState("Driver");
  const [sessionEmail, setSessionEmail] = useState("");
  const [sessionUserId, setSessionUserId] = useState("");
  const [sessionVin, setSessionVin] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [visionEngine, setVisionEngine] = useState<VisionEngine>("heuristic");

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

    if (stage !== "calibrating" && stage !== "active") {
      return;
    }

    reactionCueTimeoutRef.current = window.setTimeout(() => {
      reactionStartedAtRef.current = performance.now();
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
      setReactionLabel("Loading MediaPipe face model…");
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
        setReactionLabel("Align your face in the frame…");
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
      setHistory(result.items ?? []);
    } catch {
      setHistory([]);
      setHistoryError("History is unavailable until the Flask and Supabase connection is active.");
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
        setCaptureNotice(
          result.saved_capture
            ? "Snapshot captured and added to this user's history."
            : "Snapshot analyzed, but backend storage is not connected yet.",
        );
      });

      const historyResponse = await fetch(
        `/api/history?user_id=${encodeURIComponent(activeSession.userId)}&limit=10`,
        {
          cache: "no-store",
        },
      );

      if (historyResponse.ok) {
        const historyResult = (await historyResponse.json()) as { items?: HistoryItem[] };
        setHistory(historyResult.items ?? []);
      }
    } catch {
      startTransition(() => {
        setAssessment(analyzeDrowsiness(payload, "local-browser-fallback"));
        setCaptureNotice("Snapshot capture failed before it could be stored.");
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
    if (stage === "calibrating" || stage === "active") {
      clearReactionTimers();

      reactionCueTimeoutRef.current = window.setTimeout(() => {
        reactionStartedAtRef.current = performance.now();
        setReactionCueVisible(true);
        setReactionLabel("Cue live. Tap the reaction pad now.");

        reactionExpireTimeoutRef.current = window.setTimeout(() => {
          if (reactionStartedAtRef.current !== null) {
            registerReactionSample(2.5, "Reaction cue missed. Penalty sample recorded.");
            queueReactionCueRef.current();
          }
        }, REACTION_TIMEOUT_MS);
      }, getRandomDelay());

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
    assessment?.status === "NOT SAFE" ? "text-[var(--risk)]" : "text-[var(--safe)]";
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

  function handleSignOut() {
    clearStoredSession();
    router.push("/login");
  }

  if (!sessionReady) {
    return (
      <main className="flex min-h-[40dvh] w-full items-center justify-center py-8">
        <div className="rounded-full border border-[var(--line)] bg-white/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.25em] text-white/55">
          Preparing Session
        </div>
      </main>
    );
  }

  return (
    <main className="flex w-full flex-col py-2 sm:py-3">
      <Card className="relative overflow-hidden rounded-[1.65rem] border border-[var(--line)]/60 bg-[var(--panel-strong)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:rounded-[2rem] sm:p-5">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/45 to-transparent sm:inset-x-8" />

        <div className="mb-4 flex flex-col gap-3 rounded-[1.2rem] border border-[var(--line)] bg-white/50 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <Badge className="w-fit" variant="outline">
              Signed In
            </Badge>
            <span className="truncate text-xs text-black/65 sm:text-sm">
              {sessionName ?? "Driver"}
              {sessionEmail ? ` · ${sessionEmail}` : ""}
              {sessionVin ? ` · VIN ${sessionVin}` : ""}
            </span>
          </div>
          <div className="flex gap-2">
            <Button asChild className="flex-1 sm:flex-none" size="sm" variant="secondary">
              <Link href="/">Home</Link>
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={handleSignOut} size="sm" variant="outline">
              Sign Out
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-black/45 sm:text-xs sm:tracking-[0.35em]">
                  {visionEngine === "mediapipe"
                    ? "MediaPipe · face landmarks · EAR"
                    : visionEngine === "loading"
                      ? "Loading vision model…"
                      : "Heuristic vision fallback"}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-black sm:text-3xl">
                  Drive Awake Monitor
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-black/60">
                  Live face mesh, EAR, blinks, head tilt, and reaction checks—optimized for a phone-sized layout.
                </p>
              </div>

              <Badge
                className="shrink-0 self-start px-3 py-1.5 text-[10px] tracking-[0.2em] sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.25em]"
                variant={stageBadgeVariant}
              >
                {stageLabel}
              </Badge>
            </div>

            <div className="flex flex-col gap-4">
              <Card className="relative overflow-hidden rounded-[1.35rem] bg-[#171411] sm:rounded-[1.65rem]">
                <video
                  ref={videoRef}
                  autoPlay
                  className="aspect-video h-full w-full object-cover [transform:scaleX(-1)]"
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),transparent_30%,transparent_70%,rgba(0,0,0,0.16))]" />
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.03)_2px,transparent_2px,transparent_8px)] opacity-30" />
                <div className="absolute left-2 top-2 flex flex-wrap gap-1.5 sm:left-4 sm:top-4 sm:gap-2">
                  <div className="rounded-full bg-black/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/85 sm:px-3 sm:py-2 sm:text-[11px] sm:tracking-[0.25em]">
                    Webcam
                  </div>
                  <div className="rounded-full bg-black/50 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/85 sm:px-3 sm:py-2 sm:text-[11px] sm:tracking-[0.25em]">
                    {visionEngine === "mediapipe"
                      ? "MediaPipe"
                      : visionEngine === "loading"
                        ? "Vision…"
                        : "Heuristic"}
                  </div>
                </div>
                <div className="absolute bottom-2 left-2 right-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] leading-snug text-white/82 backdrop-blur-sm sm:bottom-4 sm:left-4 sm:right-4 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                  No frames stored—only live metrics in your browser.
                </div>
              </Card>

              <Card className="rounded-[1.35rem] sm:rounded-[1.65rem]">
                <CardHeader className="p-4 pb-0 sm:p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-black/45 sm:text-xs sm:tracking-[0.3em]">
                    Reaction Test
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-5">
                  <Button
                    className="min-h-[10.5rem] rounded-[1.25rem] text-center text-base font-semibold sm:min-h-44 sm:rounded-[1.5rem] sm:text-lg"
                    onClick={() => handleReactionPad()}
                    variant={reactionCueVisible ? "accent" : "secondary"}
                    size="lg"
                    type="button"
                  >
                    {reactionCueVisible ? "Tap Now" : "Waiting for Cue"}
                  </Button>
                  <p className="text-sm leading-6 text-black/60">{reactionLabel}</p>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <Card className="rounded-xl border-0 bg-white/70 shadow-none sm:rounded-2xl">
                      <CardContent className="p-3 sm:p-4">
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/40 sm:text-[11px] sm:tracking-[0.25em]">
                          Last
                        </p>
                        <p className="mt-1 text-xl font-semibold text-black sm:mt-2 sm:text-2xl">
                          {lastReactionTime ? `${lastReactionTime.toFixed(2)}s` : "--"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border-0 bg-white/70 shadow-none sm:rounded-2xl">
                      <CardContent className="p-3 sm:p-4">
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/40 sm:text-[11px] sm:tracking-[0.25em]">
                          Rolling
                        </p>
                        <p className="mt-1 text-xl font-semibold text-black sm:mt-2 sm:text-2xl">
                          {metrics.reactionTime.toFixed(2)}s
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                className="w-full sm:w-auto"
                onClick={() => void startMonitoring()}
                type="button"
              >
                {stage === "idle" || stage === "error" ? "Start Monitoring" : "Restart Session"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void captureCurrentSnapshot()}
                type="button"
                variant="accent"
              >
                {capturePending ? "Capturing Snapshot" : "Capture Snapshot"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={stopMonitoring}
                variant="secondary"
                type="button"
              >
                Stop
              </Button>
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
                hint="Full blink cycles (eye closed → open) in the last 60 seconds."
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

            <Card className="rounded-[1.35rem] sm:rounded-[1.65rem]">
              <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-6">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45 sm:text-xs sm:tracking-[0.25em]">
                    Analyzer Result
                  </p>
                  <CardTitle className={`mt-2 text-xl sm:mt-3 sm:text-2xl ${assessmentTone}`}>
                    {assessment?.status ?? "Awaiting data"}
                  </CardTitle>
                </div>
                <Card className="shrink-0 rounded-xl border-0 bg-white/70 shadow-none sm:rounded-2xl">
                  <CardContent className="px-3 py-2 text-right sm:px-4 sm:py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40 sm:text-[11px] sm:tracking-[0.2em]">
                      Confidence
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-black sm:mt-1 sm:text-2xl">
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
                    <Card className="rounded-xl bg-white/65 shadow-none sm:rounded-2xl" key={reason}>
                      <CardContent className="px-3 py-2.5 text-xs leading-5 text-black/62 sm:px-4 sm:py-3 sm:text-sm sm:leading-6">
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

            <Card className="rounded-[1.35rem] sm:rounded-[1.65rem]">
              <CardHeader className="space-y-1 p-4 sm:p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45 sm:text-xs sm:tracking-[0.25em]">
                  Capture History
                </p>
                <CardDescription className="text-xs leading-relaxed sm:text-sm">
                  Newest captures first. Swipe horizontally on small screens.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
                {historyLoading ? (
                  <p className="text-sm text-black/60">Loading history...</p>
                ) : historyError ? (
                  <p className="text-sm text-[var(--warn)]">{historyError}</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-black/60">
                    No captures yet. Use Capture Snapshot to save the current metrics for this user.
                  </p>
                ) : (
                  <div className="-mx-1 overflow-x-auto overflow-y-hidden rounded-xl border border-[var(--line)] sm:mx-0 sm:rounded-[1.25rem]">
                    <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
                      <thead className="bg-white/8">
                        <tr>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Time
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Status
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Confidence
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Eye
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Blink
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Tilt
                          </th>
                          <th className="px-3 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black/55">
                            Reaction
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((item) => (
                          <tr className="border-t border-[var(--line)]" key={item.id}>
                            <td className="px-3 py-3 text-black/72">
                              {new Date(item.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-black/80">{item.status}</td>
                            <td className="px-3 py-3 text-black/72">
                              {Math.round(item.confidence * 100)}%
                            </td>
                            <td className="px-3 py-3 text-black/72">
                              {Math.round(item.eye_closure * 100)}%
                            </td>
                            <td className="px-3 py-3 text-black/72">
                              {item.blink_rate.toFixed(1)}
                            </td>
                            <td className="px-3 py-3 text-black/72">
                              {item.head_tilt.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-black/72">
                              {item.reaction_time.toFixed(2)}s
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </Card>
    </main>
  );
}
