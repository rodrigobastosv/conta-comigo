import { configuredProviderNames } from "@/lib/tts/providers";
import { availableVoices } from "@/lib/tts/voices";

export const runtime = "nodejs";
/**
 * Read at request time, never baked at build: whether a key exists is a property
 * of the running deployment. Statically rendered, this would keep answering
 * "device voice only" after someone adds one.
 */
export const dynamic = "force-dynamic";

/**
 * Which voices this deployment can actually speak.
 *
 * Ids only. The labels, the descriptions and the tier all live in the catalogue,
 * which the client already imports — the one fact the browser cannot work out
 * for itself is which providers have credentials here, and that is exactly what
 * this returns. No provider name and no provider voice id crosses the wire.
 */
export function GET(): Response {
  const voices = availableVoices(configuredProviderNames()).map((v) => v.id);
  return Response.json({ voices });
}
