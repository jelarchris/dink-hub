"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "dinkhub-theme";

// MutationObserver-based store so the toggle icon stays in sync with any
// external change (e.g. the before-first-paint inline script).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyTheme(next: "light" | "dark") {
  if (next === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage unavailable — no-op
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  // Server snapshot is "light" (default theme). Client snapshot reads actual DOM.
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as const);

  return (
    <button
      type="button"
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      onClick={() => applyTheme(theme === "light" ? "dark" : "light")}
      className={
        className ??
        "inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)] transition-colors"
      }
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
