"use client";

/**
 * Where you are, and what else there is.
 *
 * Six screens exist now and the only way between them was the logo and a
 * "Voltar" at the bottom of each, which means a family in the library has no
 * idea the rest of the app is there.
 *
 * Three constraints make this not a nav bar:
 *
 * 1. **A five-year-old should not have to read it.** The drawing carries the
 *    meaning and the word is the caption, exactly as on the choice buttons.
 * 2. **It disappears during a scene.** The story is uninterrupted and
 *    full-screen; a tab bar under a scene is the same mistake as a mascot in
 *    one. The caller decides — see `Shell`.
 * 3. **The adults' area is not a peer.** It sits behind the gate and must not
 *    be one tap from a child looking for the next story.
 */

export type TrailStop = "home" | "story" | "library" | "share";

const STOPS: { id: TrailStop; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "Início" },
  { id: "story", icon: "✨", label: "Nova" },
  { id: "library", icon: "📚", label: "Guardadas" },
  { id: "share", icon: "💌", label: "Mandar" },
];

export function Trail({
  at,
  onGo,
}: {
  at: TrailStop;
  onGo: (stop: TrailStop) => void;
}) {
  return (
    <nav aria-label="Navegação" className="mb-6">
      <ul className="flex items-stretch gap-2">
        {STOPS.map((stop) => {
          const here = stop.id === at;
          return (
            <li key={stop.id} className="flex-1">
              <button
                type="button"
                onClick={() => onGo(stop.id)}
                aria-current={here ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 transition active:scale-[0.97] ${
                  here ? "border-shop bg-shop/10" : "border-transparent bg-card"
                }`}
              >
                <span aria-hidden className="text-2xl">
                  {stop.icon}
                </span>
                {/* The word is a caption under the drawing, never the thing you
                    have to read to choose. */}
                <span
                  className={`text-xs ${here ? "text-shop" : "text-muted"}`}
                >
                  {stop.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
