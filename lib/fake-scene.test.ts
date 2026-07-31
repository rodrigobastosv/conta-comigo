import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeScene, usingFakeModel } from "./fake-scene.ts";
import type { GenerationEvent } from "./generate-scene.ts";
import { FINAL_BEAT, type Beat, type SceneRequest } from "./types.ts";

/**
 * The fake exists so that everything downstream can be developed without paying
 * the model. These tests are what stop it from becoming a lie: if it can emit a
 * shape the real path would never emit, a whole afternoon of UI work is built on
 * a scene that cannot happen.
 */

/** No delays: the timing is the product's problem, not this test's. */
const fake = createFakeScene({ firstTokenMs: 0, tickMs: 0 });

function request(over: Partial<SceneRequest> = {}): SceneRequest {
  return {
    bibleId: "loja-de-coisas-perdidas",
    beat: 1,
    readingLevel: "ouvir",
    helperName: "Nina",
    facts: [],
    choiceMade: null,
    ...over,
  };
}

async function collect(over: Partial<SceneRequest> = {}) {
  const events: GenerationEvent[] = [];
  for await (const event of fake(request(over))) events.push(event);
  return events;
}

function sceneOf(events: GenerationEvent[]) {
  const last = events.at(-1);
  assert.equal(last?.type, "scene", "the last event must be the scene");
  return (last as Extract<GenerationEvent, { type: "scene" }>).scene;
}

describe("the fake narrator", () => {
  it("ends every beat with a scene that survives validateScene", async () => {
    // The fake validates internally, so an invalid draft throws rather than
    // arriving here — which is the point.
    for (const beat of [1, 2, 3, 4, 5] as Beat[]) {
      const scene = sceneOf(await collect({ beat }));
      assert.ok(scene.text.length > 0, `beat ${beat} wrote nothing`);
    }
  });

  it("offers two choices, and none on the final beat", async () => {
    for (const beat of [1, 2, 3, 4] as Beat[]) {
      assert.equal(sceneOf(await collect({ beat })).choices.length, 2);
    }
    assert.equal(
      sceneOf(await collect({ beat: FINAL_BEAT })).choices.length,
      0,
    );
  });

  it("streams deltas that add up to exactly the scene text", async () => {
    const events = await collect();
    const streamed = events
      .filter((e) => e.type === "text")
      .map((e) => e.delta)
      .join("");

    assert.equal(streamed, sceneOf(events).text);
  });

  it("closes sentences in order, covering the whole text", async () => {
    const events = await collect({ readingLevel: "ler" });
    const sentences = events.filter((e) => e.type === "sentence");

    assert.ok(sentences.length > 1, "a scene is more than one sentence");
    assert.deepEqual(
      sentences.map((s) => s.index),
      sentences.map((_, i) => i),
      "indexes must arrive in order, or the queue plays out of order",
    );
    // Punctuation and whitespace differ; the words are what the TTS speaks.
    assert.equal(
      sentences
        .map((s) => s.text)
        .join(" ")
        .replace(/\s+/g, " "),
      sceneOf(events).text.replace(/\s+/g, " "),
    );
  });

  it("declares an invented world on beat 1 and nowhere else", async () => {
    const first = sceneOf(await collect({ bibleId: "original", beat: 1 }));
    assert.ok(first.world, "beat 1 of an invented world must name it");

    const later = sceneOf(
      await collect({
        bibleId: "original",
        beat: 2,
        world: first.world,
        choiceMade: "Abrir o caderno",
      }),
    );
    assert.equal(later.world, null, "a world is not invented twice");
  });

  it("never declares a world for a bible that already has one", async () => {
    const scene = sceneOf(
      await collect({ bibleId: "loja-de-coisas-perdidas" }),
    );
    assert.equal(scene.world, null);
  });

  it("puts the helper's name in the prose", async () => {
    const scene = sceneOf(await collect({ helperName: "Tuca" }));
    assert.match(scene.text, /Tuca/);
  });

  it("writes more in `ler` than in `ouvir`", async () => {
    const listening = sceneOf(await collect({ readingLevel: "ouvir" }));
    const reading = sceneOf(await collect({ readingLevel: "ler" }));

    assert.ok(reading.text.length > listening.text.length);
  });

  it("refuses a world the registry does not know", async () => {
    const events = await collect({ bibleId: "não-existe" });
    assert.deepEqual(events, [{ type: "error", message: "unknown-world" }]);
  });
});

describe("the FAKE_MODEL switch", () => {
  it("is off unless it is asked for, and is never inferred", () => {
    const original = process.env.FAKE_MODEL;
    try {
      delete process.env.FAKE_MODEL;
      assert.equal(usingFakeModel(), false);

      // A missing API key must not turn it on: a deployment whose key expired
      // has to fail, not start reading canned prose to a child.
      const key = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      assert.equal(usingFakeModel(), false);
      if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;

      process.env.FAKE_MODEL = "0";
      assert.equal(usingFakeModel(), false);

      process.env.FAKE_MODEL = "1";
      assert.equal(usingFakeModel(), true);

      process.env.FAKE_MODEL = "true";
      assert.equal(usingFakeModel(), true);
    } finally {
      if (original === undefined) delete process.env.FAKE_MODEL;
      else process.env.FAKE_MODEL = original;
    }
  });
});
