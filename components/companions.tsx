import { Pisca, type PiscaMood } from "./pisca";

/**
 * The friends a child can pick between.
 *
 * Same shape as the voice catalogue in lib/tts/voices.ts, and for the same
 * reason: **the id is permanent and the drawing is not.** A stored profile
 * points at `vaga-lume` forever; redrawing the firefly, or moving it to a
 * different artist, must never orphan a child's choice.
 *
 * They are **friends, not narrators** — see docs/story-bible.md. None of them
 * reads the story, none appears during a scene, and none comments on a choice.
 * Which friend is on the home screen and which voice reads the story are two
 * separate columns on purpose: collapse them and the friend has become the
 * narrator.
 *
 * They differ in silhouette rather than only in colour, because a child picks
 * the shape from across the room — and because a palette-only difference
 * disappears entirely for a colour-blind child.
 */

export type Companion = {
  id: string;
  name: string;
  /** One short line, in the child's register. */
  description: string;
  Drawing: (props: { size?: number; mood?: PiscaMood }) => React.ReactNode;
};

export const COMPANIONS: Companion[] = [
  {
    id: "vaga-lume",
    name: "Pisca",
    description: "um vaga-lume que acende quando tem história",
    Drawing: ({ size, mood }) => <Pisca size={size} mood={mood} />,
  },
  {
    id: "tatu",
    name: "Bolota",
    description: "um tatu-bola que desenrola devagar",
    Drawing: ({ size = 96, mood = "resting" }) => (
      <Bolota size={size} mood={mood} />
    ),
  },
  {
    id: "coruja",
    name: "Zila",
    description: "uma coruja que fica acordada até tarde",
    Drawing: ({ size = 96, mood = "resting" }) => (
      <Zila size={size} mood={mood} />
    ),
  },
  {
    id: "peixe",
    name: "Bolha",
    description: "um peixinho que mora num pote de vidro",
    Drawing: ({ size = 96, mood = "resting" }) => (
      <Bolha size={size} mood={mood} />
    ),
  },
];

export const DEFAULT_COMPANION_ID = COMPANIONS[0].id;

/**
 * Resolves a stored id, falling back rather than failing.
 *
 * An id this build does not know is a profile written by a newer version, or a
 * companion that was retired. Either way the child gets a friend, not an empty
 * space — the same rule the voice catalogue follows.
 */
export function companionById(id: string | null | undefined): Companion {
  return COMPANIONS.find((one) => one.id === id) ?? COMPANIONS[0];
}

/* --------------------------------------------------------------------------
 * The drawings. Inline SVG for the reasons in components/pisca.tsx: they take
 * the palette from CSS variables, so both themes are correct for free.
 * ----------------------------------------------------------------------- */

function Bolota({ size, mood }: { size: number; mood: PiscaMood }) {
  const asleep = mood === "asleep";
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="Bolota, o tatu-bola"
      style={
        mood === "resting"
          ? { animation: "pisca-float 5s ease-in-out infinite" }
          : undefined
      }
    >
      {/* Rolled into a ball, which is the whole joke of a tatu-bola. */}
      <circle cx="60" cy="66" r="34" fill="var(--shop)" />
      {/* The bands, which is what makes the silhouette read as an armadillo. */}
      <path
        d="M34 54 Q60 44 86 54"
        stroke="var(--paper)"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M30 68 Q60 58 90 68"
        stroke="var(--paper)"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M34 82 Q60 72 86 82"
        stroke="var(--paper)"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      />
      {/* Snout poking out of the ball. */}
      <ellipse cx="60" cy="38" rx="16" ry="13" fill="var(--farelo)" />
      <ellipse cx="60" cy="34" rx="5" ry="4" fill="var(--ink)" opacity="0.55" />
      {asleep ? (
        <>
          <path
            d="M50 42 Q53 45 56 42"
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M64 42 Q67 45 70 42"
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <circle cx="53" cy="42" r="2.8" fill="var(--ink)" />
          <circle cx="67" cy="42" r="2.8" fill="var(--ink)" />
        </>
      )}
    </svg>
  );
}

function Zila({ size, mood }: { size: number; mood: PiscaMood }) {
  const asleep = mood === "asleep";
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="Zila, a coruja"
      style={
        mood === "resting"
          ? { animation: "pisca-float 6s ease-in-out infinite" }
          : undefined
      }
    >
      {/* Tall and tufted: the opposite silhouette to a ball and a firefly. */}
      <path d="M40 34 L46 18 L54 32 Z" fill="var(--shop)" />
      <path d="M80 34 L74 18 L66 32 Z" fill="var(--shop)" />
      <ellipse cx="60" cy="64" rx="30" ry="36" fill="var(--shop)" />
      <ellipse
        cx="60"
        cy="76"
        rx="20"
        ry="24"
        fill="var(--farelo)"
        opacity="0.55"
      />
      {/* The face disc, which is what makes an owl an owl. */}
      <circle cx="49" cy="52" r="13" fill="var(--paper)" opacity="0.92" />
      <circle cx="71" cy="52" r="13" fill="var(--paper)" opacity="0.92" />
      {asleep ? (
        <>
          <path
            d="M42 52 Q49 58 56 52"
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M64 52 Q71 58 78 52"
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <circle cx="49" cy="52" r="5" fill="var(--ink)" />
          <circle cx="71" cy="52" r="5" fill="var(--ink)" />
        </>
      )}
      <path d="M60 60 L54 68 L66 68 Z" fill="var(--glow)" />
    </svg>
  );
}

function Bolha({ size, mood }: { size: number; mood: PiscaMood }) {
  const asleep = mood === "asleep";
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="Bolha, o peixinho"
      style={
        mood === "resting"
          ? { animation: "pisca-float 3.5s ease-in-out infinite" }
          : undefined
      }
    >
      {/* The jar. The fish alone would read as a generic fish; the jar is the
          character. */}
      <path
        d="M34 46 Q34 100 60 100 Q86 100 86 46 Z"
        fill="var(--farelo)"
        opacity="0.28"
      />
      <ellipse
        cx="60"
        cy="46"
        rx="26"
        ry="7"
        fill="var(--farelo)"
        opacity="0.5"
      />
      {/* The fish. */}
      <ellipse cx="57" cy="70" rx="17" ry="13" fill="var(--shop)" />
      <path d="M74 70 L88 60 L88 80 Z" fill="var(--shop)" />
      {asleep ? (
        <path
          d="M48 68 Q52 72 56 68"
          stroke="var(--paper)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <circle cx="51" cy="67" r="3.2" fill="var(--paper)" />
      )}
      {/* Bubbles, because a fish in a jar has to be doing something. */}
      <circle cx="70" cy="40" r="3.5" fill="var(--glow)" opacity="0.7" />
      <circle cx="78" cy="30" r="2.5" fill="var(--glow)" opacity="0.5" />
    </svg>
  );
}
