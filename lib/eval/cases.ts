import {
  LOST_THINGS_SHOP,
  ORIGINAL_WORLD,
  SELF_BUILDING_CIRCUS,
} from "../story-bibles/index.ts";
import type { SceneRequest, World } from "../types.ts";

/**
 * The fixed openings.
 *
 * Fixed is the whole point: the numbers are only comparable across prompt
 * versions if the inputs never move. Do not edit a case to make a run pass —
 * add a case, or change the prompt.
 *
 * Between them they cover both worlds, both reading levels, the first and last
 * beat, a name with accents, a name that is awkward to narrate, an empty fact
 * list and a deep one.
 */
export type EvalCase = {
  id: string;
  why: string;
  request: SceneRequest;
};

const SHOP = LOST_THINGS_SHOP.id;
const ORIGINAL = ORIGINAL_WORLD.id;
const CIRCUS = SELF_BUILDING_CIRCUS.id;

const FACTS_CIRCUS = [
  "o que falta é a manivela do realejo",
  "o realejo é do seu ludo desde antes do circo",
  "pipoca cantarolou mais forte perto do muro dos fundos",
];

/**
 * A world written by hand to look like one the model would have invented.
 *
 * The mid-story cases of an invented run need a world that never moves, for the
 * same reason the facts never move: a case whose input is generated is not a
 * fixed case. It deliberately does not resemble the shop.
 */
const INVENTED_WORLD: World = {
  title: "O Guarda-Chuva que Não Queria Fechar",
  refrain: "Quem espera na chuva não espera sozinho.",
  invariants: [
    "o guarda-chuva vermelho só fecha quando para de chover",
    "seu Aldo conserta coisas na calçada e nunca entra em casa antes das seis",
    "o pardal do poste bate a asa uma vez quando alguém esquece alguma coisa",
    "ninguém nesta rua acha estranho um guarda-chuva teimoso",
  ],
};

const FACTS_INVENTED = [
  "o guarda-chuva vermelho é do seu aldo",
  "a alça do guarda-chuva tem um barbante amarrado",
  "choveu a tarde inteira na terça",
];

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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
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
      bibleId: SHOP,
      beat: 4,
      readingLevel: "ouvir",
      helperName: "Zzz",
      facts: FACTS_DEEP,
      choiceMade: "Levar o chinelo escondido",
    },
  },

  // The invented world. The two openings are where it can fail in the way that
  // matters — a world that is never declared, or one assembled out of dragons —
  // and the mid and final beats are where it can fail quietly, by forgetting the
  // world it invented two scenes ago.
  {
    id: "original-abertura",
    why: "Beat 1 has to invent a world, declare it, and still open simply. The case this whole feature stands on.",
    request: {
      bibleId: ORIGINAL,
      beat: 1,
      readingLevel: "ouvir",
      helperName: "Nina",
      seed: "uma coisa pequena sumiu, e ninguém viu quando",
      facts: [],
      choiceMade: null,
    },
  },
  {
    id: "original-abertura-sem-semente",
    why: "The same, with nothing to start from: this is where the model reaches for a cliché.",
    request: {
      bibleId: ORIGINAL,
      beat: 1,
      readingLevel: "ler",
      helperName: "Nina",
      seed: null,
      facts: [],
      choiceMade: null,
    },
  },
  {
    id: "original-batida-3",
    why: "Mid-story in a world the model did not write: the invariants have to hold as hard as a hand-written bible's.",
    request: {
      bibleId: ORIGINAL,
      beat: 3,
      readingLevel: "ouvir",
      helperName: "Nina",
      world: INVENTED_WORLD,
      facts: FACTS_INVENTED,
      choiceMade: "Seguir o barbante",
    },
  },
  {
    id: "original-final",
    why: "An invented world still has to close, speak its own refrain, and return no choices.",
    request: {
      bibleId: ORIGINAL,
      beat: 5,
      readingLevel: "ouvir",
      helperName: "Nina",
      world: INVENTED_WORLD,
      facts: FACTS_INVENTED,
      choiceMade: "Devolver na calçada",
    },
  },

  /**
   * The second hand-written world. Its reason for existing is the clock — the
   * shop has none — so the cases that matter are the ones where a deadline is a
   * temptation to raise the stakes past what the constitution allows.
   */
  {
    id: "circo-abertura",
    why: "A world whose engine is a deadline. The opening must be warm, not urgent.",
    request: {
      bibleId: CIRCUS,
      beat: 1,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: [],
      choiceMade: null,
    },
  },
  {
    id: "circo-complicacao",
    why: "The beat where 'it does not fit' is easiest to turn into 'it is going to go wrong'.",
    request: {
      bibleId: CIRCUS,
      beat: 3,
      readingLevel: "ouvir",
      helperName: "Nina",
      facts: FACTS_CIRCUS,
      choiceMade: "Subir no muro",
    },
  },
  {
    id: "circo-final-ler",
    why: "The ending, at the older reading level: dawn arrives and the circus opens either way.",
    request: {
      bibleId: CIRCUS,
      beat: 5,
      readingLevel: "ler",
      helperName: "Nina",
      facts: FACTS_CIRCUS,
      choiceMade: "Deixar a manivela no lugar certo",
    },
  },
];
