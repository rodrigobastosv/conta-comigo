import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Frases, LeitorDeCampo } from "./stream-json.ts";

const CENA = {
  texto:
    'A loja apareceu na esquina. "Toda coisa perdida quer voltar pra casa", disse Dona Vitória.\nFarelo abriu um olho só. Um chinelo amarelo tossiu na gaveta!',
  fatos_novos: ["o objeto perdido é um chinelo de tricô amarelo"],
  escolhas: [
    { rotulo: "Abrir a gaveta", icone: "🗄️" },
    { rotulo: "Perguntar ao Farelo", icone: "🐕" },
  ],
};

function fatiar(texto: string, tamanho: number): string[] {
  const partes: string[] = [];
  for (let i = 0; i < texto.length; i += tamanho) {
    partes.push(texto.slice(i, i + tamanho));
  }
  return partes;
}

describe("LeitorDeCampo", () => {
  // Pedaços de 1 e 2 chars partem \n e \" no meio — é exatamente o caso que
  // faria a cena aparecer com lixo na tela se o leitor estivesse errado.
  for (const tamanho of [1, 2, 3, 7, 50, 5000]) {
    it(`reconstrói o texto com pedaços de ${tamanho} caractere(s)`, () => {
      const json = JSON.stringify(CENA);
      const leitor = new LeitorDeCampo("texto");
      let montado = "";

      for (const pedaco of fatiar(json, tamanho)) {
        montado += leitor.empurrar(pedaco);
      }

      assert.equal(montado, CENA.texto);
      assert.equal(leitor.terminou, true);
    });
  }

  it("ignora tudo depois do fechamento da string", () => {
    const leitor = new LeitorDeCampo("texto");
    leitor.empurrar('{"texto":"oi","fatos_novos":["texto: nao é isto"]}');
    assert.equal(leitor.terminou, true);
    assert.equal(leitor.empurrar('{"texto":"outro"}'), "");
  });

  it("não emite nada enquanto o campo não aparece", () => {
    const leitor = new LeitorDeCampo("texto");
    assert.equal(leitor.empurrar('{"fatos_novos":[],"tex'), "");
    assert.equal(leitor.empurrar('to":"agora sim"'), "agora sim");
  });
});

describe("Frases", () => {
  it("quebra o texto nas mesmas frases, qualquer que seja o fatiamento", () => {
    for (const tamanho of [1, 3, 50, 5000]) {
      const leitor = new LeitorDeCampo("texto");
      const frases = new Frases();
      const colhidas: string[] = [];

      for (const pedaco of fatiar(JSON.stringify(CENA), tamanho)) {
        colhidas.push(...frases.empurrar(leitor.empurrar(pedaco)));
      }
      colhidas.push(...frases.drenar());

      assert.equal(
        colhidas.join(" ").replace(/\s+/g, " "),
        CENA.texto.replace(/\s+/g, " ").trim(),
      );
      assert.equal(colhidas.length, 4);
    }
  });

  it("segura a última frase até drenar (não há espaço depois do ponto final)", () => {
    const frases = new Frases();
    assert.deepEqual(frases.empurrar("Oi mundo."), []);
    assert.deepEqual(frases.drenar(), ["Oi mundo."]);
    assert.deepEqual(frases.drenar(), []);
  });
});
