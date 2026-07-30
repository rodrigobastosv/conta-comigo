import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, EFFORT, MAX_TOKENS, MODELO } from "@/lib/anthropic";
import { CONSTITUICAO, montarPedido, PROMPT_VERSAO } from "@/lib/prompts/v1";
import { cenaSchema, validarCena } from "@/lib/schema";
import { LOJA_DE_COISAS_PERDIDAS } from "@/lib/story-bibles/loja-de-coisas-perdidas";
import { Frases, LeitorDeCampo } from "@/lib/stream-json";
import type { Cena, PedidoDeCena } from "@/lib/tipos";

export { PROMPT_VERSAO };

export type EventoDeGeracao =
  /** Pedaço novo do texto da cena, já decodificado. Para digitar na tela. */
  | { tipo: "texto"; delta: string }
  /** Frase completa. É o gancho do TTS: gere o áudio desta frase e enfileire. */
  | { tipo: "frase"; indice: number; texto: string }
  /** Cena inteira, validada. Só chega no fim. */
  | { tipo: "cena"; cena: Cena }
  | { tipo: "erro"; mensagem: string };

/**
 * Gera uma cena e vai emitindo eventos conforme o modelo escreve.
 *
 * Cache: a constituição e a bíblia vão em blocos de `system` estáveis, com o
 * cache_control no último — o prefixo é idêntico em toda chamada da história.
 * Tudo que varia (batida, nível, fatos, escolha feita) fica na mensagem do
 * usuário, DEPOIS do breakpoint, para não invalidar o cache.
 */
export async function* gerarCena(
  pedido: PedidoDeCena,
): AsyncGenerator<EventoDeGeracao> {
  const biblia = LOJA_DE_COISAS_PERDIDAS;
  const leitor = new LeitorDeCampo("texto");
  const frases = new Frases();
  let indiceDeFrase = 0;

  try {
    const stream = anthropic.messages.stream({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      output_config: {
        effort: EFFORT,
        format: zodOutputFormat(cenaSchema),
      },
      system: [
        { type: "text", text: CONSTITUICAO },
        {
          type: "text",
          text: biblia.texto,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: montarPedido(pedido, biblia.batidas[pedido.batida]),
        },
      ],
    });

    for await (const evento of stream) {
      if (
        evento.type !== "content_block_delta" ||
        evento.delta.type !== "text_delta"
      ) {
        continue;
      }

      const novo = leitor.empurrar(evento.delta.text);
      if (!novo) continue;

      yield { tipo: "texto", delta: novo };
      for (const frase of frases.empurrar(novo)) {
        yield { tipo: "frase", indice: indiceDeFrase++, texto: frase };
      }
    }

    for (const frase of frases.drenar()) {
      yield { tipo: "frase", indice: indiceDeFrase++, texto: frase };
    }

    const mensagem = await stream.finalMessage();

    if (mensagem.stop_reason === "refusal") {
      yield { tipo: "erro", mensagem: "recusa-do-modelo" };
      return;
    }
    if (mensagem.stop_reason === "max_tokens") {
      yield { tipo: "erro", mensagem: "cena-truncada" };
      return;
    }

    const bruto = mensagem.content.find((b) => b.type === "text")?.text;
    if (!bruto) {
      yield { tipo: "erro", mensagem: "resposta-vazia" };
      return;
    }

    yield { tipo: "cena", cena: validarCena(JSON.parse(bruto), pedido.batida) };
  } catch (erro) {
    // Detalhe fica no log do servidor; para o cliente vai só um código.
    console.error("[gerarCena]", erro);
    yield { tipo: "erro", mensagem: "falha-na-geracao" };
  }
}
