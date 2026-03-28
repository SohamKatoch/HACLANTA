export type UserAlert = {
  createdAt: string;
  id: string;
  message: string;
  title: string;
  userId: string;
};

const USER_ALERT_PREFIX = "drive-awake-user-alerts";

function getUserAlertStorageKey(userId: string) {
  return `${USER_ALERT_PREFIX}:${userId}`;
}

export function readUserAlerts(userId: string) {
  if (typeof window === "undefined" || !userId) {
    return [] as UserAlert[];
  }

  try {
    const raw = window.localStorage.getItem(getUserAlertStorageKey(userId));
    if (!raw) {
      return [] as UserAlert[];
    }

    const parsed = JSON.parse(raw) as UserAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as UserAlert[];
  }
}

function writeUserAlerts(userId: string, alerts: UserAlert[]) {
  if (typeof window === "undefined" || !userId) {
    return;
  }

  window.localStorage.setItem(getUserAlertStorageKey(userId), JSON.stringify(alerts));
}

export function sendDangerDrivingAlert(input: {
  actor?: string;
  userId: string;
  userName?: string;
}) {
  const userName = input.userName?.trim() || "Driver";
  const nextAlert: UserAlert = {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    createdAt: new Date().toISOString(),
    title: "Dangerous driving alert",
    message: `${input.actor || "Insurance review"} flagged ${userName}'s recent driving pattern as dangerous. Stop driving now and wait for clearance before the next trip.`,
  };

  const nextAlerts = [nextAlert, ...readUserAlerts(input.userId)].slice(0, 8);
  writeUserAlerts(input.userId, nextAlerts);
  return nextAlert;
}

export function dismissUserAlert(userId: string, alertId: string) {
  if (!userId || !alertId) {
    return;
  }

  writeUserAlerts(
    userId,
    readUserAlerts(userId).filter((alert) => alert.id !== alertId),
  );
}
