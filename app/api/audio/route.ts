import { createAudioHandler } from "@/lib/tts/audio-route";
import { configuredProviders } from "@/lib/tts/providers";

export const runtime = "nodejs";

/**
 * The handler itself is in lib/tts/audio-route.ts, where it can be tested
 * without a server and without spending anyone's quota. This file is the wiring.
 *
 * The device voice does not come through here — it never leaves the browser.
 * This route exists only for the server tiers.
 */
export const POST = createAudioHandler({ providers: configuredProviders });
