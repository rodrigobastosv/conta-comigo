import { audioContext, unlockAudio } from "../audio.ts";
import { kindOf, type Voice } from "./types.ts";

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
  /**
   * "This sentence is coming, get ready." Optional, and a no-op for anything
   * that has nothing to fetch.
   *
   * The queue calls it the moment a sentence arrives, which is long before its
   * turn. Without it a server voice would only start fetching sentence N+1 once
   * sentence N stopped playing, and the story would gain a network round trip of
   * silence between every sentence — the exact hole the per-sentence design
   * exists to avoid.
   */
  prime?(text: string): void;
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

/**
 * A voice synthesized behind our route — today Google's Chirp3-HD. Costs a
 * network round trip per sentence and sounds like a person reading, which is the
 * entire trade.
 *
 * Plays through the `AudioContext` that lib/audio.ts unlocks on the "Começar a
 * história" tap, rather than through an `<audio>` element: iOS grants that
 * permission once, inside a user gesture, and we already spend the gesture
 * there. It also gives `pause` and `resume` for free, and stops a sentence in
 * the same tick a choice is tapped.
 *
 * The whole clip per sentence, decoded before it plays. That is fine at this
 * unit and only at this unit — the sentence is a second or two of audio, and the
 * fetch for the next one is already in flight while this one is speaking.
 */
export function serverSpeaker(voice: Voice, endpoint = "/api/audio"): Speaker {
  /**
   * Sentence text → its decoded audio, started by `prime` the moment the
   * sentence arrives. Bounded by the scene: a speaker lives exactly as long as
   * its queue, and every scene gets a new one.
   */
  const decoded = new Map<string, Promise<AudioBuffer | null>>();

  let playing: AudioBufferSourceNode | null = null;
  /**
   * Bumped by `cancel`, so audio that was still being fetched when the child
   * tapped a choice cannot start playing over the next scene. `cancel` is not
   * terminal — `PlaybackQueue.replay` cancels and immediately speaks again.
   */
  let generation = 0;

  function context(): AudioContext | null {
    // Normally already unlocked, on the gesture. This covers narration turned on
    // in a session that never went through that button.
    if (!audioContext()) unlockAudio();
    return audioContext();
  }

  async function fetchAudio(text: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voice.id, text }),
      });
      if (!response.ok) throw new Error(String(response.status));

      const bytes = await response.arrayBuffer();
      const ctx = context();
      if (!ctx) return null;
      return await ctx.decodeAudioData(bytes);
    } catch {
      /**
       * Null, never a throw: see the note on Speaker.speak. A sentence that
       * fails to synthesize leaves the text on screen and the story working.
       *
       * And deliberately no fallback to the device voice — a narrator that
       * changes halfway through a scene is worse than one that goes quiet. See
       * docs/decisions.md#a-voice-is-a-character-and-its-id-is-permanent.
       */
      decoded.delete(text); // so a retry can happen if this sentence comes round again
      return null;
    }
  }

  function prime(text: string): void {
    if (!decoded.has(text)) decoded.set(text, fetchAudio(text));
  }

  return {
    prime,

    speak(text) {
      // The queue primes on arrival; this covers `replay`, which does not.
      prime(text);
      const pending = decoded.get(text)!;
      const mine = generation;

      return new Promise<void>((resolve) => {
        void pending.then((audio) => {
          const ctx = context();
          // Cancelled while this was in flight, or nothing came back.
          if (mine !== generation || !audio || !ctx) return resolve();

          const node = ctx.createBufferSource();
          node.buffer = audio;
          node.connect(ctx.destination);
          node.onended = () => {
            if (playing === node) playing = null;
            resolve();
          };

          playing = node;
          node.start();
        });
      });
    },

    cancel() {
      generation += 1;
      if (!playing) return;
      // Dropped first: `stop()` fires `onended`, and letting it resolve would
      // advance the queue to the next sentence of a scene the child has left.
      playing.onended = null;
      playing.stop();
      playing = null;
    },

    /**
     * Suspends the context rather than the node, which is the only way to resume
     * an `AudioBufferSourceNode` where it stopped. Safe because this context has
     * exactly one consumer: the narration, one sentence at a time.
     */
    pause() {
      void context()?.suspend();
    },

    resume() {
      void context()?.resume();
    },
  };
}

/**
 * The one place the app branches on where a voice is synthesized. Everything
 * above and below this line — the queue, the highlight, the buttons — is the
 * same code for a voice that costs nothing and a voice that costs money.
 */
export function speakerFor(voice: Voice): Speaker {
  return kindOf(voice) === "device"
    ? deviceSpeaker(voice)
    : serverSpeaker(voice);
}
