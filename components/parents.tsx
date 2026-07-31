"use client";

import { useEffect, useState } from "react";
import {
  bookUpTo,
  deleteProfile,
  finishedStories,
  resumableStories,
  updateLimits,
  type ChildProfile,
  type StoryRead,
} from "@/lib/archive";
import { supabase } from "@/lib/supabase/browser";
import { FINAL_BEAT } from "@/lib/types";

/**
 * The parents' area: what the narrator must avoid, and what has been read.
 *
 * Two things it is not. It is not a security boundary — see `AdultsOnly` below,
 * which is a speed bump and says so. And it is not a dashboard: a parent opens
 * this twice, once to write down what frightens their child and once out of
 * curiosity about what she has been building, so everything here is one screen
 * deep.
 *
 * The restrictions written here reach the prompt from the server, read off the
 * profile on every scene. Nothing in this component is trusted to send them.
 */

/**
 * The common ones, as buttons.
 *
 * A parent who has to invent the phrasing writes nothing. These four are the
 * fears that come up first at this age, and the free-text field is there for the
 * one that is actually theirs.
 */
const COMMON = ["escuro", "cachorro grande", "trovão", "se perder"];

export function Parents({
  child,
  onLeave,
}: {
  child: ChildProfile;
  onLeave: (removed: boolean) => void;
}) {
  const [restrictions, setRestrictions] = useState(child.restrictions);
  const [names, setNames] = useState(child.forbiddenNames);
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [saved, setSaved] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save(next: {
    restrictions: string[];
    forbiddenNames: string[];
  }) {
    setRestrictions(next.restrictions);
    setNames(next.forbiddenNames);

    const db = supabase();
    if (!db) return;
    setSaved(await updateLimits(db, child.id, next));
  }

  function addRestriction(value: string) {
    const clean = value.trim();
    if (!clean || restrictions.includes(clean)) return;
    void save({
      restrictions: [...restrictions, clean],
      forbiddenNames: names,
    });
  }

  return (
    <section className="flex flex-1 flex-col gap-8">
      <div>
        <h2 className="text-2xl">Para os adultos</h2>
        <p className="mt-1 text-base text-shop/70">{child.nickname}</p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg">O que a história deve evitar</legend>
        {/* The prompt is told to obey these without mentioning them. A scene
            that says "e não tinha cachorro nenhum aqui, porque você tem medo de
            cachorro" is worse than the dog. */}
        <p className="text-base text-shop/70">
          A narradora obedece sem comentar. Nada disso aparece na história.
        </p>

        <div className="flex flex-wrap gap-2">
          {COMMON.filter((item) => !restrictions.includes(item)).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => addRestriction(item)}
              className="rounded-xl border-2 border-ink/15 bg-white/40 px-3 py-2 text-base"
            >
              + {item}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {restrictions.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-xl border-2 border-shop bg-shop/10 px-4 py-3 text-lg"
            >
              <span>{item}</span>
              <button
                type="button"
                aria-label={`Remover ${item}`}
                onClick={() =>
                  void save({
                    restrictions: restrictions.filter((r) => r !== item),
                    forbiddenNames: names,
                  })
                }
                className="px-2 text-shop"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addRestriction(draft);
            setDraft("");
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            placeholder="outra coisa"
            className="flex-1 rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-lg outline-none focus:border-shop"
          />
          <button
            type="submit"
            className="rounded-xl border-2 border-ink/15 bg-white/40 px-4 py-3 text-lg"
          >
            Adicionar
          </button>
        </form>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg">Nomes que não podem aparecer</legend>
        <p className="text-base text-shop/70">
          Nem como nome do ajudante, nem como personagem.
        </p>

        <div className="flex flex-wrap gap-2">
          {names.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={`Remover ${name}`}
              onClick={() =>
                void save({
                  restrictions,
                  forbiddenNames: names.filter((n) => n !== name),
                })
              }
              className="rounded-xl border-2 border-shop bg-shop/10 px-3 py-2 text-base"
            >
              {name} ✕
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const clean = nameDraft.trim();
            if (clean && !names.includes(clean)) {
              void save({ restrictions, forbiddenNames: [...names, clean] });
            }
            setNameDraft("");
          }}
          className="flex gap-2"
        >
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            maxLength={40}
            placeholder="um nome"
            className="flex-1 rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-lg outline-none focus:border-shop"
          />
          <button
            type="submit"
            className="rounded-xl border-2 border-ink/15 bg-white/40 px-4 py-3 text-lg"
          >
            Adicionar
          </button>
        </form>
      </fieldset>

      {saved === false && (
        <p className="text-shop">Não deu pra salvar. Tente de novo.</p>
      )}

      <History child={child} />

      <div className="flex flex-col gap-3 border-t-2 border-ink/10 pt-6">
        {confirming ? (
          <>
            <p className="text-lg">
              Apagar {child.nickname} apaga também todas as histórias dela. Não
              tem como voltar atrás.
            </p>
            <button
              type="button"
              onClick={async () => {
                const db = supabase();
                if (db && (await deleteProfile(db, child.id))) onLeave(true);
              }}
              className="rounded-xl border-2 border-shop bg-shop/10 px-4 py-3 text-lg"
            >
              Apagar mesmo assim
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-lg text-shop underline"
            >
              Deixa pra lá
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="self-start text-base text-shop/70 underline"
          >
            Apagar {child.nickname} e as histórias dela
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onLeave(false)}
        className="rounded-2xl bg-shop px-6 py-4 text-xl text-paper"
      >
        Voltar pra história
      </button>
    </section>
  );
}

/**
 * What has been read, and which way it went.
 *
 * The path is the interesting part, not the list — a parent already knows their
 * child read something last night. What they have never been able to see is the
 * choices she made, which is the second time `scene_path()` pays for itself.
 */
function History({ child }: { child: ChildProfile }) {
  const [stories, setStories] = useState<StoryRead[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [path, setPath] = useState<
    { id: string; beat: number; text: string; entryChoice: string | null }[]
  >([]);

  useEffect(() => {
    const db = supabase();
    if (!db) return;

    let cancelled = false;
    void Promise.all([
      finishedStories(db, child.id),
      resumableStories(db, child.id, 20),
    ]).then(([done, going]) => {
      if (!cancelled) setStories([...done, ...going]);
    });

    return () => {
      cancelled = true;
    };
  }, [child.id]);

  async function show(entry: StoryRead) {
    if (open === entry.story.id) {
      setOpen(null);
      return;
    }
    const db = supabase();
    if (!db || !entry.tip) return;

    setOpen(entry.story.id);
    setPath(await bookUpTo(db, entry.tip.id));
  }

  if (!stories) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg">O que já foi lido</h3>

      {stories.length === 0 && (
        <p className="text-base text-shop/70">Nada ainda.</p>
      )}

      {stories.map((entry) => (
        <div key={entry.story.id} className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void show(entry)}
            className="rounded-xl border-2 border-ink/15 bg-white/40 px-4 py-3 text-left text-lg"
          >
            {entry.story.world?.title ?? entry.story.title}
            <span className="block text-sm text-shop/70">
              {entry.story.endedAt
                ? "terminou"
                : `parou na cena ${entry.tip?.beat} de ${FINAL_BEAT}`}{" "}
              · ajudante: {entry.story.helperName}
            </span>
          </button>

          {open === entry.story.id && (
            <ol className="flex flex-col gap-3 border-l-2 border-shop/30 pl-4">
              {path.map((scene) => (
                <li key={scene.id} className="text-base">
                  {scene.entryChoice && (
                    <p className="text-shop">→ {scene.entryChoice}</p>
                  )}
                  <p className="text-ink/70">{scene.text}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}

/**
 * The speed bump in front of the parents' area.
 *
 * Not security, and it does not pretend to be — an eight-year-old solves this
 * and is welcome to. It exists so that a five-year-old looking for the next
 * story does not land in the settings by tapping the wrong corner, which is a
 * usability problem and has a usability answer.
 */
export function AdultsOnly({
  onPass,
  onCancel,
}: {
  onPass: () => void;
  onCancel: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(false);
  // Fixed, not random: a parent who comes here twice a year should not have to
  // do arithmetic under pressure with a child pulling their sleeve.
  const question = "7 × 8";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (answer.trim() === "56") onPass();
        else setWrong(true);
      }}
      className="flex flex-1 flex-col justify-center gap-6"
    >
      <h2 className="text-2xl">Só pra confirmar que é um adulto</h2>
      <label className="flex flex-col gap-2">
        <span className="text-lg">Quanto é {question}?</span>
        <input
          inputMode="numeric"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-shop"
        />
      </label>

      <button
        type="submit"
        className="rounded-2xl bg-shop px-6 py-4 text-xl text-paper"
      >
        Entrar
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-center text-lg text-shop underline"
      >
        Voltar
      </button>

      {wrong && (
        <p className="text-center text-shop">Não é esse. Tente outra.</p>
      )}
    </form>
  );
}
