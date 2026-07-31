"use client";

import { useEffect, useState } from "react";
import {
  childProfiles,
  createProfile,
  updateChoices,
  type ChildProfile,
} from "@/lib/archive";
import { supabase } from "@/lib/supabase/browser";
import type { ReadingLevel } from "@/lib/types";
import { COMPANIONS, DEFAULT_COMPANION_ID, companionById } from "./companions";

/**
 * Who is listening tonight.
 *
 * One account can have several children, because the schema always allowed it
 * and because the alternative — one archive with two children's stories mixed
 * into it — is the thing a second child notices immediately.
 *
 * The reading level lives here rather than on the story screen because it is a
 * property of the child, not of the evening: a five-year-old does not become an
 * eight-year-old between two stories. The story screen still lets it be
 * overridden for one run.
 */

export function Children({
  guardianId,
  onPicked,
}: {
  guardianId: string;
  onPicked: (child: ChildProfile) => void;
}) {
  const [children, setChildren] = useState<ChildProfile[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const db = supabase();
    if (!db) return;

    let cancelled = false;
    void childProfiles(db).then((found) => {
      if (cancelled) return;
      setChildren(found);
      // Nothing to choose between: the first child on a new account goes
      // straight to the form rather than to an empty list.
      if (found.length === 0) setAdding(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (children === null) {
    return <p className="flex-1 py-8 text-lg text-shop/70">Um instante…</p>;
  }

  if (adding) {
    return (
      <NewChild
        guardianId={guardianId}
        onCreated={(child) => {
          setChildren([...children, child]);
          onPicked(child);
        }}
        onCancel={children.length > 0 ? () => setAdding(false) : null}
      />
    );
  }

  return (
    <section className="flex flex-1 flex-col justify-center gap-6">
      <h2 className="text-2xl">Quem vai ouvir a história?</h2>

      <div className="grid gap-3">
        {children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => onPicked(child)}
            className="flex items-center gap-4 rounded-2xl border-2 border-edge bg-card px-5 py-5 text-left text-2xl transition active:scale-[0.98]"
          >
            {companionById(child.preferredCompanion).Drawing({ size: 56 })}
            <span>
              <span className="block">{child.nickname}</span>
              <span className="block text-base text-muted">
                {child.age} anos ·{" "}
                {child.readingLevel === "ouvir" ? "quer ouvir" : "quer ler"}
              </span>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="rounded-xl border-2 border-ink/15 bg-white/40 px-4 py-3 text-lg"
      >
        + Outra criança
      </button>
    </section>
  );
}

function NewChild({
  guardianId,
  onCreated,
  onCancel,
}: {
  guardianId: string;
  onCreated: (child: ChildProfile) => void;
  onCancel: (() => void) | null;
}) {
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState(5);
  const [level, setLevel] = useState<ReadingLevel>("ouvir");
  const [companion, setCompanion] = useState(DEFAULT_COMPANION_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const db = supabase();
    if (!db || busy) return;

    setBusy(true);
    setError(null);

    const child = await createProfile(db, guardianId, {
      nickname: nickname.trim(),
      age,
      readingLevel: level,
    });

    if (!child) {
      setBusy(false);
      setError("Não deu pra salvar agora. Tente de novo.");
      return;
    }

    // The friend is a second write rather than part of the insert: a profile
    // that exists without a companion is fine (it falls back to Pisca), and a
    // child with no profile because her friend failed to save is not.
    await updateChoices(db, child.id, { preferredCompanion: companion });
    setBusy(false);
    onCreated({ ...child, preferredCompanion: companion });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-1 flex-col justify-center gap-6"
    >
      <h2 className="text-2xl">Quem é a criança?</h2>

      <label className="flex flex-col gap-2">
        <span className="text-lg">Como ela é chamada?</span>
        <input
          required
          maxLength={40}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-shop"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-lg">Quantos anos?</span>
        {/* 2 to 14 is the check constraint in the schema, not a guess. */}
        <input
          type="number"
          min={2}
          max={14}
          required
          value={age}
          onChange={(e) => setAge(Number(e.target.value))}
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
            {option === "ouvir" ? "Quer ouvir" : "Quer ler"}
          </button>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg">Quem vai ficar com ela?</legend>
        {/* Chosen by the drawing, like everything else a child picks here. The
            silhouettes differ, not just the colours — a palette-only choice
            disappears for a colour-blind child. */}
        <div className="grid grid-cols-2 gap-3">
          {COMPANIONS.map((one) => (
            <button
              key={one.id}
              type="button"
              onClick={() => setCompanion(one.id)}
              aria-pressed={companion === one.id}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-4 text-center transition active:scale-[0.98] ${
                companion === one.id
                  ? "border-shop bg-shop/10"
                  : "border-edge bg-card"
              }`}
            >
              <one.Drawing size={72} />
              <span className="text-lg">{one.name}</span>
              <span className="text-sm text-muted">{one.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="rounded-2xl bg-shop px-6 py-5 text-2xl text-paper disabled:opacity-50"
      >
        Pronto
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-center text-lg text-shop underline"
        >
          Voltar
        </button>
      )}

      {error && <p className="text-center text-shop">{error}</p>}
    </form>
  );
}
