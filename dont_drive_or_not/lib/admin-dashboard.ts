import { getLocalAccounts } from "@/lib/local-auth";

type Status = "SAFE" | "NOT SAFE";

type StoredHistoryItem = {
  id: number;
  user_id: string;
  eye_closure: number;
  blink_rate: number;
  head_tilt: number;
  reaction_time: number;
  status: Status;
  confidence: number;
  score: number | null;
  source: string;
  created_at: string;
};

type RemoteAdminOverviewItem = {
  created_at?: string | null;
  display_name?: string | null;
  email?: string | null;
  history?: StoredHistoryItem[];
  last_seen_at?: string | null;
  user_id: string;
  vehicle_vin?: string | null;
};

export type RiskThresholds = {
  blinkRate: number;
  eyeClosure: number;
  headTilt: number;
  reactionTime: number;
};

export type AlertFlag = "correct" | "false_positive" | null;

type StoredManagedUser = {
  archived?: boolean;
  assignedDevices: string[];
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: string;
  thresholds: RiskThresholds;
  userId?: string;
};

export type DashboardHistoryEntry = {
  blinkRate: number;
  confidence: number;
  createdAt: string;
  eyeClosure: number;
  headTilt: number;
  id: string;
  reactionTime: number;
  score: number | null;
  status: Status;
};

export type DashboardAlert = DashboardHistoryEntry & {
  flag: AlertFlag;
};

export type DashboardUser = {
  alerts: DashboardAlert[];
  assignedDevices: string[];
  averageBlinkRate: number | null;
  averageConfidence: number | null;
  captureCount: number;
  createdAt: string;
  email: string;
  history: DashboardHistoryEntry[];
  id: string;
  lastActive: string | null;
  latestStatus: Status | null;
  name: string;
  role: string;
  source: "admin" | "driver";
  thresholds: RiskThresholds;
  userId: string;
};

export type ManagedUserInput = {
  assignedDevices: string[];
  email: string;
  id?: string;
  name: string;
  role: string;
  thresholds: RiskThresholds;
  userId?: string;
};

const ADMIN_USERS_KEY = "drive-awake-admin-users";
const ALERT_FLAGS_KEY = "drive-awake-admin-alert-flags";
const HISTORY_STORAGE_PREFIX = "drive-awake-history:";

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  eyeClosure: 62,
  blinkRate: 28,
  headTilt: 18,
  reactionTime: 1.2,
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function labelFromEmail(email: string) {
  return (
    email
      .split("@")[0]
      ?.split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ") || "Driver"
  );
}

function emailFromSeed(seed: string) {
  return `${slugify(seed) || "driver"}@fleet.demo`;
}

function normalizeThresholds(thresholds?: Partial<RiskThresholds>): RiskThresholds {
  return {
    eyeClosure: Number.isFinite(thresholds?.eyeClosure)
      ? Math.min(Math.max(Number(thresholds?.eyeClosure), 0), 100)
      : DEFAULT_THRESHOLDS.eyeClosure,
    blinkRate: Number.isFinite(thresholds?.blinkRate)
      ? Math.min(Math.max(Number(thresholds?.blinkRate), 0), 100)
      : DEFAULT_THRESHOLDS.blinkRate,
    headTilt: Number.isFinite(thresholds?.headTilt)
      ? Math.min(Math.max(Number(thresholds?.headTilt), 0), 90)
      : DEFAULT_THRESHOLDS.headTilt,
    reactionTime: Number.isFinite(thresholds?.reactionTime)
      ? Math.min(Math.max(Number(thresholds?.reactionTime), 0), 10)
      : DEFAULT_THRESHOLDS.reactionTime,
  };
}

function normalizeManagedUser(user: Partial<StoredManagedUser>): StoredManagedUser | null {
  const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
  if (!email) {
    return null;
  }

  return {
    id:
      typeof user.id === "string" && user.id.trim()
        ? user.id.trim()
        : `admin-${slugify(email) || Date.now().toString()}`,
    name:
      typeof user.name === "string" && user.name.trim()
        ? user.name.trim()
        : labelFromEmail(email),
    email,
    role:
      typeof user.role === "string" && user.role.trim() ? user.role.trim() : "Driver",
    assignedDevices: Array.isArray(user.assignedDevices)
      ? user.assignedDevices
          .map((device) => (typeof device === "string" ? device.trim() : ""))
          .filter(Boolean)
      : [],
    thresholds: normalizeThresholds(user.thresholds),
    createdAt:
      typeof user.createdAt === "string" && user.createdAt.trim()
        ? user.createdAt
        : new Date().toISOString(),
    archived: Boolean(user.archived),
    userId:
      typeof user.userId === "string" && user.userId.trim() ? user.userId.trim() : undefined,
  };
}

function readManagedUsers() {
  if (typeof window === "undefined") {
    return [] as StoredManagedUser[];
  }

  try {
    const raw = window.localStorage.getItem(ADMIN_USERS_KEY);
    if (!raw) {
      return [] as StoredManagedUser[];
    }

    const users = (JSON.parse(raw) as Partial<StoredManagedUser>[])
      .map(normalizeManagedUser)
      .filter((user): user is StoredManagedUser => user !== null);

    window.localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
    return users;
  } catch {
    return [] as StoredManagedUser[];
  }
}

