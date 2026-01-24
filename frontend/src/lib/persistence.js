const PREFIX = "kryonex:";

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn("persistence: invalid JSON, clearing key", value);
    return null;
  }
};

const getSavedState = (key) => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${PREFIX}${key}`);
  return safeParse(raw);
};

const saveState = (key, value) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
};

const mergeState = (key, updater) => {
  const current = getSavedState(key);
  const next = typeof updater === "function" ? updater(current) : updater;
  saveState(key, next);
  return next;
};

const clearState = (key) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${PREFIX}${key}`);
};

export { getSavedState, saveState, mergeState, clearState };
