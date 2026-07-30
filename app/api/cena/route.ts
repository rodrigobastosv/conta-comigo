import { z } from "zod";
import { gerarCena } from "@/lib/gerar-cena";
import { BATIDA_FINAL } from "@/lib/tipos";

export const runtime = "nodejs";
export const maxDuration = 60;

const corpoSchema = z.strictObject({
  batida: z.number().int().min(1).max(BATIDA_FINAL),
  nivelLeitura: z.enum(["ouvir", "ler"]),
  nomeAjudante: z.string().min(1).max(40),
  fatos: z.array(z.string().min(1)).max(60),
  escolhaFeita: z.string().min(1).max(120).nullable(),
});

/**
 * Teto de gerações por sessão. Aplicado no servidor, nunca no front — o front é
 * inspecionável por qualquer criança de 8 anos com o dedo curioso.
 * TODO: mover para Redis/Supabase quando houver mais de uma instância.
 */
const TETO_POR_JANELA = 60;
const JANELA_MS = 60 * 60 * 1000;
const contador = new Map<string, { total: number; expiraEm: number }>();

function excedeuTeto(chave: string): boolean {
  const agora = Date.now();
  const atual = contador.get(chave);

  if (!atual || atual.expiraEm < agora) {
    contador.set(chave, { total: 1, expiraEm: agora + JANELA_MS });
    return false;
  }

  atual.total += 1;
  return atual.total > TETO_POR_JANELA;
}

export async function POST(req: Request) {
  const chave = req.headers.get("x-forwarded-for") ?? "local";
  if (excedeuTeto(chave)) {
    return Response.json({ erro: "teto-de-geracoes" }, { status: 429 });
  }

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return Response.json({ erro: "pedido-invalido" }, { status: 400 });
  }

  const codificador = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const evento of gerarCena({
          ...corpo.data,
          batida: corpo.data.batida as 1 | 2 | 3 | 4 | 5,
        })) {
          const { tipo, ...dados } = evento;
          controller.enqueue(
            codificador.encode(
              `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`,
            ),
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
