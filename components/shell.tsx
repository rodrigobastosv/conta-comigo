"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import {
  finishedStories,
  resumableStories,
  type ChildProfile,
  type StoryRead,
} from "@/lib/archive";
import { hasPersistence, supabase } from "@/lib/supabase/browser";
import { Account } from "./account";
import { Children } from "./children";
import { Home, type HomeAction } from "./home";
import { Library } from "./library";
import { AdultsOnly, Parents } from "./parents";
import { Logo } from "./pisca";
import { Story } from "./story";
import { ThemeToggle } from "./theme";

/**
 * Which screen the family is on.
 *
 * The order is a door, a name, then a home — and the first two only exist where
 * there is an archive. **With no Supabase variables the app is exactly what it
 * was before persistence existed**: no sign-in, no profile, no home screen, one
 * story that ends when the tab does. That is the promise in the README and this
 * component is where it is kept.
 */
type View = "home" | "story" | "library" | "share" | "gate" | "parents";

export function Shell() {
  const stores = hasPersistence();

  // `undefined` is "still asking", and it matters: rendering the sign-in screen
  // for the half second before a stored session is read would show a login to
  // somebody who is already signed in, every single time.
  const [session, setSession] = useState<Session | null | undefined>(
    stores ? undefined : null,
  );
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [view, setView] = useState<View>("home");
  const [resumable, setResumable] = useState<StoryRead[]>([]);
  const [finished, setFinished] = useState<StoryRead[]>([]);
  /** The story the home screen asked to pick up, handed to `Story` once. */
  const [resuming, setResuming] = useState<StoryRead | null>(null);

  useEffect(() => {
    const db = supabase();
    if (!db) return;

    void db.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = db.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Signing out has to drop the child too, or the next adult to sign in on
      // this device starts inside somebody else's evening.
      if (!next) {
        setChild(null);
        setView("home");
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  /**
   * What the shelves hold.
   *
   * Called when the family arrives home, not synchronised to a state variable:
   * the shelves change because somebody finished a story, which is an event.
   * Takes the profile id rather than reading `child`, so it can be called in
   * the same breath as choosing one.
   *
   * Read straight from the browser: RLS decides which rows come back, so a
   * route would add a round trip and no safety.
   */
  const refresh = useCallback(async (profileId: string) => {
    const db = supabase();
    if (!db) return;

    const [going, done] = await Promise.all([
      resumableStories(db, profileId),
      finishedStories(db, profileId),
    ]);
    setResumable(going.filter((entry) => entry.tip));
    setFinished(done);
  }, []);

  function goHome() {
    setResuming(null);
    setView("home");
    if (child) void refresh(child.id);
  }

  function pickChild(next: ChildProfile) {
    setChild(next);
    setView("home");
    void refresh(next.id);
  }

  const header = (
    <div className="mb-8 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={child ? goHome : undefined}
        // Only a control when there is somewhere to go; otherwise it is a mark.
        disabled={!child}
        aria-label={child ? "Voltar pro início" : undefined}
      >
        <Logo />
      </button>
      <ThemeToggle />
    </div>
  );

  if (!stores) {
    return (
      <>
        {header}
        <Story profile={null} />
      </>
    );
  }

  if (session === undefined) {
    return (
      <>
        {header}
        <p className="flex-1 py-8 text-lg text-muted">Um instante…</p>
      </>
    );
  }

  if (!session) {
    return (
      <>
        {header}
        <Account />
      </>
    );
  }

  if (!child) {
    return (
      <>
        {header}
        <Children guardianId={session.user.id} onPicked={pickChild} />
        <SignOut />
      </>
    );
  }

  return (
    <>
      {header}

      {view === "home" && (
        <Home
          childName={child.nickname}
          resumable={resumable}
          finishedCount={finished.length}
          onPick={(action: HomeAction) => {
            if (action === "new") {
              setResuming(null);
              setView("story");
            } else if (action === "library") setView("library");
            else if (action === "share") setView("share");
          }}
          onResume={(entry) => {
            setResuming(entry);
            setView("story");
          }}
        />
      )}

      {view === "story" && (
        <Story profile={child} resumeEntry={resuming} onHome={goHome} />
      )}

      {(view === "library" || view === "share") && (
        <Library profileId={child.id} intent={view} onLeave={goHome} />
      )}

      {view === "gate" && (
        <AdultsOnly onPass={() => setView("parents")} onCancel={goHome} />
      )}

      {view === "parents" && (
        <Parents
          child={child}
          onLeave={(removed) => {
            // The child this screen was about no longer exists; going back to
            // the home screen would be a home screen for a deleted profile.
            if (removed) setChild(null);
            goHome();
          }}
        />
      )}

      {view === "home" && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setChild(null)}
            className="text-base text-muted underline"
          >
            Trocar de criança
          </button>
          <button
            type="button"
            onClick={() => setView("gate")}
            className="text-base text-muted underline"
          >
            Para os adultos
          </button>
        </div>
      )}
    </>
  );
}

function SignOut() {
  return (
    <button
      type="button"
      onClick={() => void supabase()?.auth.signOut()}
      className="mt-6 self-center text-base text-muted underline"
    >
      Sair
    </button>
  );
}
