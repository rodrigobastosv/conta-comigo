"use client";

import { useSyncExternalStore } from "react";

/**
 * Light or dark, and which one is chosen deliberately.
 *
 * The default follows the system, because the system already knows whether it
 * is night. The override exists because a phone left on "light" at 9pm is the
 * common case, and the person holding it is not going to change an OS setting
 * to read one story.
 */

const KEY = "conta-comigo:theme";
type Theme = "light" | "dark";

/**
 * Runs before paint, in the document head.
 *
 * Without this the page renders in the default palette and then corrects
 * itself, which in a dark room is a white flash in the face of a child who was
 * nearly asleep. That is the entire reason this is a blocking inline script and
 * not an effect.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

/**
 * The theme is external state — it lives in `localStorage` and in the operating
 * system, not in React — so it is read with the primitive built for that rather
 * than mirrored into `useState` inside an effect. The mirror version renders
 * once with the wrong answer and then corrects itself, which is the flash this
 * whole file exists to avoid.
 */
const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  system.addEventListener("change", notify);
  // Another tab of the same app, changed by the same family.
  window.addEventListener("storage", notify);

  return () => {
    listeners.delete(notify);
    system.removeEventListener("change", notify);
    window.removeEventListener("storage", notify);
  };
}

function current(): Theme {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private mode. The system preference still answers.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The server cannot know what the device prefers, and must not guess. */
function onServer(): null {
  return null;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, onServer);

  function choose(next: Theme) {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage refused. The theme still applies for this visit.
    }
    for (const notify of listeners) notify();
  }

  return (
    <button
      type="button"
      // Rendered before the theme is known so the header does not change height
      // on hydration; it just cannot say which way it goes yet.
      disabled={theme === null}
      onClick={() => choose(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Acender a luz" : "Apagar a luz"}
      className={`rounded-full border-2 border-edge px-3 py-2 text-lg transition active:scale-95 ${className}`}
    >
      <span aria-hidden>{theme === "dark" ? "☀︎" : "☾"}</span>
    </button>
  );
}
