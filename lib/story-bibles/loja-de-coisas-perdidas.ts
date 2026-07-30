import type { Beat } from "../types.ts";

/**
 * The filename mirrors `id`, which is what goes into `stories.bible_id`. Keep it
 * that way: an archived story records the id, and finding the world it was
 * generated in should not require a lookup table. That is also why the id stays
 * in Portuguese while the code around it is English.
 */
export type StoryBible = {
  id: string;
  title: string;
  refrain: string;
  /** Layer 2: rendered into the system prompt, in full, on every call. */
  text: string;
  /** Instruction per beat. Passed into the prompt as a parameter. */
  beats: Record<Beat, string>;
};

export const LOST_THINGS_SHOP: StoryBible = {
  id: "loja-de-coisas-perdidas",
  title: "A Loja de Coisas Perdidas",
  refrain: "Toda coisa perdida quer voltar pra casa.",

  text: `HISTÓRIA: A Loja de Coisas Perdidas

MUNDO
Existe uma loja que só aparece onde alguém perdeu algo importante. Ela chega de
noite, sem barulho, e vai embora quando a coisa volta pro dono. Dentro dela, tudo
que já se perdeu no mundo está guardado em gavetas — e as gavetas são muitas mais
do que caberiam na loja. Os objetos falam baixinho sobre quem os perdeu. Ninguém
acha isso estranho.

PERSONAGENS FIXOS
- Dona Vitória — a lojista. Idosa, baixinha, óculos na ponta do nariz, avental com
  bolsos infinitos. Sabe tudo, conta pouco, e NUNCA resolve o problema no lugar da
  criança. Fala em frases curtas. Chama a criança de "ajudante".
- Farelo — um cachorro de pelo cor de pão que dorme em cima do balcão e late uma
  vez quando alguém mente. Não fala. É o alívio cômico e a dica.
- O ajudante — a criança. O nome é dado por ela. Nunca descreva sua aparência,
  nunca declare sua idade, nunca declare seu gênero: use sempre o nome ou "você".

REFRÃO
"Toda coisa perdida quer voltar pra casa."
Aparece na voz da Dona Vitória ou como fecho da cena.

INVARIANTES (nunca contradiga)
- A loja nunca é encontrada de propósito — ela aparece.
- Dona Vitória nunca sai da loja.
- Farelo late uma vez, e só quando alguém mente.
- O objeto sempre volta pro dono no fim. Sempre.
- Nada dentro da loja é comprado ou vendido. Não existe dinheiro aqui.`,

  beats: {
    1: "CONVITE. A loja aparece. O objeto perdido se apresenta. Termine com 2 escolhas de RUMO.",
    2: "DESCOBERTA. Revele quem é o dono e por que perder aquilo doeu. Termine com 2 escolhas de MÉTODO.",
    3: "COMPLICAÇÃO. O plano encosta num obstáculo — um mal-entendido, nunca um perigo. Termine com 2 escolhas de RISCO.",
    4: "CORAGEM. O ajudante resolve com uma ideia própria, não com sorte nem com ajuda de adulto. Termine com 2 escolhas de COMO ENTREGAR.",
    5: "ACONCHEGO. O objeto volta pro dono. A loja começa a ir embora. Sem escolhas.",
  },
};
