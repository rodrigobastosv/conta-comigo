// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import {
  factsAlongPath,
  scenesAlongPath,
  toStorySummary,
} from "./supabase/rows.ts";
import type { Db } from "./supabase/server.ts";
import type { ProfileRow, SceneRow, ScenePathRow } from "./supabase/types.ts";
import type { Beat, Choice, ReadingLevel, World } from "./types.ts";

/**
 * The archive: everything the app does to the scene graph.
 *
 * Isomorphic on purpose — every function takes the client instead of reaching
 * for one. The route passes a client carrying the adult's access token; the
 * browser passes its own. Both run under the same RLS policies, so there is no
 * privileged half of this file and no query here needs to remember to scope
 * itself by family.
 *
 * **A missing row is usually RLS, not a bug.** Asking for somebody else's story
 * returns nothing, exactly as if it had never existed. Treat "not found" as the
 * answer, never as a reason to try again with a wider query.
 *
 * Writes never throw. A story the child is already reading must not be lost
 * because an insert failed — the scene has been generated and paid for, so the
 * error goes to the server log and the session carries on in memory. Persistence
 * failing degrades to the no-Supabase behaviour; it does not become an error
 * screen.
 */

/**
 * The generation ceiling, counted where every instance can see it.
 *
 * `unreachable` is its own answer and the route **fails closed** on it. This
 * route costs money per call, and a database that cannot count is also a
 * database that cannot store the scene — so answering anyway would spend money
 * to produce a story that vanishes when the tab closes. See
 * docs/decisions.md#the-generation-ceiling-is-on-the-server.
 */
export type Claim = "ok" | "over-limit" | "no-session" | "unreachable";

export async function claimGeneration(
  db: Db,
  maxPerWindow: number,
  windowSeconds: number,
): Promise<Claim> {
  const { data, error } = await db.rpc("claim_generation", {
    max_per_window: maxPerWindow,
    window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[archive] could not count the generation", error.message);
    return "unreachable";
  }
  return data;
}

export type ChildProfile = {
  id: string;
  nickname: string;
  age: number;
  readingLevel: ReadingLevel;
  preferredVoice: string | null;
  preferredCompanion: string | null;
  restrictions: string[];
  forbiddenNames: string[];
};

function asProfile(row: ProfileRow): ChildProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    age: row.age,
    readingLevel: row.reading_level,
    preferredVoice: row.preferred_voice,
    preferredCompanion: row.preferred_companion,
    restrictions: row.restrictions,
    forbiddenNames: row.forbidden_names ?? [],
  };
}

/**
 * The children on this account, oldest first.
 *
 * No `where guardian_id = …` here and that is not an oversight: the policy on
 * `profiles` already resolves through `auth.uid()`, so this query cannot see
 * another adult's children even if it tried. Adding the filter would suggest
 * the filter is what protects them.
 */
export async function childProfiles(db: Db): Promise<ChildProfile[]> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !data) {
    if (error)
      console.error("[archive] could not list profiles", error.message);
    return [];
  }
  return data.map(asProfile);
}

