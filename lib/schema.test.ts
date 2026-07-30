import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SceneInvalidError, validateScene } from "./schema.ts";
import { FINAL_BEAT, type Beat } from "./types.ts";

/**
 * The guard between a bad model response and a five-year-old's screen. Every
 * case here is something the model has actually been observed to do, or the
 * schema rule that stops it.
 */

const choice = (label: string) => ({ label, icon: "🗄️" });

function scene(over: Record<string, unknown> = {}) {
  return {
    text: "A loja apareceu na esquina.",
    world: null,
    new_facts: ["a loja tem porta verde"],
    choices: [choice("Abrir a gaveta"), choice("Perguntar ao Farelo")],
    ...over,
  };
}

const world = (over: Record<string, unknown> = {}) => ({
  title: "O Guarda-Chuva que Não Queria Fechar",
  refrain: "Quem espera na chuva não espera sozinho.",
  invariants: [
    "o guarda-chuva só fecha quando para de chover",
    "seu Aldo nunca entra antes das seis",
    "o pardal bate a asa uma vez quando alguém esquece",
  ],
  ...over,
});

describe("validateScene: the choice-count rule", () => {
  for (const beat of [1, 2, 3, 4] as Beat[]) {
    it(`beat ${beat} accepts exactly 2 choices`, () => {
      const result = validateScene(scene(), beat);
      assert.equal(result.choices.length, 2);
    });

    it(`beat ${beat} rejects 1 choice`, () => {
      assert.throws(
        () => validateScene(scene({ choices: [choice("Só uma")] }), beat),
        SceneInvalidError,
      );
    });

    // Not hypothetical: the model returns 3 when asked for 2. The right move is
    // to regenerate, not to render a scene with a spare button.
    it(`beat ${beat} rejects 3 choices`, () => {
      assert.throws(
        () =>
          validateScene(
            scene({ choices: [choice("A"), choice("B"), choice("C")] }),
            beat,
          ),
        SceneInvalidError,
      );
    });

    it(`beat ${beat} rejects an empty choice list`, () => {
      assert.throws(
        () => validateScene(scene({ choices: [] }), beat),
        SceneInvalidError,
      );
    });
  }

  // `choices: []` IS the end-of-story signal. There is no `finished` field, so
  // this rule is the only thing that makes the ending detectable.
  it("the final beat requires an empty choice list", () => {
    const result = validateScene(scene({ choices: [] }), FINAL_BEAT);
    assert.deepEqual(result.choices, []);
  });

  it("the final beat rejects choices", () => {
    assert.throws(() => validateScene(scene(), FINAL_BEAT), SceneInvalidError);
  });

  it("says what it expected and what it got", () => {
    try {
      validateScene(scene({ choices: [] }), 1);
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof SceneInvalidError);
      assert.match(error.reason, /beat 1 requires 2 choices, got 0/);
    }
  });
});

describe("validateScene: the schema", () => {
  it("rejects an unknown field instead of ignoring it", () => {
    assert.throws(
      () => validateScene(scene({ finished: true }), 1),
      SceneInvalidError,
    );
  });

  it("rejects an unknown field inside a choice", () => {
    assert.throws(
      () =>
        validateScene(
          scene({ choices: [{ ...choice("A"), colour: "azul" }, choice("B")] }),
          1,
        ),
      SceneInvalidError,
    );
  });

  it("rejects empty text", () => {
    assert.throws(
      () => validateScene(scene({ text: "" }), 1),
      SceneInvalidError,
    );
  });

  it("rejects more than 6 new facts", () => {
    const seven = Array.from({ length: 7 }, (_, i) => `fato ${i}`);
    assert.throws(
      () => validateScene(scene({ new_facts: seven }), 1),
      SceneInvalidError,
    );
  });

  it("accepts zero new facts", () => {
    const result = validateScene(scene({ new_facts: [] }), 1);
    assert.deepEqual(result.new_facts, []);
  });

  it("rejects an empty fact string", () => {
    assert.throws(
      () => validateScene(scene({ new_facts: [""] }), 1),
      SceneInvalidError,
    );
  });

  it("rejects an empty choice label", () => {
    assert.throws(
      () => validateScene(scene({ choices: [choice(""), choice("B")] }), 1),
      SceneInvalidError,
    );
  });

  // The cap exists because the icon is one emoji. A sentence in that field means
  // the model misunderstood the contract.
  it("rejects an icon longer than 8 characters", () => {
    assert.throws(
      () =>
        validateScene(
          scene({
            choices: [{ label: "A", icon: "uma frase inteira" }, choice("B")],
          }),
          1,
        ),
      SceneInvalidError,
    );
  });

  it("rejects a non-object", () => {
    for (const junk of [null, undefined, "texto", 42, []]) {
      assert.throws(() => validateScene(junk, 1), SceneInvalidError);
    }
  });

  it("never returns a partially valid scene", () => {
    // If it throws, nothing downstream should have been handed a half-scene.
    assert.throws(
      () => validateScene({ text: "só isso" }, 1),
      SceneInvalidError,
    );
  });
});

/**
 * A world is layer 2 of a run that nobody wrote by hand. Losing it on beat 1
 * leaves the next four beats with nothing to be coherent against; getting one
 * later means the model is rewriting a world the child is already inside.
 */
describe("validateScene: the world rule", () => {
  it("accepts a world when beat 1 was asked to invent one", () => {
    const result = validateScene(scene({ world: world() }), 1, true);
    assert.equal(result.world?.title, "O Guarda-Chuva que Não Queria Fechar");
  });

  it("rejects beat 1 of an invented world that returned no world", () => {
    assert.throws(() => validateScene(scene(), 1, true), SceneInvalidError);
  });

  it("rejects a world nobody asked for", () => {
    assert.throws(
      () => validateScene(scene({ world: world() }), 3),
      SceneInvalidError,
    );
  });

  it("rejects fewer than 3 invariants", () => {
    assert.throws(
      () =>
        validateScene(
          scene({ world: world({ invariants: ["só uma regra"] }) }),
          1,
          true,
        ),
      SceneInvalidError,
    );
  });

  it("rejects more than 5 invariants", () => {
    const six = Array.from({ length: 6 }, (_, i) => `regra ${i}`);
    assert.throws(
      () =>
        validateScene(scene({ world: world({ invariants: six }) }), 1, true),
      SceneInvalidError,
    );
  });

  it("rejects a world with no refrain", () => {
    assert.throws(
      () => validateScene(scene({ world: world({ refrain: "" }) }), 1, true),
      SceneInvalidError,
    );
  });

  it("rejects an unknown field inside the world", () => {
    assert.throws(
      () =>
        validateScene(scene({ world: world({ mood: "chuvoso" }) }), 1, true),
      SceneInvalidError,
    );
  });
});
