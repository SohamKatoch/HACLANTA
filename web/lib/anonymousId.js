const STORAGE_KEY = "dsm_anon_id";

export function getOrCreateAnonymousUserId() {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
