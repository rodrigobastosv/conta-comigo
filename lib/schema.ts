import { z } from "zod";
import { BATIDA_FINAL, type Batida, type Cena } from "@/lib/tipos";

/**
 * Contrato de saída do modelo. Nunca confie no JSON que volta: ele vai devolver
 * 3 escolhas quando você pediu 2, e o certo é falhar e regerar — não quebrar a tela.
 *
 * A ordem dos campos aqui importa: "texto" vem primeiro porque a rota extrai esse
 * campo do JSON parcial enquanto ele ainda está chegando (ver lib/stream-json.ts).
 */
export const escolhaSchema = z.strictObject({
  rotulo: z.string().min(1).max(80),
  icone: z.string().min(1).max(8),
});

export const cenaSchema = z.strictObject({
  texto: z.string().min(1),
  fatos_novos: z.array(z.string().min(1)).max(6),
  escolhas: z.array(escolhaSchema).max(2),
});

export type CenaBruta = z.infer<typeof cenaSchema>;

export class CenaInvalidaError extends Error {
  constructor(readonly motivo: string) {
    super(`cena inválida: ${motivo}`);
    this.name = "CenaInvalidaError";
  }
}

/**
 * Valida a cena contra o schema E contra a regra que o schema não expressa:
 * a batida final não oferece escolhas, e toda outra batida oferece exatamente duas.
 * É esse `escolhas: []` que sinaliza fim de história para a UI.
 */
export function validarCena(bruta: unknown, batida: Batida): Cena {
  const analisada = cenaSchema.safeParse(bruta);
  if (!analisada.success) {
    throw new CenaInvalidaError(analisada.error.issues[0]?.message ?? "formato");
  }

  const esperado = batida === BATIDA_FINAL ? 0 : 2;
  if (analisada.data.escolhas.length !== esperado) {
    throw new CenaInvalidaError(
      `batida ${batida} exige ${esperado} escolhas, veio ${analisada.data.escolhas.length}`,
    );
  }

  return analisada.data;
}
