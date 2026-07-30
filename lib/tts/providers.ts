// Relative, with the extension: see the note in voices.ts.
import { googleProvider } from "./google.ts";
import type { ProviderName, ServerTtsProvider } from "./types.ts";

/**
 * Which server voices this deployment can actually speak.
 *
 * Server only — it reads the keys. Like lib/anthropic.ts, nothing in
 * components/ may import it, and the variables must never gain a
 * `NEXT_PUBLIC_` prefix.
 *
 * Read per call rather than once at module load: the answer is a property of the
 * running deployment, not of the build, and a route that baked it in at build
 * time would keep claiming it has no voices after someone adds the key.
 */
export function configuredProviders(): Map<ProviderName, ServerTtsProvider> {
  const providers = new Map<ProviderName, ServerTtsProvider>();

  const google = process.env.GOOGLE_TTS_API_KEY;
  if (google) providers.set("google", googleProvider(google));

  /**
   * ElevenLabs is the paid rung and has no adapter yet, on purpose: no voice in
   * the catalogue is cast on it, so an adapter here would be code nothing can
   * reach. Adding it is this file plus a `provider: "elevenlabs"` entry in
   * voices.ts — `availableVoices` already hides what has no credentials.
   */

  return providers;
}

/** The provider names with credentials here, which is all `availableVoices` needs. */
export function configuredProviderNames(): Set<string> {
  return new Set(configuredProviders().keys());
}
