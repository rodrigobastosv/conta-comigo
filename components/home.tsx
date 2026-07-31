"use client";

import { companionById } from "./companions";
import type { StoryRead } from "@/lib/archive";
import { FINAL_BEAT } from "@/lib/types";

/**
 * The four things there are to do, as peers.
 *
 * Until now the start-a-story form *was* this screen, which made everything the
 * archive exists for invisible: the unfinished story from last night, the
 * finished one she wants again, the one she wants to send to her grandmother.
 * Making a story is a flow you enter, not a landing page.
 *
 * Ordered by what gets wanted most often rather than by what is newest —
 * continuing beats starting, for a child who stopped in the middle at bedtime.
 * Chosen by picture and size, like the choice buttons: a five-year-old should
 * not have to read this screen.
 */

export type HomeAction = "new" | "resume" | "library" | "share";

export function Home({
  childName,
  companionId,
  resumable,
  finishedCount,
  onPick,
  onResume,
}: {
  childName: string;
  /** Whose friend is on this screen. Falls back to Pisca. */
  companionId: string | null;
  resumable: StoryRead[];
  finishedCount: number;
  onPick: (action: HomeAction) => void;
  onResume: (entry: StoryRead) => void;
}) {
  const waiting = resumable[0] ?? null;
  const friend = companionById(companionId);

  return (
    <section className="rise-in flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-4">
        <friend.Drawing size={72} mood="resting" />
        <div>
          <p className="text-2xl">Oi, {childName}!</p>
          <p className="text-base text-muted">O que a gente faz hoje?</p>
        </div>
      </div>

      {/* First, and only when it exists: a story left in the middle is the
          thing she came back for. */}
      {waiting && (
        <button
          type="button"
          onClick={() => onResume(waiting)}
          className="flex items-center gap-4 rounded-3xl border-2 border-shop bg-shop/10 px-5 py-6 text-left transition active:scale-[0.98]"
        >
          <span aria-hidden className="text-5xl">
            📖
          </span>
          <span>
            <span className="block text-2xl">Continuar</span>
            <span className="block text-base text-muted">
              {waiting.story.world?.title ?? waiting.story.title} · parou na
              cena {waiting.tip?.beat} de {FINAL_BEAT}
            </span>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => onPick("new")}
        className="flex items-center gap-4 rounded-3xl bg-shop px-5 py-7 text-left text-paper transition active:scale-[0.98]"
      >
        <span aria-hidden className="text-5xl">
          ✨
        </span>
        <span>
          <span className="block text-2xl">História nova</span>
          <span className="block text-base opacity-80">
            Uma que ninguém leu ainda
          </span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onPick("library")}
          disabled={finishedCount === 0}
          className="flex flex-col items-center gap-2 rounded-3xl border-2 border-edge bg-card px-4 py-6 text-center transition active:scale-[0.98] disabled:opacity-40"
        >
          <span aria-hidden className="text-4xl">
            📚
          </span>
          <span className="text-xl">Ler de novo</span>
          <span className="text-sm text-muted">
            {finishedCount === 0
              ? "quando terminar uma"
              : `${finishedCount} ${finishedCount === 1 ? "história" : "histórias"}`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onPick("share")}
          disabled={finishedCount === 0}
          className="flex flex-col items-center gap-2 rounded-3xl border-2 border-edge bg-card px-4 py-6 text-center transition active:scale-[0.98] disabled:opacity-40"
        >
          <span aria-hidden className="text-4xl">
            💌
          </span>
          <span className="text-xl">Mandar pra alguém</span>
          <span className="text-sm text-muted">
            {finishedCount === 0 ? "quando terminar uma" : "a história inteira"}
          </span>
        </button>
      </div>

      {/* More than one unfinished story is possible and rare. The rest go
          below the fold rather than crowding the four. */}
      {resumable.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-muted">Outras começadas</p>
          {resumable.slice(1).map((entry) => (
            <button
              key={entry.story.id}
              type="button"
              onClick={() => onResume(entry)}
              className="rounded-2xl border-2 border-edge bg-card px-4 py-3 text-left text-lg transition active:scale-[0.98]"
            >
              {entry.story.world?.title ?? entry.story.title}
              <span className="block text-sm text-muted">
                cena {entry.tip?.beat} de {FINAL_BEAT}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
