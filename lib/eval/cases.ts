import type { SceneRequest } from "../types.ts";

/**
 * The ten fixed openings.
 *
 * Fixed is the whole point: the numbers are only comparable across prompt
 * versions if the inputs never move. Do not edit a case to make a run pass —
 * add a case, or change the prompt.
 *
 * Between them they cover both reading levels, the first and last beat, a name
 * with accents, a name that is awkward to narrate, an empty fact list and a deep
 * one.
 */
export type EvalCase = {
  id: string;
  why: string;
  request: SceneRequest;
};

const FACTS_MID = [
  "o objeto perdido é um chinelo de tricô amarelo",
  "o dono é o seu Bento, que varre a praça",
  "o chinelo se perdeu num dia de chuva forte",
];

const FACTS_DEEP = [
  ...FACTS_MID,
  "farelo latiu uma vez quando o chinelo falou",
  "dona vitória guardou o chinelo na gaveta de cima",
  "a chuva parou quando a loja apareceu",
  "o seu bento tem um guarda-chuva vermelho",
  "a praça fica atrás da padaria",
  "o chinelo tem um remendo azul no calcanhar",
  "a gaveta range quando abre",
];

export const CASES: EvalCase[] = [
  {
    id: "ouvir-abertura",
    why: "The plain first scene. If this drifts, everything drifts.",
    request: {
      beat: 1,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: [],
      choiceMade: null,
    },
  },
  {
    id: "ouvir-batida-2",
    why: "First scene that has to build on facts and on a choice.",
    request: {
      beat: 2,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: FACTS_MID.slice(0, 1),
      choiceMade: "Abrir a gaveta",
    },
  },
  {
    id: "ouvir-batida-3",
    why: "The complication beat, where a villain is most tempting.",
    request: {
      beat: 3,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: FACTS_MID,
      choiceMade: "Seguir o barulho",
    },
  },
  {
    id: "ouvir-batida-4",
    why: "Courage without luck and without an adult solving it.",
    request: {
      beat: 4,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: FACTS_MID,
      choiceMade: "Perguntar ao Farelo",
    },
  },
  {
    id: "ouvir-final",
    why: "The ending must close and return no choices at all.",
    request: {
      beat: 5,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: FACTS_MID,
      choiceMade: "Entregar em silêncio",
    },
  },
  {
    id: "ler-abertura",
    why: "The other reading level from cold. Twice the words, longer sentences.",
    request: {
      beat: 1,
      readingLevel: "ler",
      helperName: "Nina",
      facts: [],
      choiceMade: null,
    },
  },
  {
    id: "ler-batida-3",
    why: "`ler` mid-story: the level where labels may be morally ambiguous.",
    request: {
      beat: 3,
      readingLevel: "ler",
      helperName: "Nina",
      facts: FACTS_MID,
      choiceMade: "Seguir o barulho",
    },
  },
  {
    id: "ler-final",
    why: "`ler` ending. The word count and the empty choice list at once.",
    request: {
      beat: 5,
      readingLevel: "ler",
      helperName: "Nina",
      facts: FACTS_MID,
      choiceMade: "Entregar em silêncio",
    },
  },
  {
    id: "nome-com-acentos",
    why: "A name with accents and two words, read aloud by the narration later.",
    request: {
      beat: 1,
      readingLevel: "ouvir",
      helperName: "Antônio Gonçalves",
      facts: [],
      choiceMade: null,
    },
  },
  {
    id: "caminho-profundo",
    why: "Ten accumulated facts plus an awkward name: the long-path case, where coherence and word count are hardest to hold together.",
    request: {
      beat: 4,
      readingLevel: "ouvir",
      helperName: "Zzz",
      facts: FACTS_DEEP,
      choiceMade: "Levar o chinelo escondido",
    },
  },
];
