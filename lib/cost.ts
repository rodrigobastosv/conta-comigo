// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import { MODEL } from "./anthropic.ts";
import { FINAL_BEAT } from "./types.ts";

/**
 * What a story costs.
 *
 * **The unit of this project is one story, not one token.** Nobody can hold
 * "$5 per million input tokens" in their head while deciding whether a feature
 * is worth building; everybody can hold "a story costs about a cent". Every
 * cost decision here — speculative pre-generation, raising `EFFORT`, a second
 * narration tier — gets argued in stories, and this file is what converts.
 *
 * A story is five beats. It is also, in `ouvir` mode, five scenes read aloud,
 * so the narration is part of the price and not a footnote.
 */

/** USD per million tokens. Update when the price list moves. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
};

/**
 * Cache multipliers, applied to the input price.
 *
 * A read is a tenth of the price; a write is a quarter more than the price. The
 * write is charged once per story — the constitution and the bible are
 * identical across all five beats, which is the entire reason they sit in the
 * cached `system` block. See
 * docs/decisions.md#the-cache-is-in-the-right-place.
 */
const CACHE_READ = 0.1;
const CACHE_WRITE_5M = 1.25;

/** What the SDK reports on a finished message. Structural, so tests can fake it. */
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type SceneCost = {
  /** USD. Small — six decimal places are meaningful here. */
  usd: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

export function costOfScene(usage: Usage, model = MODEL): SceneCost {
  const price = PRICES[model];
  if (!price) {
    // A model with no price is a number nobody should trust. Zero is the honest
    // answer, and the log line says why.
    console.warn(`[cost] no price for ${model}; reporting 0`);
    return {
      usd: 0,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };
  }

  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const perToken = price.input / 1_000_000;

  return {
    usd:
      usage.input_tokens * perToken +
      write * perToken * CACHE_WRITE_5M +
      read * perToken * CACHE_READ +
      usage.output_tokens * (price.output / 1_000_000),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens: write,
    cacheReadTokens: read,
  };
}

export function costOfStory(scenes: SceneCost[]): number {
  return scenes.reduce((total, scene) => total + scene.usd, 0);
}

/**
 * A story's price, in the words a person would use.
 *
 * Fractions of a cent are the normal case, so "$0.01" would round almost every
 * interesting number to the same string.
 */
export function inCents(usd: number): string {
  return `${(usd * 100).toFixed(3)}¢`;
}

/**
 * The narration half of a story, in characters.
 *
 * Google's free tier is a monthly character quota rather than a per-call
 * charge, so the honest unit here is "how much of the month one story spends",
 * not a price. A story that costs nothing until the 285th one of the month
 * costs nothing in a way that "$0.00" would misrepresent.
 */
export const FREE_TTS_CHARACTERS_PER_MONTH = 1_000_000;

export function storiesInsideFreeNarration(charactersPerStory: number): number {
  if (charactersPerStory <= 0) return Infinity;
  return Math.floor(FREE_TTS_CHARACTERS_PER_MONTH / charactersPerStory);
}

/** Beats per story, for anything converting a per-beat number to a per-story one. */
export const BEATS_PER_STORY = FINAL_BEAT;
