import { analyzeDrowsiness, type DrowsinessFeatures } from "@/lib/drowsiness";

export const runtime = "nodejs";

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function proxyToFlask(features: DrowsinessFeatures) {
  const baseUrl = process.env.FLASK_API_URL;

  if (!baseUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(features),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Flask analyzer returned ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    route: "/api/analyze",
    flask_proxy_configured: Boolean(process.env.FLASK_API_URL),
    provider: process.env.FLASK_API_URL ? "next-proxy" : "local-threshold",
  });
}

export async function POST(request: Request) {
  let features: DrowsinessFeatures;

  try {
    features = (await request.json()) as DrowsinessFeatures;
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      {
        status: 400,
      },
    );
  }

  if (
    typeof features.eye_closure !== "number" ||
    typeof features.blink_rate !== "number" ||
    typeof features.head_tilt !== "number" ||
    typeof features.reaction_time !== "number"
  ) {
    return Response.json(
      {
        error:
          "Expected numeric eye_closure, blink_rate, head_tilt, and reaction_time fields.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const proxied = await proxyToFlask(features);

    if (proxied) {
      return Response.json({
        ...proxied,
        provider: proxied.provider ?? "python-proxy",
      });
    }
  } catch {
    return Response.json({
      ...analyzeDrowsiness(features, "next-fallback-threshold"),
      saved_capture: false,
      warning:
        "The configured Flask analyzer could not be reached. Returning built-in threshold scoring instead.",
    });
  }

  return Response.json({
    ...analyzeDrowsiness(features, "next-threshold"),
    saved_capture: false,
  });
}
