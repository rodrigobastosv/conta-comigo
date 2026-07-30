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

export const sceneSchema = z.strictObject({
  text: z.string().min(1),
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
 * Validates the scene against the schema AND against the rule the schema cannot
 * express: the final beat offers no choices, and every other beat offers exactly
 * two. That `choices: []` is what signals end of story to the UI.
 */
export function validateScene(raw: unknown, beat: Beat): Scene {
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

  return parsed.data;
}
