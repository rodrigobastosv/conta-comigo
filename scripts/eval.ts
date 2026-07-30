/**
 * Runs the ten fixed openings against the real model and measures the numeric
 * reading-level rules.
 *
 *   npm run eval
 *
 * This is the thing that lets the prompt change without discovering the
 * regression from a child's mouth. It is deliberately NOT part of `npm test` and
 * NOT part of CI: it calls the real API, it costs real money, and CI must keep
 * running with no key at all.
 *
 * It is also the only honest way to answer whether `EFFORT` should move off
 * `low` — see docs/decisions.md.
 *
 * Any PR that touches lib/prompts/v1.ts or docs/story-bible.md should paste the
 * summary this prints. Exits non-zero if any hard rule fails.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { CASES } from "../lib/eval/cases.ts";
import { check, type Violation } from "../lib/eval/rules.ts";
import { generateScene } from "../lib/generate-scene.ts";
import { PROMPT_VERSION } from "../lib/prompts/v1.ts";
import { EFFORT, MODEL } from "../lib/anthropic.ts";
import { LOST_THINGS_SHOP } from "../lib/story-bibles/loja-de-coisas-perdidas.ts";
import { FINAL_BEAT, type Scene } from "../lib/types.ts";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Put it in .env.local (see .env.example).",
  );
  process.exit(1);
}

const REPORT_DIR = "eval-reports";

type Result = {
  id: string;
  beat: number;
  level: string;
  ok: boolean;
  regenerated: boolean;
  ms: number;
  words: number;
  meanSentenceWords: number;
  hasRefrain: boolean;
  violations: Violation[];
  text: string;
};

/** Collects a whole scene from the generator, which is what the route streams. */
async function generate(
  request: (typeof CASES)[number]["request"],
): Promise<{ scene: Scene | null; error: string | null }> {
  for await (const event of generateScene(request)) {
    if (event.type === "scene") return { scene: event.scene, error: null };
    if (event.type === "error") return { scene: null, error: event.message };
  }
  return { scene: null, error: "no-scene-event" };
}

const results: Result[] = [];

console.log(
  `prompt ${PROMPT_VERSION}   model ${MODEL}   effort ${EFFORT}   ${CASES.length} cases\n`,
);

for (const testCase of CASES) {
  const started = Date.now();
  let { scene, error } = await generate(testCase.request);

  // How often the model needs a second attempt IS one of the metrics: a prompt
  // that has to be retried is a prompt that costs double in production.
  const regenerated = scene === null;
  if (regenerated) {
    ({ scene, error } = await generate(testCase.request));
  }

  const ms = Date.now() - started;

  if (!scene) {
    results.push({
      id: testCase.id,
      beat: testCase.request.beat,
      level: testCase.request.readingLevel,
      ok: false,
      regenerated,
      ms,
      words: 0,
      meanSentenceWords: 0,
      hasRefrain: false,
      violations: [
        { severity: "fail", rule: "generation", detail: error ?? "unknown" },
      ],
      text: "",
    });
    console.log(`FAIL  ${testCase.id.padEnd(20)} could not generate: ${error}`);
    continue;
  }

  const { measurements, violations } = check(
    scene,
    testCase.request.readingLevel,
    LOST_THINGS_SHOP.refrain,
    testCase.request.beat === FINAL_BEAT,
  );

  const failures = violations.filter((v) => v.severity === "fail");
  const ok = failures.length === 0;

  results.push({
    id: testCase.id,
    beat: testCase.request.beat,
    level: testCase.request.readingLevel,
    ok,
    regenerated,
    ms,
    words: measurements.words,
    meanSentenceWords: Number(measurements.meanSentenceWords.toFixed(1)),
    hasRefrain: measurements.hasRefrain,
    violations,
    text: scene.text,
  });

  console.log(
    [
      ok ? "pass" : "FAIL",
      testCase.id.padEnd(20),
      `${String(measurements.words).padStart(3)}w`,
      `${measurements.meanSentenceWords.toFixed(1).padStart(4)}w/frase`,
      measurements.hasRefrain ? "refrão" : "      ",
      regenerated ? "REGEROU" : "       ",
      `${String(ms).padStart(5)}ms`,
    ].join("  "),
  );

  for (const v of violations) {
    console.log(
      `      ${v.severity === "fail" ? "✗" : "!"} ${v.rule}: ${v.detail}`,
    );
  }
}

const failed = results.filter((r) => !r.ok);
const regenerated = results.filter((r) => r.regenerated);
const meanWords =
  results.reduce((a, r) => a + r.words, 0) / (results.length || 1);

console.log(
  [
    "",
    `${results.length - failed.length}/${results.length} passed`,
    `${regenerated.length} needed a second attempt`,
    `mean ${meanWords.toFixed(0)} words`,
  ].join("   "),
);

mkdirSync(REPORT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = `${REPORT_DIR}/${PROMPT_VERSION}-${stamp}.json`;
writeFileSync(
  path,
  JSON.stringify(
    { promptVersion: PROMPT_VERSION, model: MODEL, effort: EFFORT, results },
    null,
    2,
  ),
);
console.log(`\nreport: ${path}`);

if (failed.length > 0) process.exit(1);
