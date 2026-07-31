import { createFakeScene, usingFakeModel } from "@/lib/fake-scene";
import { generateScene } from "@/lib/generate-scene";
import { createSceneHandler } from "@/lib/scene-route";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The handler itself is in lib/scene-route.ts, where it can be tested without a
 * server and without spending money at the model. This file is the wiring.
 *
 * Which narrator answers is decided here and only here: with FAKE_MODEL set, the
 * canned one, so the rest of the product can be built without a key and without
 * a bill. The switch is opt-in and never inferred from a missing key — a
 * deployment whose key expired must fail loudly, not quietly start reading
 * canned prose to a child.
 */
export const POST = createSceneHandler({
  generate: usingFakeModel() ? createFakeScene() : generateScene,
});
