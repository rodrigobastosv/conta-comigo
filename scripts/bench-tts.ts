/**
 * Measures TIME TO FIRST PLAYABLE AUDIO for every server voice in the catalogue.
 *
 *   npm run tts:bench
 *
 * This is the number that decides whether the narration design works, and it is
 * the one number a vendor's marketing page cannot give you: it has to be measured
 * from where the users are, on the sentences this product actually generates.
 *
 * Budget: first sound in 1–2 s, counted from the child tapping "Começar a
 * história" — and that budget also has to cover generating the first sentence. So
 * the TTS share is a few hundred milliseconds, not a second.
 *
 * "First playable" and not "first byte", because the providers differ in kind:
 * ElevenLabs streams, so the first chunk arrives long before the sentence is
 * finished; Google returns the whole clip in one response. Per sentence — which
 * is the only unit this app ever synthesizes — what matters is when audio can
 * start playing, and that is what both numbers below mean.
 *
 * The device voice is not benchmarked: it never leaves the browser.
 *
 * Costs real money on metered providers. Google's free monthly quota absorbs a
 * run of this comfortably.
 */

import { VOICES } from "../lib/tts/voices.ts";
import { isReady, kindOf, type Voice } from "../lib/tts/types.ts";

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_TTS_API_KEY;

const ELEVENLABS_MODEL = "eleven_flash_v2_5";
// mp3 at 22 kHz: small enough that the first chunk arrives fast, good enough for
// a story read aloud on a phone or an iPad speaker.
const ELEVENLABS_FORMAT = "mp3_22050_32";

const RUNS = 5;

/** Real first sentences, at the length the reading levels actually produce. */
const SENTENCES = [
  "Naquela manhã, tinha uma loja nova na esquina da padaria.",
  "Toda coisa perdida quer voltar pra casa, disse Dona Vitória, limpando os óculos no avental.",
];

async function elevenlabs(voice: Voice, sentence: string): Promise<void> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice.providerVoiceId}/stream?output_format=${ELEVENLABS_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: sentence,
        model_id: ELEVENLABS_MODEL,
        language_code: "pt",
        voice_settings: {
          stability: voice.settings.stability,
          similarity_boost: voice.settings.similarityBoost,
          speed: voice.settings.speed,
        },
      }),
    },
  );

  if (!response.ok || !response.body) {
    throw new Error(`elevenlabs returned ${response.status}`);
  }

  // The first chunk is the measurement. Everything after it is just cost.
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
}

async function google(voice: Voice, sentence: string): Promise<void> {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: sentence },
        voice: { languageCode: "pt-BR", name: voice.providerVoiceId },
        // Chirp3-HD honours speakingRate but not pitch.
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: voice.settings.speed,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`google returned ${response.status}`);
  }

  // No streaming on v1: the clip is playable when the response is complete.
  await response.json();
}

const KEY_FOR = { elevenlabs: ELEVENLABS_KEY, google: GOOGLE_KEY } as const;
const CALL = { elevenlabs, google } as const;

const candidates = VOICES.filter(
  (v) =>
    kindOf(v) === "server" &&
    isReady(v) &&
    KEY_FOR[v.provider as keyof typeof KEY_FOR],
);

if (candidates.length === 0) {
  console.error(
    "Nothing to measure. Set ELEVENLABS_API_KEY and/or GOOGLE_TTS_API_KEY in\n" +
      ".env.local (see .env.example). The device voice is not benchmarked — it\n" +
      "never leaves the browser.",
  );
  process.exit(1);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

console.log(`runs: ${RUNS}   metric: ms to first playable audio\n`);
console.log("voice        provider    words  p50 ms  p95 ms  worst");

for (const voice of candidates) {
  const call = CALL[voice.provider as keyof typeof CALL];

  for (const sentence of SENTENCES) {
    const samples: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const started = performance.now();
      await call(voice, sentence);
      samples.push(performance.now() - started);
    }

    console.log(
      [
        voice.id.padEnd(12),
        voice.provider.padEnd(11),
        String(sentence.split(/\s+/).length).padStart(5),
        percentile(samples, 0.5).toFixed(0).padStart(7),
        percentile(samples, 0.95).toFixed(0).padStart(7),
        Math.max(...samples).toFixed(0).padStart(6),
      ].join(" "),
    );
  }
}

console.log(
  "\nPaste this table into issue #11 and into docs/decisions.md. Vendor-published\n" +
    "latency is not evidence; this is.",
);
