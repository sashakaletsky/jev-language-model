"use client";

import { useSyncExternalStore } from "react";
import { resolvedTheme, setTheme, subscribeTheme } from "./theme";

/** Light or dark. Follows the system until the visitor picks one; the pick is remembered in this browser. */
export default function ThemeToggle() {
  // "unknown" on the server and during hydration, so the markup matches whatever the theme turns out to be.
  const theme = useSyncExternalStore(subscribeTheme, resolvedTheme, () => "unknown" as const);
  const toggle = () => setTheme(resolvedTheme() === "dark" ? "light" : "dark");
  const label = theme === "dark" ? "Switch to light mode" : theme === "light" ? "Switch to dark mode" : "Switch colour mode";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
          </g>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
