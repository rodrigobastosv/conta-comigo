/**
 * The seam between the app and whichever voice provider we are paying — or not
 * paying — this month.
 *
 * Nothing outside `lib/tts/` should name a provider. A voice is identified by OUR
 * id everywhere else — in `profiles.preferred_voice`, in the parent-facing picker
 * — so switching providers, or re-casting one voice onto a different provider,
 * does not orphan a single stored row.
 *
 * No audio is ever stored: every listen re-synthesizes. See
 * docs/decisions.md#the-narration-is-not-stored-anywhere.
 */

export type ProviderName = "device" | "google" | "elevenlabs";

/**
 * Where the audio is made, which is the only distinction the rest of the app
 * cares about:
 *
 * - `device` — the browser's own `speechSynthesis`. Costs nothing, needs no
 *   account, works offline, and never touches the server.
 * - `server` — a synthesis API behind our route, which streams the audio straight
 *   through to the client and keeps none of it.
 *
 * The playback queue (issue #13) branches on this once. The audio route (issue
 * #12) only ever exists for `server`.
 */
export type ProviderKind = "device" | "server";

export const PROVIDER_KIND = {
  device: "device",
  google: "server",
  elevenlabs: "server",
} as const satisfies Record<ProviderName, ProviderKind>;

/**
 * How a voice delivers the narration.
 *
 * Prose, because it is the lowest common denominator between providers: some
 * (OpenAI gpt-4o-mini-tts) take free-text delivery instructions verbatim, others
 * take only the numbers below, and for those it documents what the numbers are
 * trying to buy. Written in English because it is direction for a tool, not text
 * a child ever hears.
 */
export type VoiceSettings = {
  /** 0..1. Lower wanders more between sentences; a narrator wants it high. Ignored by `device`. */
  stability: number;
  /** 0..1. How hard to stay glued to the original voice's timbre. Ignored by `device`. */
  similarityBoost: number;
  /** 1 = the voice's natural pace. Below 1 is slower, which small children need. Honoured everywhere. */
  speed: number;
};

export type Voice = {
  /**
   * OUR id, stored in `profiles.preferred_voice`.
   * Stable forever: never rename one, and never re-cast one onto a
   * different-sounding voice without meaning to. Both mistakes are silent — the
   * parent picked "Dona Vitória" and one day a stranger reads the bedtime story.
   */
  id: string;
  /** Shown to the parent in the picker. pt-BR, like everything a person here reads. */
  label: string;
  /** One line, pt-BR, so a parent can choose without playing a sample first. */
  description: string;
  provider: ProviderName;
  /**
   * The provider's own id. Swapping it is an allowed, deliberate act; swapping
   * `id` is not.
   *
   * On `server` providers this is required before anything can be synthesized.
   * On `device` it is at most a hint at an OS voice name (the available voices
   * differ per device), and null means "whatever pt-BR voice this device has".
   */
  providerVoiceId: string | null;
  /** Delivery direction. See VoiceSettings. */
  personality: string;
  settings: VoiceSettings;
};

/**
 * What issue #12's audio route will call, for `server` voices only. Deliberately
 * one sentence in, one audio stream out: the whole narration design is per
 * sentence, so the first sentence can play while the third is still being
 * generated.
 *
 * Returning a stream rather than a Buffer matters for providers that stream
 * (ElevenLabs). Google's v1 `text:synthesize` returns the whole clip in one
 * response — which is fine here precisely because the unit is one short sentence,
 * not a whole scene. An adapter may resolve the stream once it has the clip; what
 * it must not do is wait for more than the sentence it was asked for.
 */
export type ServerTtsProvider = {
  name: ProviderName;
  /** Streams audio for one sentence. Throws if the voice has no providerVoiceId. */
  synthesize(sentence: string, voice: Voice): Promise<ReadableStream<Uint8Array>>;
};

export function kindOf(voice: Voice): ProviderKind {
  return PROVIDER_KIND[voice.provider];
}

/**
 * Can this voice actually speak today? A device voice always can — the browser
 * brings it. A server voice cannot until someone fills in its provider id.
 */
export function isReady(voice: Voice): boolean {
  return kindOf(voice) === "device" || voice.providerVoiceId !== null;
}
