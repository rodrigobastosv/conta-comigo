import Anthropic from "@anthropic-ai/sdk";

/**
 * Single client. Server code only — the key never reaches the browser.
 */
export const anthropic = new Anthropic();

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
