type AdminOverviewResponse = {
  error?: string;
  items: unknown[];
  source?: "flask" | "supabase-direct";
  warning?: string;
};

type SupabaseConfig = {
  key: string;
  reactionTable: string;
  url: string;
  usersTable: string;
  featureTable: string;
};

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";

  if (!url || !key) {
    return null;
  }

  return {
    url: normalizeBaseUrl(url),
    key,
    usersTable: process.env.SUPABASE_USERS_TABLE?.trim() || "user_data",
    featureTable: process.env.SUPABASE_TABLE?.trim() || "feature_log",
    reactionTable: process.env.SUPABASE_REACTION_TABLE?.trim() || "reaction_tests",
  };
}

async function fetchSupabaseTable(
  config: SupabaseConfig,
  table: string,
  select: string,
  options: {
    limit?: number;
    orderBy?: string;
  } = {},
) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  url.searchParams.set("select", select);

  if (options.orderBy) {
    url.searchParams.set("order", options.orderBy);
  }

  if (typeof options.limit === "number") {
    url.searchParams.set("limit", String(options.limit));
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || `Supabase ${table} request failed with ${response.status}`);
  }

  return response.json();
}

async function readSupabaseOverview() {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  let users: unknown[] = [];

  try {
    users = await fetchSupabaseTable(
      config,
      config.usersTable,
      "id,display_name,email,vehicle_vin,created_at,last_seen_at",
      {
        orderBy: "last_seen_at.desc",
      },
    );
  } catch {
    users = await fetchSupabaseTable(
      config,
      config.usersTable,
      "id,display_name,created_at,last_seen_at",
      {
        orderBy: "last_seen_at.desc",
      },
    );
  }

  const history = await fetchSupabaseTable(
    config,
    config.featureTable,
    "id,user_id,eye_closure,blink_rate,head_tilt,reaction_time,status,confidence,score,source,created_at",
    {
      orderBy: "created_at.desc",
      limit: 2000,
    },
  );

  return {
    items: buildAdminOverviewItems(users, history),
    source: "supabase-direct" as const,
  };
}

async function readFlaskOverview() {
  const baseUrl = process.env.FLASK_API_URL?.trim();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/admin/overview`, {
    cache: "no-store",
  });

  const body = await response.text();
  const contentType = response.headers.get("Content-Type") ?? "application/json";

  if (!response.ok) {
    throw new Error(body || `Flask admin overview failed with ${response.status}`);
  }

  return {
    body,
    contentType,
  };
}

function buildAdminOverviewItems(users: unknown[], history: unknown[]) {
  const usersById = new Map<string, Record<string, unknown>>();
  const historyByUserId = new Map<string, Record<string, unknown>[]>();

  users.forEach((user) => {
    if (!user || typeof user !== "object") {
      return;
    }

    const record = user as Record<string, unknown>;
    const userId = typeof record.id === "string" ? record.id : "";
    if (!userId) {
      return;
    }

    usersById.set(userId, record);
  });

  history.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const record = item as Record<string, unknown>;
    const userId = typeof record.user_id === "string" ? record.user_id : "";
    if (!userId) {
      return;
    }

    const current = historyByUserId.get(userId) ?? [];
    current.push(record);
    historyByUserId.set(userId, current);
  });

  const userIds = new Set<string>([...usersById.keys(), ...historyByUserId.keys()]);

  return [...userIds]
    .map((userId) => {
      const user = usersById.get(userId);
      const items = [...(historyByUserId.get(userId) ?? [])].sort((left, right) => {
        const leftTime = new Date(String(left.created_at ?? "")).getTime() || 0;
        const rightTime = new Date(String(right.created_at ?? "")).getTime() || 0;
        return rightTime - leftTime;
      });

      return {
        user_id: userId,
        display_name:
          typeof user?.display_name === "string" && user.display_name.trim()
            ? user.display_name
            : userId,
        email: typeof user?.email === "string" ? user.email : null,
        vehicle_vin: typeof user?.vehicle_vin === "string" ? user.vehicle_vin : null,
        created_at: typeof user?.created_at === "string" ? user.created_at : null,
        last_seen_at: typeof user?.last_seen_at === "string" ? user.last_seen_at : null,
        history: items,
      };
    })
    .sort((left, right) => {
      const leftTime =
        new Date(String(left.history[0]?.created_at ?? left.last_seen_at ?? "")).getTime() || 0;
      const rightTime =
        new Date(String(right.history[0]?.created_at ?? right.last_seen_at ?? "")).getTime() || 0;
      return rightTime - leftTime;
    });
}

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabaseOverview = await readSupabaseOverview();
    if (supabaseOverview) {
      return Response.json(supabaseOverview);
    }
  } catch (error) {
    console.error("Direct Supabase admin overview failed:", error);
  }

  try {
    const flaskOverview = await readFlaskOverview();
    if (flaskOverview) {
      return new Response(flaskOverview.body, {
        status: 200,
        headers: {
          "Content-Type": flaskOverview.contentType,
        },
      });
    }
  } catch (error) {
    console.error("Flask admin overview failed:", error);
  }

  const result: AdminOverviewResponse = {
    items: [],
    warning:
      "Admin dashboard could not reach Supabase directly or through Flask. Configure SUPABASE_URL/SUPABASE_KEY or FLASK_API_URL.",
  };

  return Response.json(result, { status: 200 });
}
