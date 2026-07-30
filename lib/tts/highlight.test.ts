import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sentenceRange } from "./highlight.ts";

const TEXT =
  "A loja apareceu na esquina. Nina parou na frente.\n\n" +
  "Toda coisa perdida quer voltar pra casa. Farelo abriu um olho.\n\n" +
  "Toda coisa perdida quer voltar pra casa.";

const SENTENCES = [
  "A loja apareceu na esquina.",
  "Nina parou na frente.",
  "Toda coisa perdida quer voltar pra casa.",
  "Farelo abriu um olho.",
  "Toda coisa perdida quer voltar pra casa.",
];

describe("sentenceRange", () => {
  it("finds each sentence in the scene text", () => {
    for (let i = 0; i < SENTENCES.length; i++) {
      const range = sentenceRange(TEXT, SENTENCES, i);
      assert.ok(range, `sentence ${i} not found`);
      assert.equal(TEXT.slice(range[0], range[1]), SENTENCES[i]);
    }
  });

  // The refrain appears twice on purpose — it is in the story bible. Matching
  // the first occurrence both times would highlight the wrong line.
  it("distinguishes a repeated refrain by position", () => {
    const first = sentenceRange(TEXT, SENTENCES, 2)!;
    const second = sentenceRange(TEXT, SENTENCES, 4)!;
    assert.notEqual(first[0], second[0]);
    assert.ok(second[0] > first[0]);
  });

  it("keeps the paragraph breaks intact around a match", () => {
    const [start, end] = sentenceRange(TEXT, SENTENCES, 2)!;
    assert.equal(TEXT.slice(0, start).endsWith("\n\n"), true);
    assert.equal(TEXT.slice(end).startsWith(" "), true);
  });

  it("returns null rather than guessing when the text does not match", () => {
    assert.equal(sentenceRange("outro texto", SENTENCES, 0), null);
    assert.equal(sentenceRange(TEXT, SENTENCES, -1), null);
    assert.equal(sentenceRange(TEXT, SENTENCES, 99), null);
  });
});
