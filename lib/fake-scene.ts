// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import { invents } from "./prompts/v1.ts";
import { validateScene } from "./schema.ts";
import { bibleById } from "./story-bibles/index.ts";
import { Sentences } from "./stream-json.ts";
import { FINAL_BEAT, type Beat, type SceneRequest } from "./types.ts";
import type { GenerationEvent } from "./generate-scene.ts";

/**
 * A narrator made of canned prose, for developing without spending at the model.
 *
 * Everything downstream of the generator — the SSE stream, the sentence events,
 * the TTS queue, the write path, the choice buttons — needs a scene to exist
 * before it can be exercised, and asking the real model for one costs money and
 * ~8 seconds every time somebody moves a button three pixels to the left.
 *
 * It fakes the narrator, never the contract. The scene it returns goes through
 * `validateScene` exactly like the model's does, the text is streamed in chunks
 * through the same `Sentences` splitter, and an invented world is declared on
 * beat 1 and nowhere else. If the contract changes and this drifts, the fake
 * throws in development rather than passing something the real path would have
 * rejected.
 *
 * It is opt-in through FAKE_MODEL and it says so in the server log on every
 * call. A deployment that serves canned prose to a child without anyone noticing
 * is the one failure mode this file could have.
 */

/** Words the narrator uses when there is no world of its own to borrow from. */
const FAKE_REFRAIN = "Quem procura devagar encontra duas vezes.";

const FAKE_WORLD = {
  title: "O Caminho de Papel",
  refrain: FAKE_REFRAIN,
  invariants: [
    "Toda porta aqui já esteve em outro lugar antes.",
    "O que é escrito à mão nunca se apaga sozinho.",
    "Ninguém se assusta com o que é extraordinário: aqui isso é comum.",
  ],
};

type Draft = {
  /** ~90–140 words, the `ouvir` budget. */
  text: string;
  /** Appended in `ler` mode, where the budget is 180–260 words. */
  more: string;
  facts: string[];
  choices: { label: string; icon: string }[];
};

/**
 * Five beats of prose that fit any world, because the fake cannot know the one
 * it was asked for. Written to the constitution anyway — no villain, no moral at
 * the end, warmth — so that a screen full of fake scenes still looks like the
 * product and not like `lorem ipsum`.
 *
 * pt-BR for the same reason the real prompt is: this is text a child would hear,
 * and a developer checking the line breaks needs to see the real thing.
 */
