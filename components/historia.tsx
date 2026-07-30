"use client";

import { useCallback, useRef, useState } from "react";
import { desbloquearAudio } from "@/lib/audio";
import { lerSSE } from "@/lib/sse";
import { BATIDA_FINAL, type Batida, type Cena, type NivelLeitura } from "@/lib/tipos";

/** Um nó do caminho percorrido. Em memória hoje; vira a tabela `cenas` depois. */
type NoDoCaminho = {
  batida: Batida;
  cena: Cena;
  escolhaDeEntrada: string | null;
};

type Fase = "inicio" | "gerando" | "lendo" | "fim";

export function Historia({ titulo }: { titulo: string }) {
  const [fase, setFase] = useState<Fase>("inicio");
  const [nome, setNome] = useState("");
  const [nivel, setNivel] = useState<NivelLeitura>("ouvir");
  const [caminho, setCaminho] = useState<NoDoCaminho[]>([]);
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef(false);

  const atual = caminho[caminho.length - 1] ?? null;

  const gerar = useCallback(
    async (batida: Batida, escolhaFeita: string | null, base: NoDoCaminho[]) => {
      if (emVoo.current) return;
      emVoo.current = true;
      setErro(null);
      setParcial("");
      setFase("gerando");

      try {
        const resposta = await fetch("/api/cena", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batida,
            nivelLeitura: nivel,
            nomeAjudante: nome.trim() || "Ajudante",
            fatos: base.flatMap((no) => no.cena.fatos_novos),
            escolhaFeita,
          }),
        });

        if (!resposta.ok) {
          setErro("A loja não apareceu. Tente de novo.");
          setFase(base.length ? "lendo" : "inicio");
          return;
        }

        for await (const { evento, dados } of lerSSE(resposta)) {
          if (evento === "texto") {
            setParcial((t) => t + (dados as { delta: string }).delta);
            setFase("lendo");
          } else if (evento === "frase") {
            // Gancho da narração: aqui entra o TTS por frase, numa fila de áudio.
            // Ainda não implementado — a cena já quebra em frases para isso.
          } else if (evento === "cena") {
            const cena = (dados as { cena: Cena }).cena;
            setCaminho([...base, { batida, cena, escolhaDeEntrada: escolhaFeita }]);
            setParcial("");
            setFase(batida === BATIDA_FINAL ? "fim" : "lendo");
          } else if (evento === "erro") {
            setErro("Algo se perdeu no caminho. Tente de novo.");
            setFase(base.length ? "lendo" : "inicio");
          }
        }
      } catch {
        setErro("Sem conexão com a loja.");
        setFase(base.length ? "lendo" : "inicio");
      } finally {
        emVoo.current = false;
      }
    },
    [nivel, nome],
  );

  function comecar() {
    desbloquearAudio();
    setCaminho([]);
    void gerar(1, null, []);
  }

  function escolher(rotulo: string) {
    const proxima = ((atual?.batida ?? 0) + 1) as Batida;
    void gerar(proxima, rotulo, caminho);
  }

  /**
   * O pulo do gato do grafo: voltar uma cena e seguir a outra escolha.
   * Nada é sobrescrito — o pai continua lá, só ganha outro filho.
   */
  function voltarUma() {
    const base = caminho.slice(0, -1);
    setCaminho(base);
    setParcial("");
    setFase(base.length ? "lendo" : "inicio");
  }

  const gerando = fase === "gerando";
  const textoNaTela = parcial || atual?.cena.texto || "";

  return (
    <>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-loja/70">
          Conta Comigo
        </p>
        <h1 className="mt-1 text-2xl font-normal">{titulo}</h1>
      </header>

      {fase === "inicio" && (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-lg">
              Como você quer se chamar nessa história?
            </span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="pode ser um nome inventado"
              maxLength={40}
              className="rounded-xl border-2 border-tinta/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-loja"
            />
          </label>

          <fieldset className="flex gap-3">
            {(["ouvir", "ler"] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setNivel(opcao)}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-lg transition ${
                  nivel === opcao
                    ? "border-loja bg-loja/10"
                    : "border-tinta/15 bg-white/40"
                }`}
              >
                {opcao === "ouvir" ? "Quero ouvir" : "Quero ler"}
              </button>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={comecar}
            disabled={gerando}
            className="rounded-2xl bg-loja px-6 py-5 text-2xl text-papel disabled:opacity-50"
          >
            Começar a história
          </button>

          {erro && <p className="text-center text-loja">{erro}</p>}
        </section>
      )}

      {(fase === "gerando" || fase === "lendo" || fase === "fim") && (
        <section className="flex flex-1 flex-col gap-8">
          <p className="whitespace-pre-wrap text-xl leading-relaxed md:text-2xl">
            {textoNaTela}
            {gerando && <span className="animate-pulse text-loja">▌</span>}
          </p>

          {fase === "lendo" && atual && atual.cena.escolhas.length > 0 && (
            <div className="grid gap-3 pb-4">
              {atual.cena.escolhas.map((escolha) => (
                <button
                  key={escolha.rotulo}
                  type="button"
                  onClick={() => escolher(escolha.rotulo)}
                  className="flex items-center gap-4 rounded-2xl border-2 border-tinta/15 bg-white/60 px-5 py-5 text-left text-xl active:border-loja active:bg-loja/10"
                >
                  <span aria-hidden className="text-4xl">
                    {escolha.icone}
                  </span>
                  <span>{escolha.rotulo}</span>
                </button>
              ))}
            </div>
          )}

          {fase === "fim" && (
            <div className="grid gap-3 pb-4">
              <p className="text-center text-lg text-loja">Fim.</p>
              <button
                type="button"
                onClick={voltarUma}
                className="rounded-2xl border-2 border-loja bg-white/60 px-5 py-4 text-xl"
              >
                E se a gente tivesse escolhido diferente?
              </button>
              <button
                type="button"
                onClick={comecar}
                className="rounded-2xl bg-loja px-5 py-4 text-xl text-papel"
              >
                Outra coisa perdida
              </button>
            </div>
          )}

          {erro && <p className="text-center text-loja">{erro}</p>}
        </section>
      )}
    </>
  );
}
