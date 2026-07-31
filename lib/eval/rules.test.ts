import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASES } from "./cases.ts";
import { check, countWords, measure, splitSentences } from "./rules.ts";
import type { Scene } from "../types.ts";

const REFRAIN = "Toda coisa perdida quer voltar pra casa.";

/** Builds a scene of exactly `words` words made of short sentences. */
function sceneOf(words: number, extra: Partial<Scene> = {}): Scene {
  const sentences: string[] = [];
  let written = 0;
  while (written < words) {
    const take = Math.min(10, words - written);
    sentences.push(Array(take).fill("palavra").join(" ") + ".");
    written += take;
  }
  return {
    text: sentences.join(" "),
    world: null,
    new_facts: [],
    choices: [
      { label: "Abrir a gaveta", icon: "🗄️" },
      { label: "Chamar o Farelo", icon: "🐕" },
    ],
    ...extra,
  };
}

const INVENTED = { invented: true, expected: true };

const WORLD = {
  title: "O Guarda-Chuva que Não Queria Fechar",
  refrain: "Quem espera na chuva não espera sozinho.",
  invariants: ["o guarda-chuva só fecha quando para de chover"],
};

describe("measuring", () => {
  it("counts words", () => {
    assert.equal(countWords("A loja apareceu na esquina."), 5);
    assert.equal(countWords("  espaços   estranhos  "), 2);
    assert.equal(countWords(""), 0);
  });

  it("splits sentences the same way the narration does", () => {
    const text = "Uma frase. Outra frase! E a terceira?";
    assert.deepEqual(splitSentences(text), [
      "Uma frase.",
      "Outra frase!",
      "E a terceira?",
    ]);
  });

  it("finds the refrain regardless of case and accents", () => {
    const scene = sceneOf(100, {
      text: "Alguma coisa. TODA COISA PERDIDA QUER VOLTAR PRA CASA. Fim.",
    });
    assert.equal(measure(scene, REFRAIN).hasRefrain, true);
  });

  it("does not invent a refrain that is not there", () => {
    assert.equal(measure(sceneOf(100), REFRAIN).hasRefrain, false);
  });
});

describe("the ouvir rules", () => {
  const ouvir = (scene: Scene) => check(scene, "ouvir", REFRAIN, false);

  it("passes a scene inside every numeric bound", () => {
    const scene = sceneOf(100, {
      text: `${sceneOf(90).text} ${REFRAIN}`,
    });
    const { violations } = ouvir(scene);
    assert.deepEqual(
      violations.filter((v) => v.severity === "fail"),
      [],
    );
  });

  it("fails a scene that is too short", () => {
    const { violations } = ouvir(sceneOf(40, { text: `curto. ${REFRAIN}` }));
    assert.ok(violations.some((v) => v.rule === "words-per-scene"));
  });

  it("fails a scene that is too long", () => {
    const { violations } = ouvir(
      sceneOf(300, { text: `${sceneOf(300).text} ${REFRAIN}` }),
    );
    assert.ok(violations.some((v) => v.rule === "words-per-scene"));
  });

  it("fails sentences that are too long on average", () => {
    const long = Array(6)
      .fill(Array(25).fill("palavra").join(" ") + ".")
      .join(" ");
    const { violations } = ouvir(sceneOf(0, { text: `${long} ${REFRAIN}` }));
    assert.ok(violations.some((v) => v.rule === "mean-sentence-words"));
  });

  it("accepts very short sentences, which are rhythm and not a defect", () => {
    // The v2 floor of 8 failed the best-written scene in the first evaluation
    // run. See docs/decisions.md — restoring a minimum here asks the narrator to
    // pad, and padding is the opposite of what `ouvir` is for.
    const staccato = Array(30).fill("Silêncio total.").join(" ");
    const { violations } = ouvir(
      sceneOf(0, { text: `${staccato} ${REFRAIN}` }),
    );
    assert.ok(!violations.some((v) => v.rule === "mean-sentence-words"));
  });

  it("fails a missing refrain", () => {
    const { violations } = ouvir(sceneOf(100));
    assert.ok(violations.some((v) => v.rule === "refrain"));
  });

  it("fails a choice label that is too wordy for a 5-year-old", () => {
    const scene = sceneOf(100, {
      text: `${sceneOf(90).text} ${REFRAIN}`,
      choices: [
        {
          label: "Investigar cuidadosamente a origem daquele som estranho",
          icon: "🔎",
        },
        { label: "Abrir a gaveta", icon: "🗄️" },
      ],
    });
    const { violations } = ouvir(scene);
    assert.ok(violations.some((v) => v.rule === "choice-label-words"));
  });
});

describe("the ler rules", () => {
  it("accepts 200 words, which ouvir would reject", () => {
    const scene = sceneOf(200);
    assert.ok(
      check(scene, "ler", REFRAIN, false).violations.every(
        (v) => v.rule !== "words-per-scene",
      ),
    );
    assert.ok(
      check(scene, "ouvir", REFRAIN, false).violations.some(
        (v) => v.rule === "words-per-scene",
      ),
    );
  });

  it("does not require the refrain", () => {
    const { violations } = check(sceneOf(200), "ler", REFRAIN, false);
    assert.ok(!violations.some((v) => v.rule === "refrain"));
  });
});

