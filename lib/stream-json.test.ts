import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FieldReader, Sentences } from "./stream-json.ts";

const SCENE = {
  text:
    'A loja apareceu na esquina. "Toda coisa perdida quer voltar pra casa", disse Dona Vitória.\nFarelo abriu um olho só. Um chinelo amarelo tossiu na gaveta!',
  new_facts: ["o objeto perdido é um chinelo de tricô amarelo"],
  choices: [
    { label: "Abrir a gaveta", icon: "🗄️" },
    { label: "Perguntar ao Farelo", icon: "🐕" },
  ],
};

function slice(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    parts.push(text.slice(i, i + size));
  }
  return parts;
}

describe("FieldReader", () => {
  // Chunks of 1 and 2 chars split \n and \" down the middle — exactly the case
  // that would put garbage on screen if the reader were wrong.
  for (const size of [1, 2, 3, 7, 50, 5000]) {
    it(`rebuilds the text with chunks of ${size} character(s)`, () => {
      const json = JSON.stringify(SCENE);
      const reader = new FieldReader("text");
      let assembled = "";

      for (const chunk of slice(json, size)) {
        assembled += reader.push(chunk);
      }

      assert.equal(assembled, SCENE.text);
      assert.equal(reader.done, true);
    });
  }

  it("ignores everything after the string closes", () => {
    const reader = new FieldReader("text");
    reader.push('{"text":"oi","new_facts":["text: nao é isto"]}');
    assert.equal(reader.done, true);
    assert.equal(reader.push('{"text":"outro"}'), "");
  });

  it("emits nothing while the field has not appeared", () => {
    const reader = new FieldReader("text");
    assert.equal(reader.push('{"new_facts":[],"te'), "");
    assert.equal(reader.push('xt":"agora sim"'), "agora sim");
  });
});

describe("Sentences", () => {
  it("splits the text into the same sentences, whatever the chunking", () => {
    for (const size of [1, 3, 50, 5000]) {
      const reader = new FieldReader("text");
      const sentences = new Sentences();
      const collected: string[] = [];

      for (const chunk of slice(JSON.stringify(SCENE), size)) {
        collected.push(...sentences.push(reader.push(chunk)));
      }
      collected.push(...sentences.drain());

      assert.equal(
        collected.join(" ").replace(/\s+/g, " "),
        SCENE.text.replace(/\s+/g, " ").trim(),
      );
      assert.equal(collected.length, 4);
    }
  });

  it("holds the last sentence until drained (there is no space after the full stop)", () => {
    const sentences = new Sentences();
    assert.deepEqual(sentences.push("Oi mundo."), []);
    assert.deepEqual(sentences.drain(), ["Oi mundo."]);
    assert.deepEqual(sentences.drain(), []);
  });
});
