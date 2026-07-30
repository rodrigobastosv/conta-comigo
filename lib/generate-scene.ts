import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, EFFORT, MAX_TOKENS, MODEL } from "@/lib/anthropic";
import { CONSTITUTION, buildRequest, PROMPT_VERSION } from "@/lib/prompts/v1";
import { sceneSchema, validateScene } from "@/lib/schema";
import { LOST_THINGS_SHOP } from "@/lib/story-bibles/loja-de-coisas-perdidas";
import { FieldReader, Sentences } from "@/lib/stream-json";
import type { Scene, SceneRequest } from "@/lib/types";

export { PROMPT_VERSION };

export type GenerationEvent =
  /** New chunk of the scene text, already decoded. For typing onto the screen. */
  | { type: "text"; delta: string }
  /** Complete sentence. This is the TTS hook: generate this sentence's audio and enqueue it. */
  | { type: "sentence"; index: number; text: string }
  /** The whole scene, validated. Only arrives at the end. */
  | { type: "scene"; scene: Scene }
  | { type: "error"; message: string };

/**
 * Generates a scene and emits events as the model writes.
 *
 * Cache: the constitution and the bible go in stable `system` blocks, with the
 * cache_control on the last one — the prefix is identical on every call of the
 * story. Everything that varies (beat, level, facts, choice made) goes in the
 * user message, AFTER the breakpoint, so it does not invalidate the cache.
 */
export async function* generateScene(
  request: SceneRequest,
): AsyncGenerator<GenerationEvent> {
  const bible = LOST_THINGS_SHOP;
  const reader = new FieldReader("text");
  const sentences = new Sentences();
  let sentenceIndex = 0;

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: {
        effort: EFFORT,
        format: zodOutputFormat(sceneSchema),
      },
      system: [
        { type: "text", text: CONSTITUTION },
        {
          type: "text",
          text: bible.text,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildRequest(request, bible.beats[request.beat]),
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type !== "content_block_delta" ||
        event.delta.type !== "text_delta"
      ) {
        continue;
      }

      const fresh = reader.push(event.delta.text);
      if (!fresh) continue;

      yield { type: "text", delta: fresh };
      for (const sentence of sentences.push(fresh)) {
        yield { type: "sentence", index: sentenceIndex++, text: sentence };
      }
    }

    for (const sentence of sentences.drain()) {
      yield { type: "sentence", index: sentenceIndex++, text: sentence };
    }

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      yield { type: "error", message: "model-refusal" };
      return;
    }
    if (message.stop_reason === "max_tokens") {
      yield { type: "error", message: "scene-truncated" };
      return;
    }

    const raw = message.content.find((b) => b.type === "text")?.text;
    if (!raw) {
      yield { type: "error", message: "empty-response" };
      return;
    }

    yield {
      type: "scene",
      scene: validateScene(JSON.parse(raw), request.beat),
    };
  } catch (error) {
    // The detail stays in the server log; the client only gets a code.
    console.error("[generateScene]", error);
    yield { type: "error", message: "generation-failed" };
  }
}
