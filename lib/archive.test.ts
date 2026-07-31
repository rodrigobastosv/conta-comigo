import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asPromptRestrictions, isForbiddenName } from "./archive.ts";

/**
 * The two pure pieces of parents' mode.
 *
 * Everything else in lib/archive.ts is a query and is covered through the route,
 * against the fake database. These two decide what a child is allowed to type
 * and what the model is told to avoid, so they are worth pinning down on their
 * own.
 */

describe("a forbidden name", () => {
  it("is refused however it is typed", () => {
    const forbidden = ["Téo"];

    for (const attempt of ["Téo", "téo", "TEO", " Teo ", "tèo"]) {
      assert.equal(
        isForbiddenName(attempt, forbidden),
        true,
        `${attempt} should be refused`,
      );
    }
  });

  it("does not catch a name that merely contains it", () => {
    // "Teodoro" is not "Téo". A parent forbidding one name has not forbidden
    // every name that starts with it, and guessing wider here would refuse names
    // nobody asked us to refuse.
    assert.equal(isForbiddenName("Teodoro", ["Téo"]), false);
    assert.equal(isForbiddenName("Nina", ["Téo"]), false);
  });

  it("allows everything when nothing is forbidden", () => {
    assert.equal(isForbiddenName("Téo", []), false);
  });
});

describe("what reaches the prompt", () => {
  it("carries the restrictions as written", () => {
    const lines = asPromptRestrictions({
      restrictions: ["cachorro grande", "trovão"],
      forbiddenNames: [],
    });

    assert.deepEqual(lines, ["cachorro grande", "trovão"]);
  });

  it("turns a forbidden name into a restriction as well", () => {
    // Refusing it at the helper-name input is not enough on its own: the model
    // would still be free to hand it to the shopkeeper.
    const lines = asPromptRestrictions({
      restrictions: [],
      forbiddenNames: ["Téo"],
    });

    assert.equal(lines.length, 1);
    assert.match(lines[0], /Téo/);
    assert.match(lines[0], /Nunca use o nome/);
  });
});
