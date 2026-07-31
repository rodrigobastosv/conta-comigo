// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import type { Beat, Scene, SceneInGraph, World } from "../types.ts";
import type { SceneRow, ScenePathRow, StoryRow, WorldJson } from "./types.ts";

/**
 * The snake_case ↔ camelCase border, and the only place it is crossed.
 *
 * Two shapes describe a scene and they are not the same shape: `SceneRow` is
 * what Postgres stores, `Scene` is what the model returns and the UI renders.
 * Letting either leak into the other's half of the codebase is how you end up
 * with `parent_scene_id` in a React component and `entryChoice` in a `.eq()`.
 */

export function toScene(row: SceneRow): Scene {
  return {
    text: row.text,
    // A scene never carries the world: it belongs to the run and lives on
    // `stories.world`. See the note on `SceneInGraph` in lib/types.ts.
    world: null,
    new_facts: row.new_facts,
    choices: row.choices,
  };
}

export function toSceneInGraph(row: SceneRow): SceneInGraph {
  return {
    id: row.id,
    parentSceneId: row.parent_scene_id,
    beat: row.beat as Beat,
    text: row.text,
    new_facts: row.new_facts,
    choices: row.choices,
    entryChoice: row.entry_choice,
    promptVersion: row.prompt_version,
  };
}

export function toWorld(json: WorldJson | null): World | null {
  return json;
}

/**
 * The facts of one branch, root first.
 *
 * `scene_path()` returns the rows ordered by depth descending, which is
 * root-first already — the sort here is belt and braces, because a fact list in
 * the wrong order reads as a story told backwards to the model.
 */
export function factsAlongPath(path: ScenePathRow[]): string[] {
  return [...path]
    .sort((a, b) => b.depth - a.depth)
    .flatMap((row) => row.new_facts);
}

/** The little book: the path travelled, root first. */
export function scenesAlongPath(path: ScenePathRow[]) {
  return [...path]
    .sort((a, b) => b.depth - a.depth)
    .map((row) => ({
      id: row.id,
      beat: row.beat as Beat,
      text: row.text,
      entryChoice: row.entry_choice,
    }));
}

export type StorySummary = {
  id: string;
  bibleId: string;
  title: string;
  helperName: string;
  world: World | null;
  endedAt: string | null;
  lovedAt: string | null;
};

export function toStorySummary(row: StoryRow): StorySummary {
  return {
    id: row.id,
    bibleId: row.bible_id,
    title: row.title,
    helperName: row.helper_name,
    world: toWorld(row.world),
    endedAt: row.ended_at,
    lovedAt: row.loved_at,
  };
}
