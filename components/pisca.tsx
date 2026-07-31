/**
 * Pisca, a vaga-lume.
 *
 * **Pisca is not the narrator, and this is the load-bearing rule.** The
 * constitution says the narrator is not a friend, not an assistant, not a
 * character who talks to the child, and never refers to itself — that is why
 * this product is a book rather than a chatbot with a face on it. A mascot that
 * greeted the child or reacted to her choices would quietly undo it.
 *
 * So Pisca is furniture of the *app*, never of the *story*: the home screen,
 * the empty shelf, the wait before a scene, the end of the night. It never
 * appears inside a scene, never speaks in the first person, and never comments
 * on a choice. See docs/story-bible.md.
 *
 * A firefly rather than an owl, and rather than a character from any world: the
 * shop already has Farelo and the circus has Pipoca, and a mascot borrowed from
 * one world would be a stranger in the other two. A vaga-lume belongs to a
 * Brazilian evening, which is the one thing every story here has in common.
 *
 * Inline SVG rather than an image: it takes the palette from CSS variables, so
 * it is correct in both themes for free, it animates without a library, and it
 * costs no request at the moment the first screen is painted.
 */

export type PiscaMood =
  /** Default. On the home screen, doing nothing in particular. */
  | "resting"
  /** Something is being generated. The light breathes. */
  | "glowing"
  /** A story just ended, or the room is dark. */
  | "asleep";

export function Pisca({
  mood = "resting",
  size = 96,
  className = "",
}: {
  mood?: PiscaMood;
  size?: number;
  className?: string;
}) {
  const asleep = mood === "asleep";

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      // Named, not described: a child hearing "a firefly called Pisca" gets the
      // same thing a sighted child sees. Describing the drawing would not.
      aria-label="Pisca, o vaga-lume"
      style={
        mood === "resting"
          ? { animation: "pisca-float 4s ease-in-out infinite" }
          : undefined
      }
    >
      <defs>
        <radialGradient id="pisca-halo">
          <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.85" />
          <stop offset="55%" stopColor="var(--glow)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The light it carries. This is the whole character — everything else is
          the creature that holds it. */}
      <circle
        cx="60"
        cy="82"
        r="30"
        fill="url(#pisca-halo)"
        style={
          asleep
            ? { opacity: 0.35 }
            : {
                animation: `pisca-glow ${mood === "glowing" ? "1.4s" : "3s"} ease-in-out infinite`,
                transformOrigin: "60px 82px",
              }
        }
      />

      {/* Wings, behind the body. */}
      <ellipse
        cx="40"
        cy="52"
        rx="17"
        ry="11"
        fill="var(--farelo)"
        opacity="0.5"
        transform="rotate(-24 40 52)"
      />
      <ellipse
        cx="80"
        cy="52"
        rx="17"
        ry="11"
        fill="var(--farelo)"
        opacity="0.5"
        transform="rotate(24 80 52)"
      />

      {/* Body: a head and a lantern, nothing more. Fewer features read as
          friendlier at this age, and leave room for the child's own idea. */}
      <ellipse cx="60" cy="72" rx="19" ry="21" fill="var(--shop)" />
      <circle cx="60" cy="47" r="17" fill="var(--shop)" />

      {/* The lantern itself, on the underside. */}
      <ellipse
        cx="60"
        cy="86"
        rx="11"
        ry="9"
        fill="var(--glow)"
        style={asleep ? { opacity: 0.5 } : undefined}
      />

      {/* Antennae. */}
      <path
        d="M52 34 Q48 24 42 21"
        stroke="var(--shop)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M68 34 Q72 24 78 21"
        stroke="var(--shop)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="41" cy="20" r="3.5" fill="var(--glow)" />
      <circle cx="79" cy="20" r="3.5" fill="var(--glow)" />

      {/* Eyes. Closed when asleep — the only expression it has, and enough. */}
      {asleep ? (
        <>
          <path
            d="M50 47 Q54 51 58 47"
            stroke="var(--paper)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M62 47 Q66 51 70 47"
            stroke="var(--paper)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <circle cx="54" cy="46" r="3.2" fill="var(--paper)" />
          <circle cx="66" cy="46" r="3.2" fill="var(--paper)" />
        </>
      )}
    </svg>
  );
}

/**
 * The wordmark.
 *
 * Pisca sits beside the name rather than inside it: the logo has to survive
 * being shown at 20px in a browser tab, and a firefly at 20px is a dot.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Pisca size={28} mood="resting" />
      <span className="text-lg tracking-[0.18em] text-shop uppercase">
        Conta Comigo
      </span>
    </span>
  );
}