describe("the constitution checks", () => {
  const withText = (text: string) =>
    check(sceneOf(0, { text: `${text} ${REFRAIN}` }), "ouvir", REFRAIN, false);

  it("fails on death and injury", () => {
    for (const word of ["morreu", "sangue", "ferido", "hospital"]) {
      const { violations } = withText(`Alguma coisa e ${word} aconteceu.`);
      assert.ok(
        violations.some((v) => v.rule === "constitution-content"),
        `${word} should fail`,
      );
    }
  });

  it("fails on an explicit moral", () => {
    const { violations } = withText(
      "E assim aprendeu que a amizade vale mais.",
    );
    assert.ok(violations.some((v) => v.rule === "constitution-moral"));
  });

  // The word "morte" inside "amortecer" is not death; a checker that cries wolf
  // gets ignored, and an ignored checker is worse than none.
  it("does not fire on a word that merely contains a forbidden one", () => {
    const { violations } = withText("O tapete serviu para amortecer a queda.");
    assert.ok(!violations.some((v) => v.rule === "constitution-content"));
  });

  it("warns when the narrator speaks about herself", () => {
    const { violations } = withText("Eu acho que a loja era bonita.");
    assert.ok(violations.some((v) => v.rule === "narrator-persona"));
  });

  // Characters speak in the first person constantly. Flagging that would make
  // the check useless.
  it("does not warn about first person inside dialogue", () => {
    const { violations } = withText(
      'O chinelo disse: "Meu par ficou no ônibus."',
    );
    assert.ok(!violations.some((v) => v.rule === "narrator-persona"));
  });

  it("fails the final beat if it offers choices", () => {
    const { violations } = check(sceneOf(100), "ouvir", REFRAIN, true);
    assert.ok(violations.some((v) => v.rule === "choice-count"));
  });
});

describe("the invented-world rules", () => {
  const openWorld = (scene: Scene) =>
    check(scene, "ouvir", WORLD.refrain, false, INVENTED);

  it("fails beat 1 that invents no world", () => {
    const { violations } = openWorld(
      sceneOf(100, { text: `${sceneOf(90).text} ${WORLD.refrain}` }),
    );
    assert.ok(violations.some((v) => v.rule === "world-missing"));
  });

  // Beats 2 to 5 already have a world. One coming back means the model is
  // rewriting it mid-story, and the child's world changes under her.
  it("fails a later beat that returns a world anyway", () => {
    const { violations } = check(
      sceneOf(100, { world: WORLD }),
      "ouvir",
      WORLD.refrain,
      false,
      { invented: true, expected: false },
    );
    assert.ok(violations.some((v) => v.rule === "world-unexpected"));
  });

  // A refrain the child never hears is not a refrain. The declaration is free;
  // saying it in the scene is the part that costs the model something.
  it("fails a refrain that is declared but never spoken", () => {
    const { violations } = openWorld(sceneOf(100, { world: WORLD }));
    assert.ok(violations.some((v) => v.rule === "refrain-declared-not-spoken"));
  });

  it("passes an opening that declares its world and speaks its refrain", () => {
    const scene = sceneOf(100, {
      text: `${sceneOf(90).text} ${WORLD.refrain}`,
      world: WORLD,
    });
    assert.deepEqual(
      openWorld(scene).violations.filter((v) => v.severity === "fail"),
      [],
    );
  });

  it("fails the clichés the charter bans", () => {
    for (const word of ["dragão", "princesa", "castelo", "fada"]) {
      const scene = sceneOf(100, {
        text: `Havia um ${word} na esquina. ${WORLD.refrain}`,
        world: WORLD,
      });
      assert.ok(
        openWorld(scene).violations.some((v) => v.rule === "world-cliche"),
        `${word} should fail`,
      );
    }
  });

  // A hand-written world is allowed anything a person decided it should have.
  // The list exists to catch a model writing by reflex, not to ban a noun.
  it("does not apply the cliché list to a hand-written world", () => {
    const scene = sceneOf(100, {
      text: `Havia um castelo na gaveta. ${REFRAIN}`,
    });
    const { violations } = check(scene, "ouvir", REFRAIN, false);
    assert.ok(!violations.some((v) => v.rule === "world-cliche"));
  });
});

describe("the fixed cases", () => {
  it("gives every case a unique id and a reason for existing", () => {
    const ids = CASES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of CASES) assert.ok(c.why.length > 10, `${c.id} has no why`);
  });

  it("covers both reading levels, the first beat and the last", () => {
    assert.ok(CASES.some((c) => c.request.readingLevel === "ouvir"));
    assert.ok(CASES.some((c) => c.request.readingLevel === "ler"));
    assert.ok(CASES.some((c) => c.request.beat === 1));
    assert.ok(CASES.some((c) => c.request.beat === 5));
    assert.ok(CASES.some((c) => c.request.facts.length === 0));
    assert.ok(CASES.some((c) => c.request.facts.length >= 10));
  });

  // Both worlds, or the run only proves the half that did not change.
  it("covers both worlds, with and without a seed", () => {
    assert.ok(
      CASES.some((c) => c.request.bibleId === "loja-de-coisas-perdidas"),
    );
    assert.ok(CASES.some((c) => c.request.bibleId === "original"));
    assert.ok(CASES.some((c) => c.request.seed));
    assert.ok(CASES.some((c) => c.request.world));
  });
});
