/** The colour scheme: follows the system until the visitor picks one, remembered in this browser. */
export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

export function resolvedTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Calls back on a toggle or a system change. Returns the unsubscribe function. */
export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
  };
}

export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Private mode or blocked storage: the choice still applies to this page.
  }
  for (const l of listeners) l();
}