const DRAFTS: Record<Beat, (name: string, refrain: string) => Draft> = {
  1: (name, refrain) => ({
    text: `A porta se abriu sozinha, do jeito que portas fazem quando estão esperando alguém. ${name} entrou devagar, contando os próprios passos. Lá dentro cheirava a papel guardado e a chuva de ontem. Uma lamparina acordou no teto e piscou duas vezes, como quem diz oi. Em cima do balcão havia um caderno aberto, e no caderno havia um desenho de ${name} feito muito antes de hoje. ${refrain} Uma voz pequena falou de trás de uma caixa alta: — Você demorou. ${name} riu, porque ninguém nunca tinha dito isso desse jeito.`,
    more: `A caixa balançou um pouquinho, do tamanho de quem está tentando não ser visto e não está conseguindo nada bem. No chão, uma trilha de migalhas ia do balcão até a parede e parava numa porta que não existia antes. ${name} olhou para o caderno, depois para a caixa, e sentiu aquela coceirinha boa de quando a história ainda não escolheu o caminho.`,
    facts: [
      "a lamparina do teto pisca duas vezes para cumprimentar",
      "existe um caderno com um desenho antigo de " + name,
    ],
    choices: [
      { label: "Abrir o caderno", icon: "📓" },
      { label: "Espiar atrás da caixa", icon: "📦" },
    ],
  }),

  2: (name, refrain) => ({
    text: `${name} fez o que tinha escolhido, e o lugar inteiro pareceu prestar atenção. A voz pequena era de um botão de casaco chamado Ninguém — ele mesmo tinha escolhido esse nome, porque assim toda vez que alguém perguntava "quem foi?", a resposta já era ele. Ninguém tinha caído de um casaco azul num dia de vento e nunca mais achou o caminho. — Faz três invernos — disse ele, sem tristeza, do jeito de quem já contou isso muitas vezes. ${refrain} ${name} guardou o botão na palma da mão, e a mão ficou quentinha.`,
    more: `O casaco azul, contou Ninguém, era de uma pessoa que assobiava errado de propósito para fazer os outros rirem. Ele lembrava do assobio melhor do que do rosto. Isso pareceu importante: um botão não guarda caras, guarda barulhos. ${name} tentou assobiar do jeito errado e conseguiu de primeira, o que deixou Ninguém tão animado que ele rolou de lado na palma da mão.`,
    facts: [
      "o botão de casaco se chama ninguém",
      "ninguém caiu de um casaco azul faz três invernos",
      "o dono do casaco assobia errado de propósito",
    ],
    choices: [
      { label: "Seguir o assobio", icon: "🎵" },
      { label: "Procurar o casaco azul", icon: "🧥" },
    ],
  }),

  3: (name, refrain) => ({
    text: `O caminho encolheu até virar um corredor de uma pessoa só, e no fim dele havia uma escada que subia para o lado. ${name} subiu do jeito que dá para subir uma escada assim: rindo e se segurando. Lá em cima, uma máquina antiga de costura estava emperrada, e ela estava emperrada porque tinha medo. — Se eu costurar de novo, alguém vai me guardar de novo — ela disse. Ninguém, o botão, ficou quietinho. ${refrain} ${name} entendeu que ali não faltava força, faltava conversa.`,
    more: `A máquina explicou, entre um chiado e outro, que a última coisa que costurou foi uma bainha às pressas, e que ninguém agradeceu, e que depois veio o pano por cima e o silêncio. Não era raiva. Era daquele cansaço que dá quando a gente faz uma coisa boa e ela passa batido. ${name} pensou um tempo, do tempo que se pensa quando ninguém está mandando ir mais rápido.`,
    facts: [
      "existe uma máquina de costura antiga no andar de cima",
      "a máquina está emperrada de medo, não de ferrugem",
    ],
    choices: [
      { label: "Contar uma história pra ela", icon: "🗣️" },
      { label: "Mostrar o botão pra ela", icon: "🔘" },
    ],
  }),

  4: (name, refrain) => ({
    text: `Foi ${name} que teve a ideia, e a ideia era pequena do tamanho certo. Em vez de pedir para a máquina costurar, ${name} pediu emprestada uma linha só — a mais fininha, a que ninguém sente falta. Depois amarrou o botão Ninguém na ponta e deixou a linha descer pela janela até a rua. — Assim ele não fica guardado — explicou ${name}. — Ele fica pendurado, que é diferente. A máquina fez um barulhinho que não era chiado. Era quase risada. ${refrain}`,
    more: `Lá embaixo, o vento pegou a linha e balançou o botão de um lado para o outro, e o botão brilhou toda vez que passava pela luz do poste. Não era um plano garantido. Era um plano bonito, que às vezes é o que faz alguém olhar para cima na hora certa. ${name} ficou na janela segurando a outra ponta, com o coração batendo daquele jeito de quando falta pouco.`,
    facts: [
      "a linha mais fina da máquina virou o fio do botão",
      "o botão fica pendurado na janela, brilhando quando o vento passa",
    ],
    choices: [
      { label: "Assobiar bem alto", icon: "😗" },
      { label: "Esperar em silêncio", icon: "🤫" },
    ],
  }),

  5: (name, refrain) => ({
    text: `Foi um assobio errado que subiu pela rua, e ${name} soube na hora. O casaco azul parou embaixo do poste e olhou para cima, e o botão Ninguém desceu pela linha girando devagar, como quem chega em casa sem pressa nenhuma. — Ah — disse a pessoa do casaco, só isso, do jeito que a gente fala quando a garganta fica cheia. A máquina costurou o botão de volta em três pontos, e não teve medo nenhum dessa vez. ${refrain} A lamparina piscou duas vezes e apagou, e a porta foi embora sem barulho, do jeito que ela tinha chegado.`,
    more: `${name} ficou um pouquinho ali, na calçada, com a linha fininha ainda enrolada no dedo. Do outro lado da rua alguém assobiava errado, e agora eram dois assobios errados na mesma noite, o que é raro. A máquina, lá em cima, deixou a luz da janela acesa mais um tempo — não para ninguém em especial, só porque estava com vontade.`,
    facts: [
      "o botão voltou pro casaco azul, costurado em três pontos",
      "a porta foi embora sem barulho quando a coisa voltou pro dono",
    ],
    choices: [],
  }),
};

