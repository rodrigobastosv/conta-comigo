/**
 * Leitor de SSE mínimo para o cliente. `EventSource` não serve porque não faz POST.
 */
export async function* lerSSE(
  resposta: Response,
): AsyncGenerator<{ evento: string; dados: unknown }> {
  if (!resposta.body) throw new Error("resposta sem corpo");

  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;

    buffer += decodificador.decode(value, { stream: true });

    let corte: number;
    while ((corte = buffer.indexOf("\n\n")) >= 0) {
      const bloco = buffer.slice(0, corte);
      buffer = buffer.slice(corte + 2);

      let evento = "message";
      let bruto = "";
      for (const linha of bloco.split("\n")) {
        if (linha.startsWith("event: ")) evento = linha.slice(7);
        else if (linha.startsWith("data: ")) bruto += linha.slice(6);
      }

      if (bruto) yield { evento, dados: JSON.parse(bruto) };
    }
  }
}
