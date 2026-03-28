export type AdminSession = {
  username: string;
  signedInAt: string;
};

type AdminAuthResult = {
  error?: string;
  session?: AdminSession;
};

const ADMIN_SESSION_KEY = "drive-awake-admin-session";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "1234";

function buildAdminSession(session: Partial<AdminSession>): AdminSession {
  return {
    username:
      typeof session.username === "string" && session.username.trim()
        ? session.username.trim().toLowerCase()
        : ADMIN_USERNAME,
    signedInAt:
      typeof session.signedInAt === "string" && session.signedInAt.trim()
        ? session.signedInAt
        : new Date().toISOString(),
  };
}

export function authenticateAdmin(input: {
  password: string;
  username: string;
}): AdminAuthResult {
  const username = input.username.trim().toLowerCase();
  const password = input.password;

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return {
      error: "That admin username or password is incorrect.",
    };
  }

  return {
    session: buildAdminSession({
      username,
    }),
  };
}

export function getStoredAdminSession(): AdminSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const session = buildAdminSession(JSON.parse(raw) as Partial<AdminSession>);
    window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export function storeAdminSession(session: AdminSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(buildAdminSession(session)));
}

export function clearStoredAdminSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}
