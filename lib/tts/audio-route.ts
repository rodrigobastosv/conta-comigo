import { z } from "zod";
// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import { kindOf, type ProviderName, type ServerTtsProvider } from "./types.ts";
import { VOICES } from "./voices.ts";

/**
 * Everything `POST /api/audio` does, minus the Next.js wiring — same split as
 * lib/scene-route.ts, and for the same reason: the provider is a parameter, so
 * this can be tested without a server and without spending anyone's quota.
 *
 * One sentence in, one audio stream out. That is the whole narration design (see
 * docs/decisions.md#the-narration-unit-is-the-sentence-not-the-scene): the first
 * sentence has to be playing while the third is still being written, so this
 * route must never be asked for a scene.
 *
 * Nothing is stored here — not on disk, not in a bucket, not in a CDN. See
 * docs/decisions.md#the-narration-is-not-stored-anywhere.
 */

/**
 * Longer than any sentence the reading levels produce, and short enough that one
 * call cannot become a scene. A client that asks for more is a bug or an abuse;
 * either way it is a 400 before anything is synthesized.
 */
const MAX_SENTENCE_CHARS = 400;

/**
 * Characters per key per window — the ceiling is on characters and not on calls
 * because characters are what the provider bills. 60k an hour is about 17 full
 * stories, which is past what a family reads and in step with the 60
 * generations/hour the scene route already allows.
 */
const DEFAULT_CHARS_PER_WINDOW = 60_000;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

const bodySchema = z.strictObject({
  /** OUR voice id, from lib/tts/voices.ts. Never a provider's. */
  voiceId: z.string().min(1).max(40),
  text: z.string().min(1).max(MAX_SENTENCE_CHARS),
});

export type ProviderLookup = () => Map<ProviderName, ServerTtsProvider>;

export type AudioRouteOptions = {
  providers: ProviderLookup;
  charsPerWindow?: number;
  windowMs?: number;
};

export function createAudioHandler({
  providers,
  charsPerWindow = DEFAULT_CHARS_PER_WINDOW,
  windowMs = DEFAULT_WINDOW_MS,
}: AudioRouteOptions) {
  /**
   * Same shape, same caveat as the scene route's: in process memory, so it
   * bounds one instance and not a deployment.
   * TODO: move to Redis/Supabase with the ceiling in issue #14 — one store, both
   * routes.
   */
  const counter = new Map<string, { chars: number; expiresAt: number }>();

  function overLimit(key: string, chars: number): boolean {
    const now = Date.now();
    const current = counter.get(key);

    if (!current || current.expiresAt < now) {
      counter.set(key, { chars, expiresAt: now + windowMs });
      return chars > charsPerWindow;
    }

    current.chars += chars;
    return current.chars > charsPerWindow;
  }

  return async function POST(req: Request): Promise<Response> {
    const key = req.headers.get("x-forwarded-for") ?? "local";

    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return Response.json({ error: "invalid-request" }, { status: 400 });
    }

    const { voiceId, text } = body.data;

    /**
     * `VOICES.find` and not `voiceById`: that one throws on an unknown id, which
     * is right for our own code — a profile pointing at a deleted voice is a bug
     * we want to see — and wrong for a request body, where it is a 400.
     */
    const voice = VOICES.find((v) => v.id === voiceId);
    if (!voice) {
      return Response.json({ error: "unknown-voice" }, { status: 400 });
    }

    // The device voice never leaves the browser. Asking this route for it means
    // the client took the wrong branch, and answering would hide that.
    if (kindOf(voice) !== "server") {
      return Response.json({ error: "not-a-server-voice" }, { status: 400 });
    }

    const provider = providers().get(voice.provider);
    if (!provider) {
      // The picker only offers voices this deployment has credentials for, so
      // this is a key that was removed under a client that is still running.
      return Response.json({ error: "voice-unavailable" }, { status: 503 });
    }

    // After validation, before synthesis: this is the call that costs, so it
    // must refuse before it spends.
    if (overLimit(key, text.length)) {
      return Response.json({ error: "audio-limit" }, { status: 429 });
    }

    let audio: ReadableStream<Uint8Array>;
    try {
      audio = await provider.synthesize(text, voice);
    } catch {
      // A code, never the provider's message or a stack: the client is a child's
      // browser, and the message can name our project and quota.
      return Response.json({ error: "synthesis-failed" }, { status: 502 });
    }

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        // Nothing keeps this audio, and that includes anything between us and
        // the browser.
        "Cache-Control": "no-store",
      },
    });
  };
}
