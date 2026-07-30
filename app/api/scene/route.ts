import { generateScene } from "@/lib/generate-scene";
import { createSceneHandler } from "@/lib/scene-route";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The handler itself is in lib/scene-route.ts, where it can be tested without a
 * server and without spending money at the model. This file is the wiring.
 */
export const POST = createSceneHandler({ generate: generateScene });
