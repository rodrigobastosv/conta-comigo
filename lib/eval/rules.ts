import { Sentences } from "../stream-json.ts";
import type { ReadingLevel, Scene } from "../types.ts";

/**
 * The measurable half of the story bible.
 *
 * "Suitable for a 5-year-old" is not testable; "average sentence of 8 to 14
 * words" is. That is why the reading-level rules in lib/prompts/v1.ts are
 * numbers — see docs/decisions.md. This file is where those numbers become a
 * pass or a fail, so that a prompt change is checked before a child meets it.
 *
 * The numbers below are a transcription of the prompt. If you change one here
 * without changing it there, the evaluation is measuring a rule the model was
 * never given.
 */

export type LevelRules = {
  words: [number, number];
  /** Mean words per sentence. `ouvir` has a floor; `ler` only has a ceiling. */
  sentenceWords: [number, number];
  choiceLabelWords: [number, number];
  requiresRefrain: boolean;
};

export const RULES: Record<ReadingLevel, LevelRules> = {
  ouvir: {
    words: [90, 140],
    sentenceWords: [8, 14],
    choiceLabelWords: [2, 4],
    requiresRefrain: true,
  },
  ler: {
    words: [180, 260],
    sentenceWords: [1, 20],
    choiceLabelWords: [1, 8],
    requiresRefrain: false,
  },
};

export type Severity = "fail" | "warn";

export type Violation = {
  severity: Severity;
  rule: string;
  detail: string;
};

export type Measurements = {
  words: number;
  sentences: number;
  meanSentenceWords: number;
  longestSentenceWords: number;
  hasRefrain: boolean;
  choiceLabelWords: number[];
};

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split with the same class the streaming path uses, so the evaluation measures
 * the sentences the narration will actually speak — not a second opinion about
 * where a sentence ends.
 */
export function splitSentences(text: string): string[] {
  const sentences = new Sentences();
  return [...sentences.push(text), ...sentences.drain()];
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function measure(scene: Scene, refrain: string): Measurements {
  const sentences = splitSentences(scene.text);
  const sentenceWords = sentences.map(countWords);

  return {
    words: countWords(scene.text),
    sentences: sentences.length,
    meanSentenceWords: sentenceWords.length
      ? sentenceWords.reduce((a, b) => a + b, 0) / sentenceWords.length
      : 0,
    longestSentenceWords: Math.max(0, ...sentenceWords),
    hasRefrain: normalise(scene.text).includes(normalise(refrain)),
    choiceLabelWords: scene.choices.map((c) => countWords(c.label)),
  };
}

/**
 * Words that cannot appear in a story governed by this constitution. Kept short
 * and high-precision on purpose: a check that cries wolf gets ignored, and an
 * ignored check is worse than no check.
 */
const FORBIDDEN = [
  "morreu",
  "morrer",
  "morte",
  "sangue",
  "sangrando",
  "ferido",
  "ferimento",
  "machucado",
  "doente",
  "hospital",
];

/** An explicit moral at the end is banned by the constitution. */
const MORAL_MARKERS = [
  "e assim aprendeu",
  "e assim ela aprendeu",
  "e assim ele aprendeu",
  "moral da historia",
  "a licao e",
  "aprendeu que",
];

/**
 * Strips dialogue before looking for a narrator who talks about herself.
 * Characters speak in the first person constantly — the mitten says "meu par
 * ficou no ônibus" — so a first-person check that does not remove speech first
 * is pure noise.
 */
function withoutDialogue(text: string): string {
  return text
    .replace(/["“”][^"“”]*["“”]/g, " ")
    .replace(/^\s*[—–-]\s.*$/gm, " ");
}

const NARRATOR_SELF = /\b(eu|meu|minha|comigo|me parece|acho que)\b/i;

export function check(
  scene: Scene,
  level: ReadingLevel,
  refrain: string,
  isFinalBeat: boolean,
): { measurements: Measurements; violations: Violation[] } {
  const rules = RULES[level];
  const m = measure(scene, refrain);
  const violations: Violation[] = [];

  const fail = (rule: string, detail: string) =>
    violations.push({ severity: "fail", rule, detail });
  const warn = (rule: string, detail: string) =>
    violations.push({ severity: "warn", rule, detail });

  const [minWords, maxWords] = rules.words;
  if (m.words < minWords || m.words > maxWords) {
    fail("words-per-scene", `${m.words} not in ${minWords}–${maxWords}`);
  }

  const [minSentence, maxSentence] = rules.sentenceWords;
  if (m.meanSentenceWords < minSentence || m.meanSentenceWords > maxSentence) {
    fail(
      "mean-sentence-words",
      `${m.meanSentenceWords.toFixed(1)} not in ${minSentence}–${maxSentence}`,
    );
  }

  // A single runaway sentence is invisible in the mean and very visible to a
  // child being read to.
  if (m.longestSentenceWords > maxSentence * 1.5) {
    warn(
      "longest-sentence",
      `${m.longestSentenceWords} words, ceiling is ${maxSentence}`,
    );
  }

  if (rules.requiresRefrain && !m.hasRefrain) {
    fail("refrain", "the story's refrain does not appear in this scene");
  }

  const [minLabel, maxLabel] = rules.choiceLabelWords;
  for (const [i, words] of m.choiceLabelWords.entries()) {
    if (words < minLabel || words > maxLabel) {
      fail(
        "choice-label-words",
        `choice ${i + 1} has ${words} words, allowed ${minLabel}–${maxLabel}`,
      );
    }
  }

  // The structural rule that validateScene also enforces, restated here because
  // the evaluation runs against scenes, not against the route.
  const expectedChoices = isFinalBeat ? 0 : 2;
  if (scene.choices.length !== expectedChoices) {
    fail(
      "choice-count",
      `${scene.choices.length} choices, expected ${expectedChoices}`,
    );
  }

  const flat = normalise(scene.text);
  for (const word of FORBIDDEN) {
    if (new RegExp(`\\b${word}\\b`).test(flat)) {
      fail("constitution-content", `contains "${word}"`);
    }
  }
  for (const marker of MORAL_MARKERS) {
    if (flat.includes(marker)) {
      fail("constitution-moral", `explicit moral: "${marker}"`);
    }
  }

  // Heuristic, hence a warning: the narrator is not a character and never refers
  // to herself, but dialogue-stripping is imperfect and a false positive here
  // must not fail a run on its own.
  if (NARRATOR_SELF.test(withoutDialogue(scene.text))) {
    warn("narrator-persona", "first person outside dialogue");
  }

  return { measurements: m, violations };
}
