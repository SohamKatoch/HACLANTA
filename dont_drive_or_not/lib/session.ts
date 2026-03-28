export type AppSession = {
  name: string;
  email: string;
  userId: string;
  vin: string;
  signedInAt: string;
};

const SESSION_KEY = "drive-awake-session";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeVin(value: string) {
  return value.trim().toUpperCase();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function deriveUserId(name: string, email: string) {
  const preferredSeed = email || name || "driver";
  return `user-${slugify(preferredSeed) || "driver"}`;
}

function deriveName(name: string | undefined, email: string) {
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  const emailLabel = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return emailLabel || "Driver";
}

export function buildSession(session: Partial<AppSession>): AppSession {
  const email =
    typeof session.email === "string" && session.email.trim()
      ? normalizeEmail(session.email)
      : "guest@driveawake.local";
  const name = deriveName(session.name, email);
  const userId =
    typeof session.userId === "string" && session.userId.trim()
      ? session.userId.trim()
      : deriveUserId(name, email);
  const vin = typeof session.vin === "string" ? normalizeVin(session.vin) : "";
  const signedInAt =
    typeof session.signedInAt === "string" && session.signedInAt.trim()
      ? session.signedInAt
      : new Date().toISOString();

  return {
    name,
    email,
    userId,
    vin,
    signedInAt,
  };
}

export function getStoredSession(): AppSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = buildSession(JSON.parse(raw) as Partial<AppSession>);
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return null;
  }
}

export function storeSession(session: AppSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(buildSession(session)));
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}