export type FakeSceneOptions = {
  /** Stand-in for the model's own thinking time, before the first token. */
  firstTokenMs?: number;
  /** Delay between chunks of text. Zero makes the fake synchronous, for tests. */
  tickMs?: number;
  charsPerTick?: number;
};

const DEFAULTS = {
  // Roughly what the real model takes to start writing. Removing it would make
  // the loading state untestable, which is exactly the state most likely to be
  // wrong.
  firstTokenMs: 600,
  tickMs: 18,
  charsPerTick: 12,
};

/** Reads the switch at call time, so a test can set it and clear it. */
export function usingFakeModel(): boolean {
  const flag = process.env.FAKE_MODEL;
  return flag === "1" || flag === "true";
}

export function createFakeScene(options: FakeSceneOptions = {}) {
  const { firstTokenMs, tickMs, charsPerTick } = { ...DEFAULTS, ...options };

  return async function* fakeScene(
    request: SceneRequest,
  ): AsyncGenerator<GenerationEvent> {
    const bible = bibleById(request.bibleId);
    if (!bible) {
      yield { type: "error", message: "unknown-world" };
      return;
    }

    // Loud on purpose, once per scene. The only real danger of this file is a
    // deployment serving canned prose while everyone assumes it is the model.
    console.warn(
      `[fake-scene] FAKE_MODEL is on — beat ${request.beat} was not generated by the model`,
    );

    const declaresWorld = invents(request, bible);
    // The world in play: the bible's, the one this run already invented, or the
    // one this beat is about to declare.
    const refrain =
      request.world?.refrain ?? bible.refrain ?? FAKE_WORLD.refrain;

    const draft = DRAFTS[request.beat](request.helperName, refrain);
    const text =
      request.readingLevel === "ler"
        ? `${draft.text}\n\n${draft.more}`
        : draft.text;

    if (firstTokenMs > 0) await pause(firstTokenMs);

    const sentences = new Sentences();
    let sentenceIndex = 0;

    for (let at = 0; at < text.length; at += charsPerTick) {
      const delta = text.slice(at, at + charsPerTick);
      yield { type: "text", delta };
      for (const sentence of sentences.push(delta)) {
        yield { type: "sentence", index: sentenceIndex++, text: sentence };
      }
      if (tickMs > 0) await pause(tickMs);
    }

    for (const sentence of sentences.drain()) {
      yield { type: "sentence", index: sentenceIndex++, text: sentence };
    }

    // Through the real validator, not around it. A fake that can return a shape
    // the model's path would have rejected is worse than no fake.
    yield {
      type: "scene",
      scene: validateScene(
        {
          text,
          world: declaresWorld ? FAKE_WORLD : null,
          new_facts: draft.facts,
          choices: request.beat === FINAL_BEAT ? [] : draft.choices,
        },
        request.beat,
        declaresWorld,
      ),
    };
  };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
