"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { ChildProfile } from "@/lib/archive";
import { hasPersistence, supabase } from "@/lib/supabase/browser";
import { Account } from "./account";
import { Children } from "./children";
import { Story } from "./story";

/**
 * Which of the three screens the family is on.
 *
 * The order is a door, a name, and then the story — and the first two only
 * exist where there is an archive. **With no Supabase variables the app is
 * exactly what it was before persistence existed**: no sign-in, no profile, one
 * session that ends when the tab does. That is the promise in the README and
 * this component is where it is kept.
 */
export function Shell() {
  const stores = hasPersistence();

  // `undefined` is "still asking", and it matters: rendering the sign-in screen
  // for the half second before a stored session is read would show a login to
  // somebody who is already signed in, every single time.
  const [session, setSession] = useState<Session | null | undefined>(
    stores ? undefined : null,
  );
  const [child, setChild] = useState<ChildProfile | null>(null);

  useEffect(() => {
    const db = supabase();
    if (!db) return;

    void db.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = db.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Signing out has to drop the child too, or the next adult to sign in on
      // this device starts inside somebody else's evening.
      if (!next) setChild(null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!stores) return <Story profile={null} />;

  if (session === undefined) {
    return <p className="flex-1 py-8 text-lg text-shop/70">Um instante…</p>;
  }

  if (!session) return <Account />;

  if (!child) {
    return (
      <>
        <Children guardianId={session.user.id} onPicked={setChild} />
        <SignOut />
      </>
    );
  }

  return (
    <>
      <Story profile={child} />
      <button
        type="button"
        onClick={() => setChild(null)}
        className="mt-6 self-center text-base text-shop/70 underline"
      >
        Trocar de criança
      </button>
    </>
  );
}

function SignOut() {
  return (
    <button
      type="button"
      onClick={() => void supabase()?.auth.signOut()}
      className="mt-6 self-center text-base text-shop/70 underline"
    >
      Sair
    </button>
  );
}
