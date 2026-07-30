/**
 * Prints the pt-BR voices available on whichever providers are configured, so the
 * `providerVoiceId` fields in lib/tts/voices.ts get filled from reality instead
 * of from memory.
 *
 *   npm run voices:list
 *
 * Google's ids are public and stable (`pt-BR-Chirp3-HD-*`), and the catalogue
 * already carries two of them — this lists the other ~28 so a voice can be
 * re-cast without guessing. ElevenLabs' ids are account- and library-dependent,
 * so for that provider there is no correct value to hardcode without looking.
 *
 * Costs nothing on either provider: it only lists.
 */

export {};

const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const GOOGLE_KEY = process.env.GOOGLE_TTS_API_KEY;

if (!ELEVENLABS_KEY && !GOOGLE_KEY) {
  console.error(
    "Set ELEVENLABS_API_KEY and/or GOOGLE_TTS_API_KEY in .env.local\n" +
      "(see .env.example). The device voice needs neither — the browser brings it.",
  );
  process.exit(1);
}

function row(id: string, name: string, extra: string): void {
  console.log(`  ${id.padEnd(30)} ${name.padEnd(24)} ${extra}`);
}

if (GOOGLE_KEY) {
  type GoogleVoice = {
    name: string;
    ssmlGender: string;
    naturalSampleRateHertz: number;
  };

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/voices?languageCode=pt-BR&key=${GOOGLE_KEY}`,
  );

  if (!response.ok) {
    console.error(`google returned ${response.status}`);
  } else {
    const { voices } = (await response.json()) as { voices: GoogleVoice[] };
    console.log(`\ngoogle — ${voices.length} pt-BR voices`);
    // Chirp3-HD first: it is the tier the free monthly quota covers and the one
    // worth casting a character on.
    const ranked = [...voices].sort(
      (a, b) =>
        Number(b.name.includes("Chirp3-HD")) -
          Number(a.name.includes("Chirp3-HD")) || a.name.localeCompare(b.name),
    );
    for (const voice of ranked) {
      row(voice.name, voice.ssmlGender.toLowerCase(), "");
    }
  }
}

if (ELEVENLABS_KEY) {
  type ElevenVoice = {
    voice_id: string;
    name: string;
    labels?: Record<string, string>;
    verified_languages?: { language: string; accent?: string }[];
  };

  const response = await fetch(
    "https://api.elevenlabs.io/v2/voices?page_size=100",
    { headers: { "xi-api-key": ELEVENLABS_KEY } },
  );

  if (!response.ok) {
    console.error(`elevenlabs returned ${response.status}`);
  } else {
    const { voices } = (await response.json()) as { voices: ElevenVoice[] };

    // Portuguese first: Flash v2.5 is multilingual, so any voice CAN read pt-BR
    // — but a voice recorded in Portuguese does not carry an accent into a
    // Brazilian child's bedtime story.
    const speaksPortuguese = (v: ElevenVoice) =>
      v.verified_languages?.some((l) =>
        l.language.toLowerCase().startsWith("pt"),
      ) ?? false;

    const ranked = [...voices].sort(
      (a, b) => Number(speaksPortuguese(b)) - Number(speaksPortuguese(a)),
    );

    console.log(`\nelevenlabs — ${voices.length} voices (pt-BR first)`);
    for (const voice of ranked) {
      row(
        voice.voice_id,
        voice.name,
        [
          speaksPortuguese(voice) ? "pt" : "  ",
          Object.values(voice.labels ?? {}).join(", "),
        ].join(" "),
      );
    }
  }
}

console.log("\nPaste an id into providerVoiceId in lib/tts/voices.ts.");
