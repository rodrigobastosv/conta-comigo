"use client";

import { useEffect, useState } from "react";
import {
  bookUpTo,
  deleteStory,
  finishedStories,
  setLoved,
  type StoryRead,
} from "@/lib/archive";
import { supabase } from "@/lib/supabase/browser";
import { companionById } from "./companions";

/**
 * The little book: stories that finished, read back the way they happened.
 *
 * This is the archive becoming visible. Everything before it — the graph, the
 * scene path, reuse — exists so that this screen can show a child the story she
 * made, with the choices she made still in it.
 *
 * Sharing sends **text**, from the device, through the share sheet the phone
 * already has. Nothing is published, no link exists, no row changes. A story is
 * written for a named child and usually has her own chosen name inside it, so
 * the version that cannot leak anything the parent did not personally send is
 * the right default. A public link is a real feature and a separate decision —
 * see issue #35.
 */

type Page = {
  id: string;
  beat: number;
  text: string;
  entryChoice: string | null;
};

export function Library({
  profileId,
  companionId,
  intent,
  onLeave,
}: {
  profileId: string;
  companionId: string | null;
  /** Which button opened this: the list is the same, the verb is not. */
  intent: "library" | "share";
  onLeave: () => void;
}) {
  const [stories, setStories] = useState<StoryRead[] | null>(null);
  const [open, setOpen] = useState<StoryRead | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [sent, setSent] = useState<string | null>(null);
  /** Which story is one tap from being gone. Never more than one at a time. */
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const db = supabase();
    if (!db) return;

    let cancelled = false;
    void finishedStories(db, profileId).then((found) => {
      if (!cancelled) setStories(found);
    });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  async function toggleLoved(entry: StoryRead) {
    const db = supabase();
    if (!db) return;

    const loved = !entry.story.lovedAt;
    // Optimistic: the mark is a preference, and a failed write is worth a log
    // rather than a wrong-looking shelf.
    setStories(
      (all) =>
        all?.map((one) =>
          one.story.id === entry.story.id
            ? {
                ...one,
                story: {
                  ...one.story,
                  lovedAt: loved ? new Date().toISOString() : null,
                },
              }
            : one,
        ) ?? null,
    );
    await setLoved(db, entry.story.id, loved);
  }

  async function remove(entry: StoryRead) {
    const db = supabase();
    if (!db) return;

    if (await deleteStory(db, entry.story.id)) {
      setStories(
        (all) => all?.filter((o) => o.story.id !== entry.story.id) ?? null,
      );
    }
    setRemoving(null);
  }

  async function read(entry: StoryRead) {
    const db = supabase();
    if (!db || !entry.tip) return;
    setOpen(entry);
    setPages(await bookUpTo(db, entry.tip.id));
  }

  async function share(entry: StoryRead, book: Page[]) {
    const title = entry.story.world?.title ?? entry.story.title;
    const text = [
      title,
      "",
      ...book.map((page) => page.text),
      "",
      `— uma história de ${entry.story.helperName}, feita no Conta Comigo`,
    ].join("\n\n");

    // The phone's own share sheet, so the parent picks the destination and the
    // app never learns what it was.
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // Dismissed, or unavailable despite existing. Fall through to copy.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setSent("Copiado! Agora é só colar onde você quiser.");
    } catch {
      setSent("Não deu pra copiar. Tente segurar no texto e copiar à mão.");
    }
  }

  if (open) {
    return (
      <section className="rise-in flex flex-1 flex-col gap-8">
        <h2 className="text-2xl">
          {open.story.world?.title ?? open.story.title}
        </h2>

        {pages.map((page) => (
          <article key={page.id} className="flex flex-col gap-2">
            {page.entryChoice && (
              <p className="text-base text-shop">
                Você escolheu: {page.entryChoice}
              </p>
            )}
            <p className="whitespace-pre-wrap text-xl leading-relaxed md:text-2xl">
              {page.text}
            </p>
          </article>
        ))}

        <div className="flex flex-col gap-3 pb-4">
          <button
            type="button"
            onClick={() => void share(open, pages)}
            className="rounded-2xl bg-shop px-5 py-4 text-xl text-paper transition active:scale-[0.98]"
          >
            💌 Mandar essa história pra alguém
          </button>
          {sent && <p className="text-center text-base text-muted">{sent}</p>}
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              setSent(null);
            }}
            className="rounded-2xl border-2 border-edge bg-card px-5 py-4 text-xl transition active:scale-[0.98]"
          >
            Voltar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rise-in flex flex-1 flex-col gap-6">
      <h2 className="text-2xl">
        {intent === "share"
          ? "Qual história você quer mandar?"
          : "Suas histórias"}
      </h2>

      {stories === null && <p className="text-lg text-muted">Um instante…</p>}

      {stories?.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          {companionById(companionId).Drawing({ size: 96, mood: "asleep" })}
          <p className="text-lg text-muted">
            Nenhuma história terminada ainda.
            <br />
            Quando você terminar uma, ela fica guardada aqui.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {stories?.map((entry) => (
          <div
            key={entry.story.id}
            className={`rounded-2xl border-2 bg-card transition ${
              entry.story.lovedAt ? "border-shop" : "border-edge"
            }`}
          >
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => void read(entry)}
                className="flex-1 px-5 py-5 text-left text-xl"
              >
                {entry.story.world?.title ?? entry.story.title}
                <span className="block text-base text-muted">
                  ajudante: {entry.story.helperName}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void toggleLoved(entry)}
                aria-pressed={Boolean(entry.story.lovedAt)}
                aria-label={
                  entry.story.lovedAt
                    ? "Tirar dos guardados"
                    : "Guardar essa história"
                }
                className="px-4 py-5 text-3xl"
              >
                <span aria-hidden>{entry.story.lovedAt ? "★" : "☆"}</span>
              </button>
            </div>

            {/* Deleting sits behind a confirmation and reads as a sentence
                rather than a bin icon — a five-year-old tapping a bin on the
                story she just made is a bad evening. */}
            {removing === entry.story.id ? (
              <div className="flex flex-col gap-2 border-t-2 border-edge px-5 py-4">
                <p className="text-base">
                  Apagar essa história pra sempre? Não tem como voltar atrás.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void remove(entry)}
                    className="flex-1 rounded-xl border-2 border-shop bg-shop/10 px-4 py-3 text-base"
                  >
                    Apagar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(null)}
                    className="flex-1 rounded-xl border-2 border-edge px-4 py-3 text-base"
                  >
                    Deixa pra lá
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRemoving(entry.story.id)}
                className="px-5 pb-3 text-sm text-muted underline"
              >
                Apagar essa história
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onLeave}
        className="self-center text-lg text-shop underline"
      >
        Voltar
      </button>
    </section>
  );
}