function writeManagedUsers(users: StoredManagedUser[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(users));
}

function readAlertFlags() {
  if (typeof window === "undefined") {
    return {} as Record<string, Exclude<AlertFlag, null>>;
  }

  try {
    const raw = window.localStorage.getItem(ALERT_FLAGS_KEY);
    if (!raw) {
      return {} as Record<string, Exclude<AlertFlag, null>>;
    }

    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => value === "correct" || value === "false_positive",
      ),
    ) as Record<string, Exclude<AlertFlag, null>>;
  } catch {
    return {} as Record<string, Exclude<AlertFlag, null>>;
  }
}

function writeAlertFlags(flags: Record<string, Exclude<AlertFlag, null>>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ALERT_FLAGS_KEY, JSON.stringify(flags));
}

function readAllHistory() {
  const historyByUserId = new Map<string, StoredHistoryItem[]>();

  if (typeof window === "undefined") {
    return historyByUserId;
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey || !storageKey.startsWith(HISTORY_STORAGE_PREFIX)) {
      continue;
    }

    const userId = storageKey.slice(HISTORY_STORAGE_PREFIX.length);

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        continue;
      }

      const parsed = JSON.parse(raw) as StoredHistoryItem[];
      if (!Array.isArray(parsed)) {
        continue;
      }

      historyByUserId.set(
        userId,
        parsed
          .filter((item) => typeof item?.created_at === "string")
          .sort(
            (left, right) =>
              new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
          ),
      );
    } catch {
      continue;
    }
  }

  return historyByUserId;
}

function buildHistoryEntry(item: StoredHistoryItem): DashboardHistoryEntry {
  return {
    id: `${item.user_id}-${item.id}-${item.created_at}`,
    createdAt: item.created_at,
    confidence: Math.round(item.confidence * 100),
    status: item.status,
    score: item.score,
    eyeClosure: Math.round(item.eye_closure * 100),
    blinkRate: Number(item.blink_rate.toFixed(1)),
    headTilt: Number(item.head_tilt.toFixed(1)),
    reactionTime: Number(item.reaction_time.toFixed(2)),
  };
}

