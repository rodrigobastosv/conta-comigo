/**
 * The database as TypeScript sees it.
 *
 * Hand-written, adjacent to the SQL it mirrors, rather than generated: the
 * schema is three tables and one function, and a generator would put a
 * `npx supabase login` between a contributor and a passing typecheck. The cost
 * is that this file can go stale, which is worse than having none — so:
 *
 * **After any change to supabase/schema.sql, change this file in the same
 * commit.** If it ever grows past what a person can hold in their head, replace
 * it with `npx supabase gen types typescript --project-id <id> > lib/supabase/types.ts`
 * and commit the output; nothing else imports the shapes below by name.
 *
 * snake_case here because that is what the wire carries. The translation to the
 * domain types happens in exactly one place, lib/supabase/rows.ts.
 */

/** Layer 2 of an invented run, as it sits in `stories.world`. */
export type WorldJson = {
  title: string;
  refrain: string;
  invariants: string[];
};

export type ChoiceJson = {
  label: string;
  icon: string;
};

export type ProfileRow = {
  id: string;
  guardian_id: string;
  nickname: string;
  age: number;
  reading_level: "ouvir" | "ler";
  preferred_voice: string | null;
  restrictions: string[];
  forbidden_names: string[];
  created_at: string;
};

export type StoryRow = {
  id: string;
  profile_id: string;
  bible_id: string;
  world: WorldJson | null;
  title: string;
  helper_name: string;
  created_at: string;
  ended_at: string | null;
};

export type SceneRow = {
  id: string;
  story_id: string;
  parent_scene_id: string | null;
  beat: number;
  text: string;
  new_facts: string[];
  choices: ChoiceJson[];
  entry_choice: string | null;
  prompt_version: string;
  created_at: string;
};

/** One row of `scene_path(uuid)`, root first. */
export type ScenePathRow = {
  id: string;
  beat: number;
  text: string;
  new_facts: string[];
  entry_choice: string | null;
  depth: number;
};

/**
 * What an insert has to carry: the columns with no default.
 *
 * Written out per table rather than derived from `Row`, because the interesting
 * information — which columns the database fills in for you — is exactly what a
 * mechanical `Omit` hides.
 */
type ProfileInsert = {
  guardian_id: string;
  nickname: string;
  age: number;
  reading_level: "ouvir" | "ler";
  preferred_voice?: string | null;
  restrictions?: string[];
  forbidden_names?: string[];
};

type StoryInsert = {
  profile_id: string;
  bible_id: string;
  title: string;
  helper_name: string;
  world?: WorldJson | null;
  ended_at?: string | null;
};

type SceneInsert = {
  story_id: string;
  parent_scene_id: string | null;
  beat: number;
  text: string;
  new_facts: string[];
  choices: ChoiceJson[];
  entry_choice: string | null;
  prompt_version: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      stories: {
        Row: StoryRow;
        Insert: StoryInsert;
        Update: Partial<StoryRow>;
        Relationships: [];
      };
      scenes: {
        Row: SceneRow;
        Insert: SceneInsert;
        Update: Partial<SceneRow>;
        Relationships: [];
      };
      /**
       * Present for completeness and unreachable on purpose: RLS is on and no
       * policy grants anything. Only claim_generation() touches it.
       */
      generation_counters: {
        Row: { key: string; total: number; expires_at: string };
        Insert: { key: string; total?: number; expires_at: string };
        Update: Partial<{ key: string; total: number; expires_at: string }>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      scene_path: {
        Args: { scene: string };
        Returns: ScenePathRow[];
      };
      claim_generation: {
        Args: { max_per_window: number; window_seconds: number };
        Returns: "ok" | "over-limit" | "no-session";
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
