"use client";

import { useEffect, useRef, useState } from "react";
import { getOrCreateAnonymousUserId } from "../lib/anonymousId";
import {
  BLINK_WINDOW_MS,
  EYE_CLOSED_THRESHOLD,
  SAMPLE_INTERVAL_MS,
  estimateEyeClosure,
  estimateHeadTilt
} from "../lib/features";

export default function HomePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const reactionCueAtRef = useRef(null);
  const blinkEventsRef = useRef([]);
  const eyeStateRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [anonymousUserId, setAnonymousUserId] = useState(null);
  const [logReactionToDb, setLogReactionToDb] = useState(false);
  const [features, setFeatures] = useState({
    eye_closure: 0,
    blink_rate: 0,
    head_tilt: 0,
    reaction_time: 0.6
  });
  const [cueVisible, setCueVisible] = useState(false);
  const [apiResult, setApiResult] = useState(null);
  const [error, setError] = useState("");
  const [analyzePending, setAnalyzePending] = useState(false);

  useEffect(() => {
    setAnonymousUserId(getOrCreateAnonymousUserId());
  }, []);

  useEffect(() => {
    let stream;
    let interval;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setRunning(true);

        interval = setInterval(sampleFrame, SAMPLE_INTERVAL_MS);
      } catch (err) {
        setError(`Camera access failed: ${err.message}`);
      }
    }

    start();
    return () => {
      clearInterval(interval);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function sampleFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const eyeClosure = estimateEyeClosure(ctx, canvas.width, canvas.height);
    const headTilt = estimateHeadTilt(ctx, canvas.width, canvas.height);

    const closed = eyeClosure > EYE_CLOSED_THRESHOLD;
    if (closed !== eyeStateRef.current) {
      eyeStateRef.current = closed;
      if (!closed) {
        blinkEventsRef.current.push(Date.now());
      }
    }

    const now = Date.now();
    blinkEventsRef.current = blinkEventsRef.current.filter(
      (t) => now - t <= BLINK_WINDOW_MS
    );
    const blinkRate = blinkEventsRef.current.length;

    setFeatures((prev) => ({
      ...prev,
      eye_closure: Number(eyeClosure.toFixed(3)),
      blink_rate: blinkRate,
      head_tilt: Number(headTilt.toFixed(3))
    }));
  }

  function runReactionTest() {
    setCueVisible(false);
    const delay = 1000 + Math.random() * 2500;
    setTimeout(() => {
      reactionCueAtRef.current = performance.now();
      setCueVisible(true);
    }, delay);
  }

  function handleCueClick() {
    if (!reactionCueAtRef.current) return;
    const reaction = (performance.now() - reactionCueAtRef.current) / 1000;
    reactionCueAtRef.current = null;
    setCueVisible(false);
    setFeatures((prev) => ({
      ...prev,
      reaction_time: Number(reaction.toFixed(3))
    }));
  }

  async function submitForAnalysis() {
    setError("");
    setApiResult(null);
    setAnalyzePending(true);
    try {
      const body = {
        ...features,
        user_id: anonymousUserId,
        log_reaction_event: logReactionToDb
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setApiResult(json);
    } catch (err) {
      setError(`Analyze request failed: ${err.message}`);
    } finally {
      setAnalyzePending(false);
    }
  }

  const statusClass =
    apiResult?.status === "NOT SAFE"
      ? "badge danger"
      : apiResult?.status === "SAFE"
        ? "badge ok"
        : "badge muted";

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Driver safety monitor</h1>
          <p className="lede">
            Webcam sampling → lightweight features → Next.js proxies to Flask <code>/analyze</code>.
            No video is stored; only numbers go to the API (and optionally Supabase).
          </p>
        </div>
        {apiResult && (
          <div className={statusClass}>
            <strong>{apiResult.status}</strong>
            <span>confidence {apiResult.confidence}</span>
          </div>
        )}
      </header>

      <div className="row">
        <section className="card">
          <h2>Camera</h2>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="video-feed"
          />
          <canvas ref={canvasRef} className="hidden-canvas" />
          <p className="muted">
            {running ? "Camera running — features update on a short interval." : "Starting camera…"}
          </p>
        </section>

        <section className="card">
          <h2>Feature snapshot</h2>
          <dl className="feature-grid">
            <dt>eye_closure</dt>
            <dd>{features.eye_closure}</dd>
            <dt>blink_rate</dt>
            <dd>{features.blink_rate} / 60s</dd>
            <dt>head_tilt</dt>
            <dd>{features.head_tilt}</dd>
            <dt>reaction_time</dt>
            <dd>{features.reaction_time}s</dd>
          </dl>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={logReactionToDb}
              onChange={(e) => setLogReactionToDb(e.target.checked)}
            />
            Also log this reaction time to <code>reaction_tests</code> (Supabase)
          </label>
          <div className="actions">
            <button type="button" onClick={runReactionTest}>
              Start reaction test
            </button>
            <button
              type="button"
              onClick={submitForAnalysis}
              disabled={analyzePending}
            >
              {analyzePending ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          {anonymousUserId && (
            <p className="muted small">
              Anonymous <code>user_id</code> stored locally for optional session linking.
            </p>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Reaction cue</h2>
        {!cueVisible && (
          <p className="muted">Click &quot;Start reaction test&quot; and tap the button as soon as it appears.</p>
        )}
        {cueVisible && (
          <button type="button" onClick={handleCueClick} className="cue-btn">
            Click now
          </button>
        )}
      </section>

      <section className="card">
        <h2>Analysis result</h2>
        {error && <p className="error-text">{error}</p>}
        {apiResult ? <pre>{JSON.stringify(apiResult, null, 2)}</pre> : <p className="muted">No result yet.</p>}
      </section>
    </main>
  );
}