function mergeStoredHistory(primary: StoredHistoryItem[], secondary: StoredHistoryItem[]) {
  const seen = new Set<string>();
  const merged = [...primary, ...secondary].filter((item) => {
    const key = `${item.created_at}-${item.confidence}-${item.user_id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return merged.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

async function readRemoteAdminOverview() {
  if (typeof window === "undefined") {
    return [] as RemoteAdminOverviewItem[];
  }

  try {
    const response = await fetch("/api/admin-overview", {
      cache: "no-store",
    });

    if (!response.ok) {
      return [] as RemoteAdminOverviewItem[];
    }

    const result = (await response.json()) as { items?: RemoteAdminOverviewItem[] };
    return Array.isArray(result.items) ? result.items : [];
  } catch {
    return [] as RemoteAdminOverviewItem[];
  }
}

export async function loadAdminDashboardUsers() {
  const managedUsers = readManagedUsers();
  const managedByEmail = new Map(managedUsers.map((user) => [user.email, user] as const));
  const managedByUserId = new Map(
    managedUsers
      .filter((user) => user.userId)
      .map((user) => [user.userId as string, user] as const),
  );
  const accounts = getLocalAccounts();
  const accountsByEmail = new Map(accounts.map((account) => [account.email, account] as const));
  const accountsByUserId = new Map(accounts.map((account) => [account.userId, account] as const));
  const historyByUserId = readAllHistory();
  const alertFlags = readAlertFlags();
  const remoteItems = await readRemoteAdminOverview();
  const remoteByUserId = new Map(remoteItems.map((item) => [item.user_id, item] as const));
  const identityKeys = new Set<string>();

  remoteItems.forEach((item) => {
    identityKeys.add(item.user_id);
  });
  accounts.forEach((account) => {
    if (!managedByEmail.get(account.email)?.archived) {
      identityKeys.add(account.userId);
    }
  });
  managedUsers.forEach((user) => {
    if (!user.archived) {
      identityKeys.add(user.userId ?? user.email);
    }
  });

  return [...identityKeys]
    .map((key) => {
      const remote =
        remoteByUserId.get(key) ??
        [...remoteItems].find((item) => managedByEmail.get(key)?.userId === item.user_id) ??
        null;
      const managed =
        managedByUserId.get(key) ??
        managedByEmail.get(key) ??
        (remote ? managedByUserId.get(remote.user_id) : undefined) ??
        undefined;
      const account =
        accountsByUserId.get(key) ??
        accountsByEmail.get(key) ??
        (managed ? accountsByEmail.get(managed.email) : undefined) ??
        (remote?.email ? accountsByEmail.get(normalizeEmail(remote.email)) : undefined) ??
        undefined;
      const userId =
        remote?.user_id ??
        managed?.userId ??
        account?.userId ??
        `user-${slugify(managed?.email ?? account?.email ?? key) || "driver"}`;
      const fallbackEmailSeed = remote?.display_name ?? managed?.name ?? account?.email ?? userId;
      const email = normalizeEmail(
        managed?.email ??
          account?.email ??
          remote?.email ??
          emailFromSeed(fallbackEmailSeed),
      );
      const mergedRawHistory = mergeStoredHistory(
        remote?.history ?? [],
        historyByUserId.get(userId) ?? [],
      );
      const rawHistory = mergedRawHistory;
      const history = [...rawHistory]
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        )
        .map(buildHistoryEntry);
      const alerts = history
        .filter((item) => item.status === "NOT SAFE")
        .map((item) => ({
          ...item,
          flag: alertFlags[item.id] ?? null,
        }));
      const averageConfidence =
        history.length > 0
          ? Math.round(
              history.reduce((sum, item) => sum + item.confidence, 0) / history.length,
            )
          : null;
      const averageBlinkRate =
        history.length > 0
          ? Number(
              (
                history.reduce((sum, item) => sum + item.blinkRate, 0) / history.length
              ).toFixed(1),
            )
          : null;

      return {
        id:
          managed?.id ??
          remote?.user_id ??
          account?.userId ??
          `admin-${slugify(email) || Date.now().toString()}`,
        name:
          managed?.name ??
          remote?.display_name?.trim() ??
          labelFromEmail(email),
        email,
        role: managed?.role ?? (account ? "Driver" : "Pending"),
        assignedDevices:
          managed?.assignedDevices.length
            ? managed.assignedDevices
            : account?.vin
              ? [account.vin]
              : remote?.vehicle_vin
                ? [remote.vehicle_vin]
              : [],
        thresholds: managed?.thresholds ?? DEFAULT_THRESHOLDS,
        createdAt:
          remote?.created_at ??
          managed?.createdAt ??
          account?.createdAt ??
          new Date().toISOString(),
        source: remote || account ? "driver" : "admin",
        userId,
        history,
        alerts,
        captureCount: history.length,
        averageConfidence,
        averageBlinkRate,
        lastActive:
          history[0]?.createdAt ??
          remote?.last_seen_at ??
          managed?.createdAt ??
          account?.createdAt ??
          null,
        latestStatus: history[0]?.status ?? null,
      } satisfies DashboardUser;
    })
    .sort((left, right) => {
      const leftTime = left.lastActive ? new Date(left.lastActive).getTime() : 0;
      const rightTime = right.lastActive ? new Date(right.lastActive).getTime() : 0;
      return rightTime - leftTime || left.name.localeCompare(right.name);
    });
}

export function upsertAdminManagedUser(input: ManagedUserInput) {
  const email = normalizeEmail(input.email);
  if (!email) {
    return;
  }

  const users = readManagedUsers();
  const existing = users.find(
    (user) => user.id === input.id || user.email === email,
  );
  const nextUser = normalizeManagedUser({
    id: existing?.id ?? input.id,
    name: input.name,
    email,
    role: input.role,
    assignedDevices: input.assignedDevices,
    thresholds: input.thresholds,
    createdAt: existing?.createdAt,
    archived: false,
    userId: input.userId ?? existing?.userId,
  });

  if (!nextUser) {
    return;
  }

  const nextUsers = users.filter(
    (user) => user.id !== existing?.id && user.email !== email,
  );
  nextUsers.push(nextUser);
  writeManagedUsers(nextUsers.sort((left, right) => left.name.localeCompare(right.name)));
}

export function archiveAdminManagedUser(user: Pick<DashboardUser, "email" | "id" | "name" | "role" | "assignedDevices" | "thresholds" | "userId">) {
  const users = readManagedUsers();
  const existing = users.find(
    (entry) => entry.id === user.id || entry.email === user.email,
  );
  const archivedUser = normalizeManagedUser({
    id: existing?.id ?? user.id,
    name: existing?.name ?? user.name,
    email: user.email,
    role: existing?.role ?? user.role,
    assignedDevices: existing?.assignedDevices ?? user.assignedDevices,
    thresholds: existing?.thresholds ?? user.thresholds,
    createdAt: existing?.createdAt,
    archived: true,
    userId: user.userId,
  });

  if (!archivedUser) {
    return;
  }

  const nextUsers = users.filter((entry) => entry.id !== archivedUser.id);
  nextUsers.push(archivedUser);
  writeManagedUsers(nextUsers);
}

export function resetManagedUserThresholds(user: Pick<DashboardUser, "email" | "id" | "name" | "role" | "assignedDevices" | "userId">) {
  upsertAdminManagedUser({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedDevices: user.assignedDevices,
    thresholds: DEFAULT_THRESHOLDS,
    userId: user.userId,
  });
}

export function updateAlertFlag(alertId: string, flag: AlertFlag) {
  const flags = readAlertFlags();

  if (!flag) {
    delete flags[alertId];
  } else {
    flags[alertId] = flag;
  }

  writeAlertFlags(flags);
}
