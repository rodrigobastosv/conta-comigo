import type { Voice } from "./types.ts";

/**
 * One sentence in, sound out. The queue drives this; it knows nothing about
 * where the audio comes from.
 *
 * `speak` resolves when the sentence has finished — or when it has failed.
 * Failing loudly here would take down a story that is otherwise generating fine,
 * and narration is an enhancement to a working product, never a dependency of
 * it. A voice that goes quiet leaves the text on screen; an exception would not.
 */
export type Speaker = {
  speak(text: string): Promise<void>;
  cancel(): void;
  pause(): void;
  resume(): void;
};

/**
 * The device's own voice, via `speechSynthesis`. Costs nothing, needs no account
 * and works on a plane.
 *
 * The voice list is the operating system's, so it differs per device and is
 * sometimes populated asynchronously — hence the lookup on every utterance
 * rather than once at construction. If the device has no Portuguese voice at
 * all, we let it read with whatever it has: a bad accent is still a story, and
 * silence is not.
 */
/** The subset of SpeechSynthesisVoice this picker needs, so it can be tested. */
export type DeviceVoice = { name: string; lang: string };

/**
 * The natural pt-BR narrators, in order of preference, across the platforms a
 * family actually uses.
 */
const PREFERRED = [
  "Luciana", // macOS / iOS, female — the one a Brazilian expects
  "Felipe", // macOS / iOS, male
  "Google português do Brasil", // Android, Chrome
  "Microsoft Francisca", // Windows
  "Microsoft Maria",
];

/**
 * Apple ships these "fun" voices in every language, and on macOS they sort
 * ahead of the real ones — so taking the first pt-BR match reads the bedtime
 * story in a cartoon voice. Measured, not guessed: on this machine the first
 * pt-BR voice is Eddy and the good one is Luciana, eight entries later.
 */
const NOVELTY = new Set([
  "Eddy",
  "Flo",
  "Grandma",
  "Grandpa",
  "Reed",
  "Rocko",
  "Sandy",
  "Shelley",
  "Jester",
  "Superstar",
  "Bells",
  "Boing",
  "Bubbles",
  "Trinoids",
  "Whisper",
  "Wobble",
  "Zarvox",
]);

/** Apple names them "Eddy (Portuguese (Brazil))"; match on the leading name. */
function isNovelty(name: string): boolean {
  return NOVELTY.has(name.split(" (")[0].trim());
}

export function pickDeviceVoice<T extends DeviceVoice>(voices: T[]): T | null {
  const brazilian = voices.filter((v) => v.lang.replace("_", "-") === "pt-BR");
  const portuguese = voices.filter((v) =>
    v.lang.toLowerCase().startsWith("pt"),
  );

  for (const wanted of PREFERRED) {
    const match = brazilian.find((v) => v.name.startsWith(wanted));
    if (match) return match;
  }

  // A plain voice we have never heard of still beats a novelty one.
  return (
    brazilian.find((v) => !isNovelty(v.name)) ??
    portuguese.find((v) => !isNovelty(v.name)) ??
    brazilian[0] ??
    portuguese[0] ??
    null
  );
}

export function deviceSpeaker(voice: Voice): Speaker {
  const synth = globalThis.speechSynthesis;

  function portugueseVoice(): SpeechSynthesisVoice | null {
    // Looked up per utterance, not once: the OS populates this list
    // asynchronously, and on some devices it is empty on first call.
    return pickDeviceVoice(synth.getVoices());
  }

  return {
    speak(text) {
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pt-BR";
        utterance.rate = voice.settings.speed;

        const preferred = portugueseVoice();
        if (preferred) utterance.voice = preferred;

        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          resolve();
        };

        /**
         * A device with no voices installed accepts `speak()` and then does
         * nothing at all — no sound, no `onend`, no error. Without this the
         * queue would wait on that sentence forever and the story would go
         * quiet after the first line, on that device only.
         *
         * The watchdog only covers the gap before speech STARTS. Once `onstart`
         * has fired the platform is doing its job, and cutting in then would
         * make two sentences overlap.
         */
        const watchdog = setTimeout(done, 2000);
        utterance.onstart = () => clearTimeout(watchdog);

        // Both paths resolve: see the note on Speaker.speak. A sentence that
        // fails to speak must not stall the queue behind it.
        utterance.onend = done;
        utterance.onerror = done;

        synth.speak(utterance);
      });
    },

    cancel() {
      // Clears the platform queue too. Safe because we only ever have one
      // utterance in flight — the PlaybackQueue serialises them.
      synth.cancel();
    },

    pause() {
      synth.pause();
    },

    resume() {
      synth.resume();
    },
  };
}

/** Is there a device voice at all? Desktop Safari, Chrome, Firefox and mobile all have one; a headless browser may not. */
export function deviceSpeechAvailable(): boolean {
  return typeof globalThis.speechSynthesis !== "undefined";
}
