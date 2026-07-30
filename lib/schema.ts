import { z } from "zod";
// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import { FINAL_BEAT, type Beat, type Scene } from "./types.ts";

/**
 * Output contract of the model. Never trust the JSON that comes back: it will
 * return 3 choices when you asked for 2, and the right move is to fail and
 * regenerate — not to break the screen.
 *
 * The field order here matters: "text" comes first because the route extracts
 * that field from the partial JSON while it is still arriving (see
 * lib/stream-json.ts).
 */
export const choiceSchema = z.strictObject({
  label: z.string().min(1).max(80),
  icon: z.string().min(1).max(8),
});

/**
 * Layer 2 of an invented world, written by the model on beat 1.
 *
 * The floor of 3 invariants is not decoration: they are what stops beat 4 from
 * contradicting beat 1 in a world nobody wrote by hand. The ceiling of 5 is so
 * they stay in the prompt of every later beat without crowding out the facts.
 */
export const worldSchema = z.strictObject({
  title: z.string().min(1).max(60),
  refrain: z.string().min(1).max(120),
  invariants: z.array(z.string().min(1).max(200)).min(3).max(5),
});

export const sceneSchema = z.strictObject({
  text: z.string().min(1),
  // After `text` on purpose. It has to exist for an invented world to stay
  // coherent, and it must not arrive before the prose — see
  // docs/decisions.md#the-field-order-in-the-schema-matters.
  world: worldSchema.nullable(),
  new_facts: z.array(z.string().min(1)).max(6),
  choices: z.array(choiceSchema).max(2),
});

export type RawScene = z.infer<typeof sceneSchema>;

export class SceneInvalidError extends Error {
  // Assigned in the body rather than declared as a constructor parameter
  // property: `npm test` runs this through node's strip-only type stripping,
  // which rejects `constructor(readonly x: T)` outright.
  readonly reason: string;

  constructor(reason: string) {
    super(`invalid scene: ${reason}`);
    this.name = "SceneInvalidError";
    this.reason = reason;
  }
}

/**
 * Validates the scene against the schema AND against the two rules the schema
 * cannot express.
 *
 * 1. The final beat offers no choices, and every other beat offers exactly two.
 *    That `choices: []` is what signals end of story to the UI.
 * 2. A world comes back exactly when one was asked for. Missing it on beat 1 of
 *    an invented world leaves the next four beats with no layer 2 at all, and
 *    the story drifts with nothing to catch it; returning one anywhere else
 *    means the model is trying to rewrite a world that already exists.
 *
 * `expectsWorld` is the caller's intent, not a guess from the payload — only the
 * generator knows whether this run's bible invents its world.
 */
export function validateScene(
  raw: unknown,
  beat: Beat,
  expectsWorld = false,
): Scene {
  const parsed = sceneSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SceneInvalidError(parsed.error.issues[0]?.message ?? "format");
  }

  const expected = beat === FINAL_BEAT ? 0 : 2;
  if (parsed.data.choices.length !== expected) {
    throw new SceneInvalidError(
      `beat ${beat} requires ${expected} choices, got ${parsed.data.choices.length}`,
    );
  }

  if (expectsWorld && !parsed.data.world) {
    throw new SceneInvalidError(
      "an invented world must return a world on beat 1",
    );
  }
  if (!expectsWorld && parsed.data.world) {
    throw new SceneInvalidError("this scene must not return a world");
  }

  return parsed.data;
}
