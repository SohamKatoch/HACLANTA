export const runtime = "nodejs";

type CommentaryRequest = {
  confidence?: number;
  score?: number | null;
  status?: "SAFE" | "NOT SAFE" | string;
};

function buildFallbackCommentary({
  confidence = 0,
  status = "SAFE",
}: CommentaryRequest) {
  const confidencePercent = Math.round(confidence * 100);

  if (status === "NOT SAFE") {
    return `That ${confidencePercent}% confidence is your dashboard's way of saying "maybe let's not freestyle this drive." Best plot twist: pause, reset, and come back sharper.`;
  }

  if (confidencePercent >= 80) {
    return `A ${confidencePercent}% confidence score is smooth enough to make the monitor look smug. You're giving "main character with a full night's sleep" energy.`;
  }

  if (confidencePercent >= 60) {
    return `A ${confidencePercent}% confidence score says you're mostly in the pocket, but the app still has one eyebrow raised. Close enough for optimism, not close enough for cockiness.`;
  }

  return `A ${confidencePercent}% confidence score means the monitor is politely asking for a redo. Think of it as a soft launch, not the headline performance.`;
}

async function generateGeminiCommentary(input: CommentaryRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";

  if (!apiKey) {
    return {
      provider: "local-fallback",
      text: buildFallbackCommentary(input),
    };
  }

  const confidencePercent = Math.round((input.confidence ?? 0) * 100);
  const prompt = [
    "Write exactly 2 short snarky sentences about a driver readiness confidence score.",
    "Use playful roast energy, sharp humor, and demo-day personality.",
    "Keep it clean, non-abusive, and under 35 words total.",
    "Sound like a smug dashboard giving commentary, not like a safety warning.",
    "Do not mention medicine, diagnosis, or legal advice.",
    `Status: ${input.status ?? "SAFE"}.`,
    `Confidence: ${confidencePercent}%.`,
    `Risk score: ${typeof input.score === "number" ? input.score.toFixed(2) : "n/a"}.`,
  ].join(" ");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 90,
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini returned ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned no text");
  }

  return {
    provider: `gemini:${model}`,
    text,
  };
}

export async function POST(request: Request) {
  let body: CommentaryRequest;

  try {
    body = (await request.json()) as CommentaryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await generateGeminiCommentary(body);
    return Response.json(result);
  } catch {
    return Response.json({
      provider: "local-fallback",
      text: buildFallbackCommentary(body),
    });
  }
}
