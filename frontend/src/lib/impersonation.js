/** Impersonation state: persisted in localStorage, synced via custom event. */

export const IMPERSONATION_KEYS = {
  MODE: "kryonex_impersonation_mode",
  USER_ID: "kryonex_impersonated_user_id",
};

export const IMPERSONATION_EVENT = "kryonex-impersonation-change";

export function getImpersonation() {
  if (typeof window === "undefined") {
    return { active: false, userId: null };
  }
  const mode = window.localStorage.getItem(IMPERSONATION_KEYS.MODE);
  const userId = window.localStorage.getItem(IMPERSONATION_KEYS.USER_ID);
  const active = mode === "true" && Boolean(userId && userId.trim());
  return { active, userId: active ? userId.trim() : null };
}

export function setImpersonation(userId) {
  if (typeof window === "undefined") return;
  const id = String(userId || "").trim();
  if (!id) return;
  window.localStorage.setItem(IMPERSONATION_KEYS.MODE, "true");
  window.localStorage.setItem(IMPERSONATION_KEYS.USER_ID, id);
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
}

export function clearImpersonation() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(IMPERSONATION_KEYS.MODE);
  window.localStorage.removeItem(IMPERSONATION_KEYS.USER_ID);
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
}
