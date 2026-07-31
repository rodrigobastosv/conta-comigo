import type { StoryBible } from "../types.ts";
import { SELF_BUILDING_CIRCUS } from "./circo-que-monta-sozinho.ts";
import { LOST_THINGS_SHOP } from "./loja-de-coisas-perdidas.ts";
import { ORIGINAL_WORLD } from "./original.ts";

/**
 * Every world the app can run, keyed by the id that goes into
 * `stories.bible_id`. Adding a world is adding a file and an entry here — the
 * generator resolves the bible from the request and never imports one directly.
 *
 * The order is the order the child sees on the start screen.
 */
export const BIBLES: StoryBible[] = [
  ORIGINAL_WORLD,
  LOST_THINGS_SHOP,
  SELF_BUILDING_CIRCUS,
];

export const DEFAULT_BIBLE_ID = ORIGINAL_WORLD.id;

export function bibleById(id: string): StoryBible | undefined {
  return BIBLES.find((bible) => bible.id === id);
}

export { LOST_THINGS_SHOP, ORIGINAL_WORLD, SELF_BUILDING_CIRCUS };
