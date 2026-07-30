import type { StoryBible } from "../types.ts";

/**
 * Layer 2 for a story nobody has written: not a world, but the shape a world has
 * to have for the constitution to keep holding when the model invents it.
 *
 * The prose stays in pt-BR for the same reason the constitution does — it is
 * what the model reads to write what a Brazilian child hears. Source of truth in
 * prose: docs/story-bible.md, layer 2b.
 *
 * This block is identical for every child and every run, so it sits in the
 * cached `system` exactly where a fixed world's text sits. What varies — the
 * seed, and the world once it exists — goes in the user message.
 */
const WORLD_CHARTER = `COMO NASCE O MUNDO DESTA HISTÓRIA

Ninguém escreveu este mundo. Você inventa ele na batida 1, enquanto escreve a
cena, e declara ele depois em "world". Nas batidas seguintes o mundo já existe:
ele chega junto com os fatos, "world" é null, e você constrói em cima.

O QUE TODO MUNDO PRECISA TER
- UMA FALTA CONCRETA. Alguma coisa se perdeu, quebrou, foi esquecida, saiu do
  lugar ou parou de funcionar. Pequena o bastante pra caber numa mão. Não é uma
  missão, não é salvar ninguém, não é um mistério com culpado.
- UM LUGAR QUE A CRIANÇA CONSEGUE VER. Um cômodo, uma esquina, um quintal, um
  veículo, uma feira. UM LUGAR SÓ. Nada de reino, império ou mundo paralelo.
- UM MENTOR QUE NÃO RESOLVE. Alguém — ou alguma coisa — que sabe mais e conta
  menos. Fala pouco, em frases curtas, e nunca faz pela criança o que a criança
  pode fazer. Existe pra dar a pista, nunca a solução.
- UM ALÍVIO CÔMICO SEM FALA. Um bicho, um objeto teimoso, um barulho que volta.
  Não conversa: reage. É ele que entrega a dica sem dizer nada.
- UM REFRÃO. Uma frase de 5 a 9 palavras, fácil de decorar e de falar junto. É o
  que a criança leva depois que a história acaba.
- DE 3 A 5 INVARIANTES. As regras que este mundo nunca quebra, uma frase curta
  cada. São elas que impedem a batida 4 de contradizer a batida 1.

O QUE NENHUM MUNDO PODE TER
Não é censura, é anti-clichê: tudo abaixo é o que se escreve por reflexo, e um
reflexo é o oposto de uma história que a criança nunca ouviu.
- Escola de magia, profecia, "o escolhido", varinha, poção que resolve sozinha.
- Dragão, fada, unicórnio, duende, bruxa, elfo.
- Reino, castelo, princesa, cavaleiro, trono.
- Robô que aprende a sentir, alienígena amigo, nave espacial.
- Ilha flutuante, raposinha sábia, coruja sábia, chave dourada, portal brilhante.
- A criança nunca tem poder nenhum e nunca é a escolhida. Ela resolve porque
  PRESTOU ATENÇÃO — é a única habilidade que esta história premia.
Se a primeira ideia veio fácil, troque. Essa regra vale mais que a lista.

O COMEÇO É SIMPLES
A batida 1 abre com UMA coisa acontecendo, num lugar, com uma pessoa. Não
apresente o mundo antes da história começar: o mundo aparece enquanto ela
acontece. Toda regra que você inventou e não couber naturalmente na cena vai pros
invariantes, não pro texto. O começo cabe numa frase — o que ele vira depois são
as escolhas da criança.`;

/**
 * The seeds a child can tap before the first scene.
 *
 * A closed list, resolved on the server: the child sends an id, never prose. It
 * is the cheapest possible answer to free text from a child going into a prompt,
 * and it costs less than it looks — the seed is only the first sentence, and the
 * choices are what actually grow the story.
 *
 * `label` is what the child reads; `prompt` is what the model reads. They differ
 * because the child is choosing a picture and the model is being given room.
 */
export type Seed = {
  id: string;
  icon: string;
  label: string;
  prompt: string;
};

export const SEEDS: Seed[] = [
  {
    id: "sumiu",
    icon: "🧦",
    label: "Uma coisa sumiu",
    prompt: "uma coisa pequena sumiu, e ninguém viu quando",
  },
  {
    id: "porta",
    icon: "🚪",
    label: "Uma porta nova",
    prompt: "apareceu uma porta que não estava ali ontem",
  },
  {
    id: "bicho",
    icon: "🐦",
    label: "Um bicho pedindo ajuda",
    prompt: "um bicho está tentando pedir ajuda e ninguém entende",
  },
  {
    id: "barulho",
    icon: "🔔",
    label: "Um barulho estranho",
    prompt:
      "tem um barulho que só acontece a essa hora, e sempre no mesmo lugar",
  },
  {
    id: "quebrou",
    icon: "🫖",
    label: "Uma coisa quebrou",
    prompt: "uma coisa de que alguém gostava muito quebrou hoje de manhã",
  },
];

export function seedById(id: string): Seed | undefined {
  return SEEDS.find((seed) => seed.id === id);
}

export const ORIGINAL_WORLD: StoryBible = {
  id: "original",
  // A promise, not a title. `scene.world.title` replaces it on beat 1.
  title: "Uma história nova",
  refrain: null,
  invented: true,
  text: WORLD_CHARTER,

  beats: {
    1: 'CONVITE. Invente o mundo e abra com uma coisa só acontecendo. A falta se apresenta. Não explique o mundo. Termine com 2 escolhas de RUMO, e preencha "world".',
    2: "DESCOBERTA. Revele de quem é a falta e por que aquilo doeu. Termine com 2 escolhas de MÉTODO.",
    3: "COMPLICAÇÃO. O plano encosta num obstáculo — um mal-entendido, nunca um perigo. Termine com 2 escolhas de RISCO.",
    4: "CORAGEM. O ajudante resolve com uma ideia própria, não com sorte nem com ajuda de adulto. Termine com 2 escolhas de COMO TERMINAR.",
    5: "ACONCHEGO. A falta é reparada. O lugar começa a ir embora. Sem escolhas.",
  },
};
