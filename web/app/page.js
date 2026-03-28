"use client";

import { useEffect, useRef, useState } from "react";

const EYE_CLOSED_THRESHOLD = 0.58;
const BLINK_WINDOW_MS = 60_000;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export default function HomePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const reactionCueAtRef = useRef(null);
  const blinkEventsRef = useRef([]);
  const eyeStateRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [features, setFeatures] = useState({
    eye_closure: 0,
    blink_rate: 0,
    head_tilt: 0,
    reaction_time: 0.6
  });
  const [cueVisible, setCueVisible] = useState(false);
  const [apiResult, setApiResult] = useState(null);
  const [error, setError] = useState("");

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

        interval = setInterval(sampleFrame, 400);
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

  function estimateEyeClosure(ctx, width, height) {
    const sx = Math.floor(width * 0.25);
    const sy = Math.floor(height * 0.2);
    const sw = Math.floor(width * 0.5);
    const sh = Math.floor(height * 0.2);
    const data = ctx.getImageData(sx, sy, sw, sh).data;

    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum;
    }
    const avgLum = sum / (data.length / 4);
    return clamp01(1 - avgLum / 255);
  }

  function estimateHeadTilt(ctx, width, height) {
    const data = ctx.getImageData(0, 0, width, height).data;
    let leftLum = 0;
    let rightLum = 0;
    let leftCount = 0;
    let rightCount = 0;

    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        const i = (y * width + x) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (x < width / 2) {
          leftLum += lum;
          leftCount += 1;
        } else {
          rightLum += lum;
          rightCount += 1;
        }
      }
    }

    const left = leftLum / Math.max(1, leftCount);
    const right = rightLum / Math.max(1, rightCount);
    const diff = (left - right) / 255;
    return clamp01(Math.abs(diff));
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
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(features)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setApiResult(json);
    } catch (err) {
      setError(`Analyze request failed: ${err.message}`);
    }
  }

  return (
    <main>
      <h1>Driver Safety Monitor</h1>
      <div className="row">
        <section className="card">
          <h2>Camera</h2>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", borderRadius: 8, background: "#111" }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          <p>Status: {running ? "Camera running" : "Starting camera..."}</p>
        </section>

        <section className="card">
          <h2>Feature Snapshot</h2>
          <pre>{JSON.stringify(features, null, 2)}</pre>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runReactionTest}>Start Reaction Test</button>
            <button onClick={submitForAnalysis}>Analyze</button>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Reaction Cue</h2>
        {!cueVisible && <p>Click "Start Reaction Test" and wait for cue.</p>}
        {cueVisible && (
          <button
            onClick={handleCueClick}
            style={{ background: "#bf2f16", fontSize: 18, padding: "16px 20px" }}
          >
            CLICK NOW
          </button>
        )}
      </section>

      <section className="card">
        <h2>Analysis Result</h2>
        {error && <p style={{ color: "#aa1f1f" }}>{error}</p>}
        {apiResult ? <pre>{JSON.stringify(apiResult, null, 2)}</pre> : <p>No result yet.</p>}
      </section>
    </main>
  );
}
