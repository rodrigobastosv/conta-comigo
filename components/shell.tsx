"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { ChildProfile } from "@/lib/archive";
import { hasPersistence, supabase } from "@/lib/supabase/browser";
import { Account } from "./account";
import { Children } from "./children";
import { AdultsOnly, Parents } from "./parents";
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
  /** Where the adult is: in the story, at the speed bump, or past it. */
  const [adults, setAdults] = useState<"out" | "gate" | "in">("out");

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

  if (adults === "gate") {
    return (
      <AdultsOnly
        onPass={() => setAdults("in")}
        onCancel={() => setAdults("out")}
      />
    );
  }

  if (adults === "in") {
    return (
      <Parents
        child={child}
        onLeave={(removed) => {
          setAdults("out");
          // The child this screen was about no longer exists; going back to the
          // story would be a story for a deleted profile.
          if (removed) setChild(null);
        }}
      />
    );
  }

  return (
    <>
      <Story profile={child} />
      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setChild(null)}
          className="text-base text-shop/70 underline"
        >
          Trocar de criança
        </button>
        <button
          type="button"
          onClick={() => setAdults("gate")}
          className="text-base text-shop/70 underline"
        >
          Para os adultos
        </button>
      </div>
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
