import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  costOfScene,
  costOfStory,
  inCents,
  storiesInsideFreeNarration,
} from "./cost.ts";

/**
 * The arithmetic behind every cost decision in this repo.
 *
 * Worth pinning down because the numbers are small enough that a factor-of-ten
 * error looks plausible — "0.8¢" and "8¢" are both believable prices for a
 * story, and only one of them survives a thousand children.
 */

describe("what a scene costs", () => {
  it("prices input, output and cache at their own rates", () => {
    // 1M input at $5, 1M output at $25.
    const scene = costOfScene({ input_tokens: 1_000_000, output_tokens: 0 });
    assert.equal(scene.usd, 5);

    const written = costOfScene({ input_tokens: 0, output_tokens: 1_000_000 });
    assert.equal(written.usd, 25);
  });

  it("charges a cache read at a tenth and a write at a quarter more", () => {
    const read = costOfScene({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    assert.equal(read.usd, 0.5);

    const write = costOfScene({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    assert.equal(write.usd, 6.25);

    // The whole reason the constitution and the bible sit in a cached block:
    // reading is 12.5× cheaper than writing, and a story reads four times.
    assert.ok(write.usd > read.usd * 12);
  });

  it("treats a missing cache field as zero, not as an error", () => {
    const scene = costOfScene({ input_tokens: 100, output_tokens: 100 });
    assert.equal(scene.cacheReadTokens, 0);
    assert.equal(scene.cacheWriteTokens, 0);
  });

  it("reports zero for a model with no price rather than guessing", () => {
    const scene = costOfScene(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      "claude-from-the-future",
    );
    assert.equal(scene.usd, 0);
  });
});

describe("what a story costs", () => {
  it("is the sum of its beats", () => {
    const beats = [1, 2, 3, 4, 5].map(() =>
      costOfScene({ input_tokens: 500, output_tokens: 500 }),
    );
    const total = costOfStory(beats);

    assert.ok(Math.abs(total - 5 * (500 * 5e-6 + 500 * 25e-6)) < 1e-12);
  });

  it("reads in cents, because a story never costs a dollar", () => {
    assert.equal(inCents(0.08307), "8.307¢");
    assert.equal(inCents(0), "0.000¢");
  });
});

describe("the narration half", () => {
  it("counts stories against the free month, not dollars", () => {
    // Measured: an `ouvir` story is ~3455 characters of narration.
    assert.equal(storiesInsideFreeNarration(3455), 289);
    // A `ler` story is roughly twice the prose, so roughly half the stories.
    assert.equal(storiesInsideFreeNarration(6047), 165);
  });

  it("does not divide by zero on a story nobody narrates", () => {
    assert.equal(storiesInsideFreeNarration(0), Infinity);
  });
});
