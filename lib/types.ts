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

export type Scene = {
  text: string;
  new_facts: string[];
  /** Exactly 2, except on the final beat, where it is empty. */
  choices: Choice[];
};

/** A scene already placed in the graph — what goes to the database. */
export type SceneInGraph = Scene & {
  id: string;
  parentSceneId: string | null;
  beat: Beat;
  promptVersion: string;
  /** Label of the choice that led here. Null on the first scene. */
  entryChoice: string | null;
};

export type SceneRequest = {
  beat: Beat;
  readingLevel: ReadingLevel;
  helperName: string;
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
