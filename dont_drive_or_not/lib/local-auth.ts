import { buildSession, type AppSession } from "@/lib/session";

export type LocalAccount = {
  email: string;
  password: string;
  vin: string;
  userId: string;
  createdAt: string;
};

type AuthResult = {
  account?: LocalAccount;
  error?: string;
};

const ACCOUNTS_KEY = "drive-awake-accounts";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeVin(value: string) {
  return value.trim().toUpperCase();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeAccount(account: Partial<LocalAccount>): LocalAccount | null {
  const email = typeof account.email === "string" ? normalizeEmail(account.email) : "";
  const password = typeof account.password === "string" ? account.password : "";
  const vin = typeof account.vin === "string" ? normalizeVin(account.vin) : "";

  if (!email || !password || !vin) {
    return null;
  }

  return {
    email,
    password,
    vin,
    userId:
      typeof account.userId === "string" && account.userId.trim()
        ? account.userId.trim()
        : `user-${slugify(email) || "driver"}`,
    createdAt:
      typeof account.createdAt === "string" && account.createdAt.trim()
        ? account.createdAt
        : new Date().toISOString(),
  };
}

function getStoredAccounts() {
  if (typeof window === "undefined") {
    return [] as LocalAccount[];
  }

  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      return [] as LocalAccount[];
    }

    const accounts = (JSON.parse(raw) as Partial<LocalAccount>[])
      .map(normalizeAccount)
      .filter((account): account is LocalAccount => account !== null);

    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    return accounts;
  } catch {
    return [] as LocalAccount[];
  }
}

export function getLocalAccounts() {
  return getStoredAccounts();
}

function storeAccounts(accounts: LocalAccount[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function createLocalAccount(input: {
  email: string;
  password: string;
  vin: string;
}): AuthResult {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const vin = normalizeVin(input.vin);

  if (!email || !password || !vin) {
    return {
      error: "Email, password, and VIN are all required.",
    };
  }

  const accounts = getStoredAccounts();
  const existing = accounts.find((account) => account.email === email);

  if (existing) {
    return {
      error: "An account with that email already exists. Log in instead.",
    };
  }

  const account = normalizeAccount({
    email,
    password,
    vin,
  });

  if (!account) {
    return {
      error: "Account details could not be stored.",
    };
  }

  storeAccounts([...accounts, account]);
  return { account };
}

export function loginLocalAccount(input: {
  email: string;
  password: string;
  vin: string;
}): AuthResult {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const vin = normalizeVin(input.vin);
  const account = getStoredAccounts().find((entry) => entry.email === email);

  if (!account) {
    return {
      error: "No account was found for that email. Create one first.",
    };
  }

  if (account.password !== password || account.vin !== vin) {
    return {
      error: "Email, password, or VIN did not match this local account.",
    };
  }

  return { account };
}

export function createSessionFromAccount(account: LocalAccount): AppSession {
  return buildSession({
    email: account.email,
    name: account.email.split("@")[0],
    userId: account.userId,
    vin: account.vin,
    signedInAt: new Date().toISOString(),
  });
}
