import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const payload = await request.json();
    const flaskUrl = process.env.FLASK_API_URL || "http://127.0.0.1:5000/analyze";

    const response = await fetch(flaskUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Proxy to Flask failed",
        details: error.message
      },
      { status: 500 }
    );
  }
}
