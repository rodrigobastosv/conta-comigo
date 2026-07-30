// Relative, with the extension, and not the `@/` alias on purpose: `npm test`
// runs this file through `node --experimental-strip-types`, which does not
// resolve tsconfig paths. Same reason the .test.ts files import that way.
import { isReady, kindOf, type Voice } from "./types.ts";

/**
 * The voice catalogue.
 *
 * Adding a voice is adding an entry here — that is the whole point of the shape.
 * A voice is a character, not a timbre: the parent picks "a lojista" or "o
 * contador de histórias", not "female, 45, warm". Keep the labels in that
 * register.
 *
 * The narrator is never a character in the story (see docs/story-bible.md), so a
 * voice's personality can only shape HOW the text is read — never what it says.
 * That is also why a male voice does not contradict the constitution's
 * "NARRADORA": the narrator never refers to herself, so nothing the child hears
 * is gendered.
 *
 * Three tiers on purpose, cheapest first — see
 * docs/decisions.md#narration-starts-free-on-the-device-and-buys-quality-later.
 */
export const VOICES: Voice[] = [
  {
    id: "dispositivo",
    label: "A voz do aparelho",
    description: "A voz que já vem no celular ou tablet. Não custa nada e funciona sem internet.",
    provider: "device",
    // Null on purpose: the available voices differ per device, so the queue asks
    // for pt-BR and takes what this one has. Naming a voice here would make the
    // story silent on every device that does not ship it.
    providerVoiceId: null,
    personality:
      "Whatever the operating system provides. There is no delivery control " +
      "here beyond rate — that is the price of a voice that costs nothing and " +
      "works on a plane.",
    settings: { stability: 1, similarityBoost: 1, speed: 0.9 },
  },
  {
    id: "vitoria",
    label: "Dona Vitória",
    description: "A voz da lojista: senhora, calma, um pouco divertida.",
    provider: "google",
    providerVoiceId: "pt-BR-Chirp3-HD-Achernar",
    personality:
      "An older woman telling a bedtime story to a small child. Warm and " +
      "unhurried, with the patience of someone who has told this story before. " +
      "Short sentences land softly; she never sounds like she is reading the " +
      "news. Amused rather than excited.",
    // Slower than natural: the `ouvir` mode exists for a five-year-old who is
    // following the story by ear alone.
    settings: { stability: 0.7, similarityBoost: 0.75, speed: 0.9 },
  },
  {
    id: "contador",
    label: "O contador de histórias",
    description: "Uma voz de moço, animada, boa para quem gosta de aventura.",
    provider: "google",
    providerVoiceId: "pt-BR-Chirp3-HD-Achird",
    personality:
      "A young man telling a story to a child who is already leaning forward. " +
      "Livelier than a bedtime voice, but never shouting and never cartoonish. " +
      "He enjoys the funny parts without winking at the adult in the room.",
    settings: { stability: 0.6, similarityBoost: 0.75, speed: 1.0 },
  },
];

/**
 * The voice a child gets before anyone has chosen one.
 *
 * The device voice, because it is the only one that needs no account, no key and
 * no billing — narration works on a fresh clone. It is not the best voice here
 * and it is not meant to be.
 *
 * Moving this to `vitoria` once a Google key is configured is a reasonable thing
 * to want, and it is a decision, not a tweak: every profile that never picked a
 * voice silently changes narrator. Record it in docs/decisions.md if you do it.
 */
export const DEFAULT_VOICE_ID = "dispositivo";

export function defaultVoice(): Voice {
  return voiceById(DEFAULT_VOICE_ID);
}

/**
 * Resolves a stored `profiles.preferred_voice`. Throws on an unknown id rather
 * than falling back: a profile pointing at a voice we deleted is a bug we want to
 * see, not a story that quietly changes narrator.
 */
export function voiceById(id: string): Voice {
  const voice = VOICES.find((v) => v.id === id);
  if (!voice) throw new Error(`unknown voice: ${id}`);
  return voice;
}

/**
 * The voices worth offering in the picker, given what is configured.
 *
 * `configured` is the set of server providers that have credentials on this
 * deployment. Offering a voice we cannot synthesize is worse than offering
 * fewer: the parent picks it and the story goes silent.
 */
export function availableVoices(configured: ReadonlySet<string>): Voice[] {
  return VOICES.filter(
    (voice) =>
      isReady(voice) &&
      (kindOf(voice) === "device" || configured.has(voice.provider)),
  );
}
