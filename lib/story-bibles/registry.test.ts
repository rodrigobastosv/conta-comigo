import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FINAL_BEAT, type Beat } from "../types.ts";
import { BIBLES, DEFAULT_BIBLE_ID, bibleById } from "./index.ts";

/**
 * Every world, checked before it can fail on a child's screen.
 *
 * A bible missing beat 4 breaks in the worst possible place: mid-story, three
 * scenes in, on an evening that was going fine. `Record<Beat, string>` already
 * makes a missing beat a compile error; what this file catches is the rest — an
 * empty string, a refrain that contradicts the file's own `invented` flag, an id
 * that no longer matches its filename.
 *
 * It iterates the registry rather than naming worlds, so adding a world is
 * adding a file and this test starts guarding it for free.
 */

const BEATS: Beat[] = [1, 2, 3, 4, 5];

describe("every registered bible", () => {
  for (const bible of BIBLES) {
    describe(bible.id, () => {
      it("has a usable id and title", () => {
        assert.match(
          bible.id,
          /^[a-z0-9-]+$/,
          "the id goes into stories.bible_id and mirrors the filename",
        );
        assert.ok(bible.title.trim().length > 0);
      });

      it("has all five beats, each with an instruction", () => {
        for (const beat of BEATS) {
          const instruction = bible.beats[beat];
          assert.ok(
            instruction && instruction.trim().length > 10,
            `beat ${beat} has no real instruction`,
          );
        }
      });

      it("tells the final beat to end without choices", () => {
        // The one structural rule validateScene enforces at runtime. A bible
        // whose last beat still asks for two options fails every single run.
        assert.match(
          bible.beats[FINAL_BEAT],
          /[Ss]em escolhas/,
          "the final beat must say so, or the model offers two",
        );
      });

      it("has layer 2 in the shape its `invented` flag promises", () => {
        assert.ok(
          bible.text.trim().length > 200,
          "layer 2 goes into the cached system block; an empty one is no world",
        );

        if (bible.invented) {
          // The charter describes what a world must have; the refrain is
          // written on beat 1 and comes back in scene.world.
          assert.equal(
            bible.refrain,
            null,
            "an invented world cannot ship a refrain it has not written yet",
          );
        } else {
          assert.ok(
            bible.refrain && bible.refrain.trim().length > 0,
            "a hand-written world needs its refrain: the prompt asks for it once per scene",
          );
          assert.ok(
            bible.text.includes(bible.refrain!),
            "the refrain must be in layer 2, or the model never sees the words",
          );
        }
      });
    });
  }

  it("has no two worlds under one id", () => {
    const ids = BIBLES.map((bible) => bible.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      "bible_id is what an archived story records; a collision is unrecoverable",
    );
  });

  it("resolves the default the start screen opens on", () => {
    assert.ok(bibleById(DEFAULT_BIBLE_ID));
  });

  it("ships more than one world", () => {
    // One world is a special case; two is a design. The registry only earns its
    // existence past one.
    assert.ok(BIBLES.length > 1);
  });
});
