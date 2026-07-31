"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";

/**
 * The adult's door.
 *
 * This screen is the only one in the product not written for a child, and it
 * shows: plain words, no picture-first choices, no warmth to speak of. It is
 * deliberately the shortest path to the story — an email, a password, one
 * button. Every extra field here is a bedtime that starts later.
 *
 * There is no e-mail confirmation step: a parent who has to go and find a link
 * in an inbox while a five-year-old waits has already lost the evening. The
 * trade is written down in
 * docs/decisions.md#the-adult-signs-in-and-rls-is-the-boundary.
 */

type Mode = "in" | "up";

/** Provider codes are English and not for reading out loud. */
function inPortuguese(code: string): string {
  if (code.includes("Invalid login credentials")) {
    return "E-mail ou senha não conferem.";
  }
  if (code.includes("already registered")) {
    return "Esse e-mail já tem conta. Tente entrar.";
  }
  if (code.includes("Password should be")) {
    return "A senha precisa de pelo menos 6 letras.";
  }
  return "Não deu certo agora. Tente de novo.";
}

export function Account() {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const db = supabase();
    if (!db || busy) return;

    setBusy(true);
    setError(null);

    const { data, error: failed } =
      mode === "in"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password });

    setBusy(false);

    if (failed) {
      setError(inPortuguese(failed.message));
      return;
    }

    // A signup with no session means this project still has e-mail confirmation
    // switched on. Nothing here can fix that, so say what happened instead of
    // leaving the screen sitting there looking broken.
    if (!data.session) setCheck(true);

    // On success there is nothing to do: the auth listener in the shell picks
    // the session up and the screen changes underneath us.
  }

  if (check) {
    return (
      <section className="flex flex-1 flex-col justify-center gap-4">
        <h2 className="text-2xl">Confirme o e-mail</h2>
        <p className="text-lg">
          Enviamos um link para <strong>{email}</strong>. Abra o link e volte
          aqui.
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-1 flex-col justify-center gap-6"
    >
      <div>
        <h2 className="text-2xl">
          {mode === "in" ? "Entrar" : "Criar uma conta"}
        </h2>
        <p className="mt-1 text-base text-shop/70">
          As histórias ficam guardadas aqui, pra continuar depois.
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-lg">E-mail</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-shop"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-lg">Senha</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-shop"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="rounded-2xl bg-shop px-6 py-5 text-2xl text-paper disabled:opacity-50"
      >
        {mode === "in" ? "Entrar" : "Criar conta"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
        }}
        className="text-center text-lg text-shop underline"
      >
        {mode === "in" ? "Ainda não tenho conta" : "Já tenho conta"}
      </button>

      {error && <p className="text-center text-shop">{error}</p>}
    </form>
  );
}
