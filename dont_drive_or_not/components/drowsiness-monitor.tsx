"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  analyzeDrowsiness,
  clamp,
  type DrowsinessAssessment,
  type DrowsinessFeatures,
} from "@/lib/drowsiness";
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
    <Card className="rounded-[1.6rem] backdrop-blur-sm">
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-black/45">{label}</p>
        <p className={`mt-3 text-3xl font-semibold ${tone}`}>{value}</p>
        <p className="mt-2 text-sm leading-6 text-black/55">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function DrowsinessMonitor() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
    const fullFrame = analyzeRegion(
      data,
      frameWidth,
      frameHeight,
      0,
      frameWidth,
      0,
      frameHeight,
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
          `Calibrating baseline ${calibrationSamplesRef.current.length}/${CALIBRATION_FRAMES}.`,
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
    const brightness = clamp(fullFrame.mean / 255);

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
      feature_source: "browser-heuristic-v1",
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
    return () => {
      clearReactionTimers();
      stopMediaStream();
    };
  }, []);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
      <Card className="relative overflow-hidden rounded-[2rem] bg-[var(--panel-strong)] p-6 shadow-[0_25px_80px_rgba(80,48,24,0.12)] backdrop-blur-xl sm:p-8">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent" />

        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.9fr]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="font-mono text-xs uppercase tracking-[0.35em] text-black/45">
                  Browser Heuristic Starter
                </p>
                <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-black sm:text-5xl">
                  Drive Awake Monitor
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-black/65 sm:text-lg">
                  Live webcam capture, lightweight feature extraction, reaction testing,
                  and a stable analyzer contract ready for a future Python model.
                </p>
              </div>

              <Badge
                className="px-4 py-2 text-xs tracking-[0.25em]"
                variant={stageBadgeVariant}
              >
                {stageLabel}
              </Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.45fr_0.9fr]">
              <Card className="relative overflow-hidden rounded-[1.8rem] bg-[#171411]">
                <video
                  ref={videoRef}
                  autoPlay
                  className="aspect-video h-full w-full object-cover [transform:scaleX(-1)]"
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),transparent_30%,transparent_70%,rgba(0,0,0,0.16))]" />
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.03)_2px,transparent_2px,transparent_8px)] opacity-30" />
                <div className="absolute left-4 top-4 rounded-full bg-black/45 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/85">
                  Webcam
                </div>
                <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/82 backdrop-blur-sm">
                  No frames are stored. This starter only works with ephemeral browser-side
                  metrics.
                </div>
              </Card>

              <Card className="rounded-[1.8rem]">
                <CardHeader className="p-5 pb-0">
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-black/45">
                    Reaction Test
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 p-5">
                  <Button
                    className="min-h-44 rounded-[1.5rem] text-center text-lg font-semibold"
                    onClick={() => handleReactionPad()}
                    variant={reactionCueVisible ? "accent" : "secondary"}
                    size="lg"
                    type="button"
                  >
                    {reactionCueVisible ? "Tap Now" : "Waiting for Cue"}
                  </Button>
                  <p className="text-sm leading-6 text-black/60">{reactionLabel}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="rounded-2xl border-0 bg-white/70 shadow-none">
                      <CardContent className="p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-black/40">
                          Last
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-black">
                          {lastReactionTime ? `${lastReactionTime.toFixed(2)}s` : "--"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="rounded-2xl border-0 bg-white/70 shadow-none">
                      <CardContent className="p-4">
                        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-black/40">
                          Rolling
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-black">
                          {metrics.reactionTime.toFixed(2)}s
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => void startMonitoring()}
                type="button"
              >
                {stage === "idle" || stage === "error" ? "Start Monitoring" : "Restart Session"}
              </Button>
              <Button
                onClick={stopMonitoring}
                variant="secondary"
                type="button"
              >
                Stop
              </Button>
            </div>

            {(cameraError || submissionError) && (
              <Alert>
                <AlertTitle>Monitor Notice</AlertTitle>
                <AlertDescription>{cameraError ?? submissionError}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard
                hint="Approximate closure based on eye-region contrast."
                label="Eye Closure"
                tone={metricTone(metrics.eyeClosure, "direct")}
                value={formatPercent(metrics.eyeClosure)}
              />
              <MetricCard
                hint="Blink events counted across the last 60 seconds."
                label="Blink Rate"
                tone={metricTone(metrics.blinkRate / 32, "direct")}
                value={`${metrics.blinkRate.toFixed(1)}/min`}
              />
              <MetricCard
                hint="Estimated tilt from relative eye-band alignment."
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

            <Card className="rounded-[1.8rem]">
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.25em] text-black/45">
                    Analyzer Result
                  </p>
                  <CardTitle className={`mt-3 ${assessmentTone}`}>
                    {assessment?.status ?? "Awaiting data"}
                  </CardTitle>
                </div>
                <Card className="rounded-2xl border-0 bg-white/70 shadow-none">
                  <CardContent className="px-4 py-3 text-right">
                    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/40">
                      Confidence
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-black">
                      {assessment ? formatConfidence(assessment.confidence) : "--"}
                    </p>
                  </CardContent>
                </Card>
              </CardHeader>
              <CardContent>
                <Progress
                  indicatorClassName={
                    assessment?.status === "NOT SAFE" ? "bg-[var(--risk)]" : "bg-[var(--safe)]"
                  }
                  value={Number(((assessment?.score ?? 0) * 100).toFixed(0))}
                />

                <div className="mt-6 grid gap-3">
                  {(assessment?.reasons ?? [
                    "Start a monitoring session to generate browser-side features and call the analysis endpoint.",
                  ]).map((reason) => (
                    <Card className="rounded-2xl bg-white/65 shadow-none" key={reason}>
                      <CardContent className="px-4 py-3 text-sm leading-6 text-black/62">
                        {reason}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Badge variant={providerBadgeVariant}>
                    Provider: {assessment?.provider ?? "pending"}
                  </Badge>
                  <Badge variant="outline">Brightness: {formatPercent(metrics.brightness)}</Badge>
                  <Badge variant="outline">
                    Eye Openness Baseline:{" "}
                    {baselineOpennessRef.current ? baselineOpennessRef.current.toFixed(1) : "--"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.8rem]">
              <CardHeader>
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-black/45">
                  Extension Points
                </p>
                <CardDescription>
                  The frontend now uses shadcn-style primitives, while the backend keeps a stable
                  contract for a future model swap.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-black/62">
                <p>
                  Swap the browser heuristic extractor for MediaPipe, OpenCV.js, or TF.js while
                  keeping the same payload shape.
                </p>
                <p>
                  Point <span className="font-mono">FLASK_API_URL</span> at the Python service to
                  proxy requests through a real backend model without changing the frontend fetch.
                </p>
                <p>
                  Persist only numeric features to Supabase once the data model is ready. No image
                  storage is required for this starter.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </Card>
    </main>
  );
}