export async function createProfile(
  db: Db,
  guardianId: string,
  child: { nickname: string; age: number; readingLevel: ReadingLevel },
): Promise<ChildProfile | null> {
  const { data, error } = await db
    .from("profiles")
    .insert({
      guardian_id: guardianId,
      nickname: child.nickname,
      age: child.age,
      reading_level: child.readingLevel,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[archive] could not create the profile", error.message);
    return null;
  }
  return asProfile(data);
}

export type StartedStory = {
  id: string;
  title: string;
};

export async function startStory(
  db: Db,
  story: {
    profileId: string;
    bibleId: string;
    title: string;
    helperName: string;
  },
): Promise<StartedStory | null> {
  const { data, error } = await db
    .from("stories")
    .insert({
      profile_id: story.profileId,
      bible_id: story.bibleId,
      title: story.title,
      helper_name: story.helperName,
    })
    .select("id, title")
    .single();

  if (error) {
    console.error("[archive] could not start the story", error.message);
    return null;
  }
  return { id: data.id, title: data.title };
}

/**
 * Names the world a run invented.
 *
 * Beat 1 writes it, and only beat 1 — the world belongs to the story, not to the
 * scene that happened to declare it, so every branch shares one. Without this,
 * a story re-read after a reload comes back in no world at all.
 */
export async function nameWorld(
  db: Db,
  storyId: string,
  world: World,
): Promise<void> {
  const { error } = await db
    .from("stories")
    .update({ world, title: world.title })
    .eq("id", storyId);

  if (error) console.error("[archive] could not name the world", error.message);
}

export type StoryContext = {
  id: string;
  profileId: string;
  bibleId: string;
  helperName: string;
  /** Layer 2, when the model invented it. Null for a hand-written world. */
  world: World | null;
};

/**
 * Everything about a run that beats 2–5 must not be told by the client.
 *
 * The world and the helper's name are coherence, not preferences: a client that
 * can change them mid-story can rename the shopkeeper between scene 2 and scene
 * 3. They come from the row that was written when the story began.
 */
export async function storyContext(
  db: Db,
  storyId: string,
): Promise<StoryContext | null> {
  const { data } = await db
    .from("stories")
    .select("id, profile_id, bible_id, helper_name, world")
    .eq("id", storyId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    profileId: data.profile_id,
    bibleId: data.bible_id,
    helperName: data.helper_name,
    world: data.world,
  };
}

export type Limits = {
  restrictions: string[];
  forbiddenNames: string[];
};

/**
 * What the family has asked the narrator to avoid.
 *
 * Read on the server from the profile, never taken from the request body. A
 * restriction a client can drop from a request is not a restriction — see
 * `extraRestrictions` in lib/types.ts and the passage in `buildRequest` that
 * tells the model to obey them without mentioning them.
 */
export async function limitsFor(db: Db, profileId: string): Promise<Limits> {
  const { data } = await db
    .from("profiles")
    .select("restrictions, forbidden_names")
    .eq("id", profileId)
    .maybeSingle();

  return {
    restrictions: data?.restrictions ?? [],
    forbiddenNames: data?.forbidden_names ?? [],
  };
}

/**
 * The same limits, as lines the prompt can carry.
 *
 * A forbidden name becomes a restriction too, and not only a check at the input:
 * refusing "Téo" as the helper's name is pointless if the model then hands it to
 * the shopkeeper.
 */
export function asPromptRestrictions(limits: Limits): string[] {
  return [
    ...limits.restrictions,
    ...limits.forbiddenNames.map(
      (name) => `Nunca use o nome "${name}" para nenhum personagem.`,
    ),
  ];
}

/** Case- and accent-insensitive: "téo" and "Teo" are the same refusal. */
export function isForbiddenName(name: string, forbidden: string[]): boolean {
  const flatten = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLowerCase();

  const wanted = flatten(name);
  return forbidden.some((entry) => flatten(entry) === wanted);
}

/**
 * What this child picked: who reads to her, and who waits on the home screen.
 *
 * Two ids rather than one. A friend who reads the story has become the
 * narrator, which is the line docs/story-bible.md draws — so the columns stay
 * apart even though the same screen sets both.
 */
export async function updateChoices(
  db: Db,
  profileId: string,
  choices: { preferredVoice?: string; preferredCompanion?: string },
): Promise<boolean> {
  // Typed against the row rather than a loose record, so a renamed column is a
  // compile error here and not a silently ignored update at runtime.
  const patch: Partial<ProfileRow> = {};
  if (choices.preferredVoice) patch.preferred_voice = choices.preferredVoice;
  if (choices.preferredCompanion) {
    patch.preferred_companion = choices.preferredCompanion;
  }
  if (Object.keys(patch).length === 0) return true;

  const { error } = await db.from("profiles").update(patch).eq("id", profileId);

  if (error) {
    console.error("[archive] could not save the choices", error.message);
    return false;
  }
  return true;
}

export async function updateLimits(
  db: Db,
  profileId: string,
  limits: Limits,
): Promise<boolean> {
  const { error } = await db
    .from("profiles")
    .update({
      restrictions: limits.restrictions,
      forbidden_names: limits.forbiddenNames,
    })
    .eq("id", profileId);

  if (error) {
    console.error("[archive] could not save the limits", error.message);
    return false;
  }
  return true;
}

/**
 * Removes a child and everything they built.
 *
 * `stories` and `scenes` cascade from `profiles` in the schema, so this is one
 * delete and not three. It is irreversible on purpose — a parent who asks for
 * this is asking for it to be gone, not archived somewhere they cannot see.
 */
export async function deleteProfile(
  db: Db,
  profileId: string,
): Promise<boolean> {
  const { error } = await db.from("profiles").delete().eq("id", profileId);

  if (error) {
    console.error("[archive] could not delete the profile", error.message);
    return false;
  }
  return true;
}

/** Beat 5 has landed: the story is finished and must stop being offered as unfinished. */
export async function endStory(db: Db, storyId: string): Promise<void> {
  const { error } = await db
    .from("stories")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", storyId);

  if (error) console.error("[archive] could not end the story", error.message);
}

export type StoredScene = {
  id: string;
  storyId: string;
  parentSceneId: string | null;
  beat: Beat;
  text: string;
  newFacts: string[];
  choices: Choice[];
  /** The label of the choice that led here. Null on the root scene. */
  entryChoice: string | null;
};

function asStored(row: SceneRow): StoredScene {
  return {
    id: row.id,
    storyId: row.story_id,
    parentSceneId: row.parent_scene_id,
    beat: row.beat as Beat,
    text: row.text,
    newFacts: row.new_facts,
    choices: row.choices,
    entryChoice: row.entry_choice,
  };
}

export async function sceneById(
  db: Db,
  sceneId: string,
): Promise<StoredScene | null> {
  const { data } = await db
    .from("scenes")
    .select("*")
    .eq("id", sceneId)
    .maybeSingle();

  return data ? asStored(data) : null;
}

/**
 * The scene that already exists for this (parent, choice), if there is one.
 *
 * This is the fast path of "reuse, don't regenerate". The correctness boundary
 * is the unique index `scenes_parent_choice`, not this lookup — see
 * `storeScene`, which is what handles two children racing for the same branch.
 */
export async function siblingFor(
  db: Db,
  parentSceneId: string,
  entryChoice: string,
): Promise<StoredScene | null> {
  const { data } = await db
    .from("scenes")
    .select("*")
    .eq("parent_scene_id", parentSceneId)
    .eq("entry_choice", entryChoice)
    .maybeSingle();

  return data ? asStored(data) : null;
}

/** Postgres's unique_violation. The index did its job; this is not an error. */
const UNIQUE_VIOLATION = "23505";

export async function storeScene(
  db: Db,
  scene: {
    storyId: string;
    parentSceneId: string | null;
    beat: Beat;
    text: string;
    newFacts: string[];
    choices: Choice[];
    entryChoice: string | null;
    promptVersion: string;
  },
): Promise<StoredScene | null> {
  const { data, error } = await db
    .from("scenes")
    .insert({
      story_id: scene.storyId,
      parent_scene_id: scene.parentSceneId,
      beat: scene.beat,
      text: scene.text,
      new_facts: scene.newFacts,
      choices: scene.choices,
      entry_choice: scene.entryChoice,
      prompt_version: scene.promptVersion,
    })
    .select("*")
    .single();

  if (!error) return asStored(data);

  /**
   * Two requests asked for the same (parent, choice) at once and the index let
   * exactly one through. The loser reads the winner's row and serves that: one
   * scene exists, both children are answered, and neither sees an error.
   *
   * The alternative — surfacing this — would show a five-year-old a failure
   * caused by her own double tap.
   */
  if (error.code === UNIQUE_VIOLATION && scene.parentSceneId) {
    const winner = await siblingFor(
      db,
      scene.parentSceneId,
      scene.entryChoice!,
    );
    if (winner) return winner;
  }

  console.error("[archive] could not store the scene", error.message);
  return null;
}

/**
 * The branch travelled, root first, as whole scenes.
 *
 * `scene_path()` is not what rebuilds the screen after a reload: it returns the
 * facts and the text, which is what the *prompt* needs, and deliberately not the
 * choices, which is what the *buttons* need. So this reads the story's scenes
 * and climbs the parent links in memory — one query for a story that has at most
 * a couple of dozen scenes.
 *
 * Keep both. `scene_path()` stays the server's way of assembling layer 3,
 * because a recursive CTE cannot be tricked by a client into walking a branch
 * that is not its own.
 */
export async function branchTo(
  db: Db,
  sceneId: string,
): Promise<StoredScene[]> {
  const { data } = await db
    .from("scenes")
    .select("*")
    .eq("id", sceneId)
    .maybeSingle();
  if (!data) return [];

  const { data: all } = await db
    .from("scenes")
    .select("*")
    .eq("story_id", data.story_id);

  const byId = new Map((all ?? []).map((row) => [row.id, row]));
  const branch: SceneRow[] = [];

  let at: SceneRow | undefined = data;
  while (at) {
    branch.push(at);
    at = at.parent_scene_id ? byId.get(at.parent_scene_id) : undefined;
  }

  return branch.reverse().map(asStored);
}

/**
 * The path from the root down to a scene, as `scene_path()` climbs it.
 *
 * This is where layer 3 comes from now. Climbing `parent_scene_id` gives exactly
 * the facts of THAT branch — a client cannot assemble this after a reload, and a
 * client-owned fact list is a client-editable one.
 */
export async function scenePath(
  db: Db,
  sceneId: string,
): Promise<ScenePathRow[]> {
  const { data, error } = await db.rpc("scene_path", { scene: sceneId });

  if (error) {
    console.error("[archive] could not read the path", error.message);
    return [];
  }
  return data ?? [];
}

export async function factsUpTo(db: Db, sceneId: string): Promise<string[]> {
  return factsAlongPath(await scenePath(db, sceneId));
}

/** The little book: every scene of the branch, root first. */
export async function bookUpTo(db: Db, sceneId: string) {
  return scenesAlongPath(await scenePath(db, sceneId));
}

export type StoryRead = {
  story: ReturnType<typeof toStorySummary>;
  /** The deepest scene on the path taken so far — where "continue" resumes. */
  tip: StoredScene | null;
};

/**
 * The stories this child can pick up again, newest first.
 *
 * Read straight from the browser: RLS is what decides which rows come back, so
 * there is nothing here a route would add except a round trip.
 */
export async function resumableStories(
  db: Db,
  profileId: string,
  limit = 5,
): Promise<StoryRead[]> {
  const { data: stories, error } = await db
    .from("stories")
    .select("*")
    .eq("profile_id", profileId)
    .is("ended_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !stories) {
    if (error) console.error("[archive] could not list stories", error.message);
    return [];
  }

  return Promise.all(
    stories.map(async (row) => ({
      story: toStorySummary(row),
      tip: await deepestScene(db, row.id),
    })),
  );
}

/**
 * The scene the child stopped at.
 *
 * Deepest beat wins, and the most recent one among them: a story that branched
 * has more than one scene at its deepest beat, and the one she was actually
 * looking at is the one written last.
 */
export async function deepestScene(
  db: Db,
  storyId: string,
): Promise<StoredScene | null> {
  const { data } = await db
    .from("scenes")
    .select("*")
    .eq("story_id", storyId)
    .order("beat", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? asStored(data) : null;
}

export async function finishedStories(
  db: Db,
  profileId: string,
  limit = 20,
): Promise<StoryRead[]> {
  const { data, error } = await db
    .from("stories")
    .select("*")
    .eq("profile_id", profileId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error("[archive] could not list stories", error.message);
    return [];
  }

  return Promise.all(
    data.map(async (row) => ({
      story: toStorySummary(row),
      tip: await deepestScene(db, row.id),
    })),
  );
}
