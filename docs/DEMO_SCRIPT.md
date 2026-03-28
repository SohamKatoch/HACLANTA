# Demo Script

## Short Version

"We built Drive Awake as a driver-readiness and insurance-risk demo. The frontend is a Next.js app that uses the browser camera, runs MediaPipe-based face analysis when available, and falls back to heuristic scoring if that model is unavailable. The backend is a Flask API that scores driver behavior, stores feature history in Supabase, and feeds the insurance dashboard."

"The driver side shows a live monitor with eye closure, blink rate, head tilt, reaction time, saved history, and a confidence graph. The insurance side gives a portfolio-style dashboard where an insurer can review drivers, inspect alerts, manage thresholds, and send a dangerous-driving warning back to the user experience."

## Full Talk Track

### 1. Opening

"Our project is Drive Awake. It is a driver safety and insurance dashboard system designed to estimate risky driving readiness before and during a trip."

"We wanted to show both sides of the problem: the driver experience and the insurance-company experience."

### 2. High-Level Architecture

"The frontend is built in Next.js with React and TypeScript. That gives us fast UI development, routing, reusable components, and a clean demo-ready interface."

"On the computer-vision side, the browser captures webcam input. We use MediaPipe Face Landmarker when it is available, and if it is not, we fall back to a heuristic browser-side approach so the app still works in a demo."

"The backend is a Flask service in Python. It receives the extracted features, computes a score, returns a confidence level, and can log the results into Supabase."

"Supabase is used as the storage layer for driver history, reaction tests, and seeded insurance-demo data."

### 3. Driver Flow

"On the driver side, the user signs up, logs in, opens the monitor, and allows camera access."

"The monitor calibrates to the user first. Then it tracks four main signals: eye closure, blink rate, head tilt, and reaction time."

"Those features are sent to the backend scoring route. The result comes back as SAFE or NOT SAFE with a confidence value and a reason summary."

"We also store capture history and visualize confidence over time, including repeated captures at the same timestamp group."

### 4. Insurance Dashboard

"The insurance dashboard is a separate route. It is meant for the insurance company or risk reviewer."

"Here they can review the driver list, see recent risk patterns, inspect alerts, adjust thresholds, and review historical metrics."

"We also added a dashboard-level action that lets the insurer send a dangerous-driving notification back to the user."

"For the demo, we added a snarky AI-style summary card at the top that reads the overall table and comments on the current portfolio state."

### 5. Why The Split Matters

"A lot of safety demos only show the driver UI, but insurers and fleet operators need a management layer. So we built the system as two connected views: operational monitoring for the driver and risk oversight for the insurer."

### 6. Technical Decisions

"We chose Next.js because it let us move quickly on both app routes and API proxy routes."

"We chose Flask because it is lightweight, easy to understand, and a natural place to later swap in a stronger ML model."

"We used Supabase because it gave us a straightforward cloud database for demo history and seeded backend data."

"We also designed the frontend so it still degrades gracefully if the backend or model is unavailable, which is important for live demos."

### 7. Current Limitations

"Right now, some admin-side settings are still local to the browser because this is a demo build."

"Also, the seeded Supabase schema currently focuses on risk history more than full insurance metadata, so VIN and email handling can be expanded further."

"In production, the admin authentication and notification layers would be implemented server-side instead of using demo-local behavior."

### 8. Closing

"So in summary, this project combines live driver monitoring, backend scoring, historical logging, and an insurance-company dashboard in one end-to-end workflow."

"The key value is that it does not just detect risky behavior. It turns that signal into something a driver, insurer, or fleet operator can actually act on."

## Live Demo Order

1. Start on the landing page
2. Explain signup/login briefly
3. Open the driver monitor and show calibration, metrics, and capture flow
4. Show the confidence graph and saved history
5. Open `/admin`
6. Show the insurance dashboard cards, table, and selected driver panel
7. Trigger a dangerous-driving notification
8. Return to the driver side and show the warning
9. Close on the architecture summary

## Backup One-Liner

"This is a full-stack driver-risk demo: Next.js on the frontend, Flask on the backend, Supabase for history, and a dual interface for both the driver and the insurer."
