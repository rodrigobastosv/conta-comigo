/**
 * Reading mode of the active profile. Only one text is generated per scene; the
 * audio levels out the rest.
 *
 * The values stay in Portuguese: they are also in the prompt and in the
 * `reading_level` check constraint in the database.
 */
export type ReadingLevel = "ouvir" | "ler";

/** 1..5 — see the beat structure in the story bible. Beat 5 ends the run. */
export type Beat = 1 | 2 | 3 | 4 | 5;

export const FINAL_BEAT: Beat = 5;

export type Choice = {
  label: string;
  /** A single emoji. Becomes a real illustration after the MVP. */
  icon: string;
};

/**
 * Layer 2 of a single run: the world the story happens in.
 *
 * A fixed world has this written by hand in lib/story-bibles/. An invented world
 * has the model return it on beat 1, and from then on it travels in the request
 * exactly like the facts do — see docs/story-bible.md, layer 2b.
 */
export type World = {
  title: string;
  refrain: string;
  /** The rules this world never breaks. 3 to 5, one short sentence each. */
  invariants: string[];
};

export type Scene = {
  text: string;
  /**
   * The world this scene invented. Only ever set on beat 1 of an invented world;
   * null everywhere else, because a world is not invented twice.
   */
  world: World | null;
  new_facts: string[];
  /** Exactly 2, except on the final beat, where it is empty. */
  choices: Choice[];
};

/**
 * Layer 2 as it ships: one file per world in lib/story-bibles/.
 *
 * The filename mirrors `id`, which is what goes into `stories.bible_id`. Keep it
 * that way: an archived story records the id, and finding the world it was
 * generated in should not require a lookup table. That is also why the id of a
 * hand-written world stays in Portuguese while the code around it is English.
 */
export type StoryBible = {
  id: string;
  /**
   * Shown before the first scene exists. In an invented world it is a promise
   * ("uma história nova"), and `scene.world.title` replaces it on beat 1.
   */
  title: string;
  /**
   * Null when the world is invented: the refrain is written on beat 1 and comes
   * back in `scene.world.refrain`.
   */
  refrain: string | null;
  /** Whether beat 1 has to invent the world. See docs/story-bible.md, layer 2b. */
  invented: boolean;
  /** Layer 2: rendered into the system prompt, in full, on every call. */
  text: string;
  /** Instruction per beat. Passed into the prompt as a parameter. */
  beats: Record<Beat, string>;
};

/**
 * A scene already placed in the graph — what goes to the database.
 *
 * `world` is dropped on purpose: it belongs to the run, not to the scene, so it
 * is stored once on `stories.world` rather than on the beat that happened to
 * write it. Every branch of the story shares one world.
 */
export type SceneInGraph = Omit<Scene, "world"> & {
  id: string;
  parentSceneId: string | null;
  beat: Beat;
  promptVersion: string;
  /** Label of the choice that led here. Null on the first scene. */
  entryChoice: string | null;
};

export type SceneRequest = {
  /** Which world. `bibleById` resolves it; it is also what `stories.bible_id` stores. */
  bibleId: string;
  beat: Beat;
  readingLevel: ReadingLevel;
  helperName: string;
  /**
   * The seed the child tapped, in an invented world: where the story starts.
   *
   * The client sends an id and the route resolves it against `SEEDS`, so the
   * prose that reaches the prompt is always prose this repository wrote — a
   * child's free text going straight into a prompt is a door this product does
   * not need open. Null means "surprise me".
   */
  seed?: string | null;
  /**
   * The world this run happens in, when the model invented it. Null on beat 1
   * (there is nothing to carry yet) and null for the whole of a fixed world,
   * whose layer 2 is already in the cached system block.
   */
  world?: World | null;
  /** Facts accumulated along the path, from the parent up to the root. Layer 3 of the story bible. */
  facts: string[];
  /** Label of the choice the child has just made. Null on beat 1. */
  choiceMade: string | null;
  /**
   * Extra restrictions from the family (fears to avoid, forbidden names).
   * Empty today; parents' mode fills this in later without touching the prompt.
   */
  extraRestrictions?: string[];
};
