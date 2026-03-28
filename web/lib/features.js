/**
 * Lightweight client-side proxies (no landmarks yet).
 * Higher eye_closure ≈ darker eye region heuristic → treat as more "closed".
 */

export const EYE_CLOSED_THRESHOLD = 0.58;
export const BLINK_WINDOW_MS = 60_000;
export const SAMPLE_INTERVAL_MS = 400;

export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function estimateEyeClosure(ctx, width, height) {
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

export function estimateHeadTilt(ctx, width, height) {
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
