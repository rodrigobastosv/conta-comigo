import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Single client, built on first use. Server code only — the key never reaches
 * the browser.
 *
 * Lazy rather than a module-level constant because the constructor throws when
 * ANTHROPIC_API_KEY is missing, and importing this module is not the same thing
 * as calling the model: `npm run build` walks the route files, and a developer
 * running on FAKE_MODEL has no key at all. Both would fail at import time on a
 * client nobody was going to use.
 */
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export const MODEL = "claude-opus-5";

/**
 * Streaming, so max_tokens can be generous with no risk of an HTTP timeout.
 * A scene in `ler` mode lands around ~350 tokens; the rest is headroom for thinking.
 */
export const MAX_TOKENS = 4000;

/**
 * `low` is the starting point: on a short scene with a rigid format it delivers
 * well and the first token arrives fast, which is what matters here. Raise it to
 * `medium` if the evaluation shows the choices coming out unbalanced.
 */
export const EFFORT = "low" as const;
