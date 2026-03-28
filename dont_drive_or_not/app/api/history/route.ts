function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  const baseUrl = process.env.FLASK_API_URL;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const limit = searchParams.get("limit") ?? "10";

  if (!userId) {
    return Response.json({ error: "user_id is required" }, { status: 400 });
  }

  if (!baseUrl) {
    return Response.json({
      items: [],
      warning: "FLASK_API_URL is not configured",
    });
  }

  try {
    const response = await fetch(
      `${normalizeBaseUrl(baseUrl)}/history?user_id=${encodeURIComponent(userId)}&limit=${encodeURIComponent(limit)}`,
      {
        cache: "no-store",
      },
    );

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return Response.json(
      {
        items: [],
        error: "history request failed",
      },
      { status: 500 },
    );
  }
}
