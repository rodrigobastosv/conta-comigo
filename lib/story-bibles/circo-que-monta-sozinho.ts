import type { StoryBible } from "../types.ts";

/**
 * The second hand-written world, and the one that proves the seam.
 *
 * It is built to be the shop's opposite where it matters. The shop has no clock
 * and its engine is a question — whose is this, and how did it get lost? Here
 * the answer is never in doubt and the engine is the light coming: something is
 * missing and the circus opens at dawn either way. That is the one tension the
 * constitution allows, "will there be enough time?", and this is the world that
 * uses it.
 *
 * Seu Ludo is deliberately not Dona Vitória. She knows everything and says
 * little; he knows almost nothing and says all of it. A second wise elder would
 * have made this a re-skin.
 */
export const SELF_BUILDING_CIRCUS: StoryBible = {
  id: "circo-que-monta-sozinho",
  title: "O Circo que Monta Sozinho",
  refrain: "Circo nenhum abre sozinho.",
  invented: false,

  text: `HISTÓRIA: O Circo que Monta Sozinho

MUNDO
Tem um circo que chega de madrugada num terreno vazio e se monta sozinho. As
cordas se amarram, a lona sobe andando, as lâmpadas se penduram uma a uma. Mas
ele nunca termina sozinho: sempre falta exatamente uma coisa, e essa coisa só
pode ser encontrada por alguém que não é do circo. O circo abre na primeira luz
do dia — sempre abre, com a coisa ou sem ela, e é por isso que a pressa é
gostosa e não é medo. Ninguém no bairro acha nada disso estranho.

PERSONAGENS FIXOS
- Seu Ludo — o dono do circo. Alto, magro, casaco com uma manga mais curta que a
  outra. Animado, esquecido e falante. NÃO é sábio: ele nunca sabe onde a coisa
  está, só sabe que está faltando. Pergunta muito mais do que responde, e as
  perguntas dele são de verdade — ele quer mesmo saber. Chama a criança de
  "sócio".
- Pipoca — um lampião de papel que flutua na altura do ombro e cantarola. Não
  fala. Cantarola mais forte quanto mais perto está do que falta, e fica em
  silêncio quando alguém tem uma ideia boa. É o alívio cômico e é a dica.
- O sócio — a criança. O nome é dado por ela. Nunca descreva sua aparência,
  nunca declare sua idade, nunca declare seu gênero: use sempre o nome ou "você".

REFRÃO
"Circo nenhum abre sozinho."
Aparece na voz do Seu Ludo ou como fecho da cena.

INVARIANTES (nunca contradiga)
- O circo se monta sozinho, mas nunca termina sozinho: sempre falta uma coisa.
- Seu Ludo nunca sabe onde a coisa está. Só sabe que falta.
- Pipoca cantarola mais forte quanto mais perto, e nunca fala.
- O circo abre na primeira luz do dia. Sempre abre.
- Nada aqui é comprado nem vendido. A entrada se paga ajudando.
- Não tem animal preso, nem número perigoso, nem ninguém no alto sem rede.`,

  beats: {
    1: "CONVITE. O circo já está quase pronto e falta uma coisa. Seu Ludo diz o que falta, não onde está. Termine com 2 escolhas de POR ONDE COMEÇAR.",
    2: "DESCOBERTA. Revele de quem é aquilo e por que aquela coisa importa pra alguém do circo. Termine com 2 escolhas de MÉTODO.",
    3: "COMPLICAÇÃO. A coisa aparece e não serve — é grande demais, pequena demais, ou está do avesso. Um problema teimoso, nunca um perigo. Termine com 2 escolhas de RISCO.",
    4: "CORAGEM. O sócio inventa um jeito com o que tem na mão, ideia dele mesmo, sem sorte e sem adulto resolvendo. Termine com 2 escolhas de COMO TERMINAR.",
    5: "ACONCHEGO. A primeira luz chega e o circo abre. Sem escolhas.",
  },
};
