// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import type { ServerTtsProvider, Voice } from "./types.ts";

/**
 * Google Cloud Text-to-Speech, the free rung — 1M characters a month on
 * Chirp3-HD, which at ~3.5k characters per five-scene story is roughly 285
 * stories for nothing. See
 * docs/decisions.md#narration-starts-free-on-the-device-and-buys-quality-later.
 *
 * Server only, like every other file that reads a key.
 */

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/**
 * MP3, not LINEAR16. The clip crosses our own route to the browser on every
 * sentence of every listen — a twelve-word sentence is a few KB as MP3 against
 * well over a hundred as raw PCM — and `decodeAudioData` in the browser takes
 * either.
 */
const AUDIO_ENCODING = "MP3";

/**
 * The request body, split out from the call so a test can assert on it without a
 * key and without spending quota. Getting this wrong is quiet: Google accepts
 * fields it does not honour and returns perfectly good audio in the wrong voice.
 */
export function synthesisRequest(sentence: string, voice: Voice) {
  if (!voice.providerVoiceId) {
    throw new Error(`voice ${voice.id} has no google voice id`);
  }

  return {
    input: { text: sentence },
    voice: { languageCode: "pt-BR", name: voice.providerVoiceId },
    /**
     * `speakingRate` only. Chirp3-HD ignores `pitch` and rejects SSML, and
     * `stability` / `similarityBoost` are ElevenLabs' knobs — none of them are
     * errors here, they are silently dropped, which is worse. What those
     * settings buy on this provider is written in the voice's `personality`,
     * for whoever casts the same character on a provider that reads it.
     */
    audioConfig: {
      audioEncoding: AUDIO_ENCODING,
      speakingRate: voice.settings.speed,
    },
  };
}

/**
 * v1 answers with the whole clip, base64 in JSON — there is no streaming
 * endpoint. That is fine here and only here: the unit we ever ask for is one
 * short sentence, so "the response is complete" and "the audio can start
 * playing" are the same moment. Asking for a whole scene would not be fine.
 */
export function decodeAudioContent(payload: unknown): Uint8Array {
  const content = (payload as { audioContent?: unknown })?.audioContent;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("google returned no audioContent");
  }

  // `atob` rather than `Buffer`: nothing here needs node, and the route can move
  // to the edge runtime the day the first token budget says it should.
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function googleProvider(apiKey: string): ServerTtsProvider {
  return {
    name: "google",

    async synthesize(sentence, voice) {
      const response = await fetch(
        // API-key auth goes in the query string on this endpoint. Server side,
        // over TLS, and the key never reaches the browser.
        `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(synthesisRequest(sentence, voice)),
        },
      );

      // The status, not the body: Google's error message can quote the key's
      // project and the route must never hand a provider's prose to a client.
      if (!response.ok) {
        throw new Error(`google returned ${response.status}`);
      }

      const bytes = decodeAudioContent(await response.json());
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  };
}
