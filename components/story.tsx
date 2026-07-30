"use client";

import { useCallback, useRef, useState } from "react";
import { unlockAudio } from "@/lib/audio";
import { readSSE } from "@/lib/sse";
import { FINAL_BEAT, type Beat, type Scene, type ReadingLevel } from "@/lib/types";

/** A node of the path travelled. In memory today; becomes the `scenes` table later. */
type PathNode = {
  beat: Beat;
  scene: Scene;
  entryChoice: string | null;
};

type Phase = "start" | "generating" | "reading" | "end";

export function Story({ title }: { title: string }) {
  const [phase, setPhase] = useState<Phase>("start");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<ReadingLevel>("ouvir");
  const [path, setPath] = useState<PathNode[]>([]);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const current = path[path.length - 1] ?? null;

  const generate = useCallback(
    async (beat: Beat, choiceMade: string | null, base: PathNode[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      setPartial("");
      setPhase("generating");

      try {
        const response = await fetch("/api/scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beat,
            readingLevel: level,
            helperName: name.trim() || "Ajudante",
            facts: base.flatMap((node) => node.scene.new_facts),
            choiceMade,
          }),
        });

        if (!response.ok) {
          setError("A loja não apareceu. Tente de novo.");
          setPhase(base.length ? "reading" : "start");
          return;
        }

        for await (const { event, data } of readSSE(response)) {
          if (event === "text") {
            setPartial((t) => t + (data as { delta: string }).delta);
            setPhase("reading");
          } else if (event === "sentence") {
            // Narration hook: the per-sentence TTS goes here, in an audio queue.
            // Not implemented yet — the scene is already split into sentences for it.
          } else if (event === "scene") {
            const scene = (data as { scene: Scene }).scene;
            setPath([...base, { beat, scene, entryChoice: choiceMade }]);
            setPartial("");
            setPhase(beat === FINAL_BEAT ? "end" : "reading");
          } else if (event === "error") {
            setError("Algo se perdeu no caminho. Tente de novo.");
            setPhase(base.length ? "reading" : "start");
          }
        }
      } catch {
        setError("Sem conexão com a loja.");
        setPhase(base.length ? "reading" : "start");
      } finally {
        inFlight.current = false;
      }
    },
    [level, name],
  );

  function begin() {
    unlockAudio();
    setPath([]);
    void generate(1, null, []);
  }

  function choose(label: string) {
    const next = ((current?.beat ?? 0) + 1) as Beat;
    void generate(next, label, path);
  }

  /**
   * The whole point of the graph: go back one scene and take the other choice.
   * Nothing is overwritten — the parent stays there, it just gains another child.
   */
  function goBackOne() {
    const base = path.slice(0, -1);
    setPath(base);
    setPartial("");
    setPhase(base.length ? "reading" : "start");
  }

  const generating = phase === "generating";
  const textOnScreen = partial || current?.scene.text || "";

  return (
    <>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-shop/70">
          Conta Comigo
        </p>
        <h1 className="mt-1 text-2xl font-normal">{title}</h1>
      </header>

      {phase === "start" && (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-lg">
              Como você quer se chamar nessa história?
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="pode ser um nome inventado"
              maxLength={40}
              className="rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-shop"
            />
          </label>

          <fieldset className="flex gap-3">
            {(["ouvir", "ler"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLevel(option)}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-lg transition ${
                  level === option
                    ? "border-shop bg-shop/10"
                    : "border-ink/15 bg-white/40"
                }`}
              >
                {option === "ouvir" ? "Quero ouvir" : "Quero ler"}
              </button>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={begin}
            disabled={generating}
            className="rounded-2xl bg-shop px-6 py-5 text-2xl text-paper disabled:opacity-50"
          >
            Começar a história
          </button>

          {error && <p className="text-center text-shop">{error}</p>}
        </section>
      )}

      {(phase === "generating" || phase === "reading" || phase === "end") && (
        <section className="flex flex-1 flex-col gap-8">
          <p className="whitespace-pre-wrap text-xl leading-relaxed md:text-2xl">
            {textOnScreen}
            {generating && <span className="animate-pulse text-shop">▌</span>}
          </p>

          {phase === "reading" && current && current.scene.choices.length > 0 && (
            <div className="grid gap-3 pb-4">
              {current.scene.choices.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => choose(choice.label)}
                  className="flex items-center gap-4 rounded-2xl border-2 border-ink/15 bg-white/60 px-5 py-5 text-left text-xl active:border-shop active:bg-shop/10"
                >
                  <span aria-hidden className="text-4xl">
                    {choice.icon}
                  </span>
                  <span>{choice.label}</span>
                </button>
              ))}
            </div>
          )}

          {phase === "end" && (
            <div className="grid gap-3 pb-4">
              <p className="text-center text-lg text-shop">Fim.</p>
              <button
                type="button"
                onClick={goBackOne}
                className="rounded-2xl border-2 border-shop bg-white/60 px-5 py-4 text-xl"
              >
                E se a gente tivesse escolhido diferente?
              </button>
              <button
                type="button"
                onClick={begin}
                className="rounded-2xl bg-shop px-5 py-4 text-xl text-paper"
              >
                Outra coisa perdida
              </button>
            </div>
          )}

          {error && <p className="text-center text-shop">{error}</p>}
        </section>
      )}
    </>
  );
}
