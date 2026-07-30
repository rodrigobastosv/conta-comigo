/**
 * Minimal SSE reader for the client. `EventSource` is no use here because it
 * cannot POST.
 */
export async function* readSSE(
  response: Response,
): AsyncGenerator<{ event: string; data: unknown }> {
  if (!response.body) throw new Error("response with no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);

      let event = "message";
      let raw = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) raw += line.slice(6);
      }

      if (raw) yield { event, data: JSON.parse(raw) };
    }
  }
}
