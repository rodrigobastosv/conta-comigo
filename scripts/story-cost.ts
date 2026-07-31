import { generateScene } from "../lib/generate-scene.ts";
import {
  costOfScene,
  inCents,
  storiesInsideFreeNarration,
} from "../lib/cost.ts";
import { LOST_THINGS_SHOP } from "../lib/story-bibles/index.ts";
import type { Beat, Scene, SceneRequest, ReadingLevel } from "../lib/types.ts";

/**
 * What one story costs, measured against the real model.
 *
 * `npm run cost -- ouvir` (or `ler`). Five beats down one branch, the same
 * shape a child walks, so the number is a story and not a scene multiplied by
 * five — beat 1 pays the cache write and beats 2–5 read it.
 */
const level = (process.argv[2] as ReadingLevel) ?? "ouvir";
const bibleId = process.argv[3] ?? LOST_THINGS_SHOP.id;

let facts: string[] = [];
let choice: string | null = null;
let characters = 0;
const costs = [];

for (const beat of [1, 2, 3, 4, 5] as Beat[]) {
  const request: SceneRequest = {
    bibleId,
    beat,
    readingLevel: level,
    helperName: "Nina",
    facts,
    choiceMade: choice,
  };

  // One retry, like the evaluation set: a rejected scene is a real cost and
  // has to be counted, not quietly dropped from the total.
  let scene: Scene | null = null;
  let firstToken: number | null = null;
  let attempts = 0;

  while (!scene && attempts < 2) {
    attempts += 1;
    const started = Date.now();
    firstToken = null;
    for await (const event of generateScene(request)) {
      if (event.type === "text") firstToken ??= Date.now() - started;
      if (event.type === "scene") scene = event.scene;
      if (event.type === "error")
        console.warn(`  beat ${beat} rejected: ${event.message}`);
    }
  }
  if (!scene)
    throw new Error(`beat ${beat} produced no scene in ${attempts} attempts`);
  if (attempts > 1) console.warn(`  beat ${beat} needed ${attempts} attempts`);

  characters += scene.text.length;
  facts = [...facts, ...scene.new_facts];
  choice = scene.choices[0]?.label ?? null;
  console.log(
    `  beat ${beat}: first token ${firstToken} ms, ${scene.text.length} chars`,
  );
}

console.log(`\n${level} · ${bibleId}`);
console.log(`narration: ${characters} characters`);
console.log(
  `stories inside Google's free month: ${storiesInsideFreeNarration(characters)}`,
);
