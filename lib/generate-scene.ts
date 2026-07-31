import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, EFFORT, MAX_TOKENS, MODEL } from "./anthropic.ts";
import { costOfScene, inCents } from "./cost.ts";
import {
  CONSTITUTION,
  buildRequest,
  invents,
  PROMPT_VERSION,
} from "./prompts/v1.ts";
import { sceneSchema, validateScene } from "./schema.ts";
import { bibleById } from "./story-bibles/index.ts";
import { FieldReader, Sentences } from "./stream-json.ts";
import type { Scene, SceneRequest } from "./types.ts";

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
 *
 * An invented world does not change that. What is cached is the charter — the
 * shape a world must have, which is the same for every child — while the world
 * itself is volatile and travels in the user message with the facts.
 */
export async function* generateScene(
  request: SceneRequest,
): AsyncGenerator<GenerationEvent> {
  const bible = bibleById(request.bibleId);
  if (!bible) {
    // Only reachable if the route's whitelist and the registry disagree, which
    // is a bug — but generating a story in no world at all is worse.
    console.error("[generateScene] unknown bible", request.bibleId);
    yield { type: "error", message: "unknown-world" };
    return;
  }

  const reader = new FieldReader("text");
  const sentences = new Sentences();
  let sentenceIndex = 0;

  try {
    const stream = anthropic().messages.stream({
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
      messages: [{ role: "user", content: buildRequest(request, bible) }],
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

    /**
     * What this beat cost, in the server log.
     *
     * One line per scene rather than a stored column: the unit anybody argues
     * in is the story, and five of these lines are a story. `cacheRead` is the
     * number to watch — if it is zero on beats 2–5, the cached prefix has been
     * invalidated and the story costs several times what it should.
     */
    const cost = costOfScene(message.usage);
    console.log(
      `[cost] beat ${request.beat} ${inCents(cost.usd)} ` +
        `(in ${cost.inputTokens}, out ${cost.outputTokens}, ` +
        `cacheWrite ${cost.cacheWriteTokens}, cacheRead ${cost.cacheReadTokens})`,
    );

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
      scene: validateScene(
        JSON.parse(raw),
        request.beat,
        invents(request, bible),
      ),
    };
  } catch (error) {
    // The detail stays in the server log; the client only gets a code.
    console.error("[generateScene]", error);
    yield { type: "error", message: "generation-failed" };
  }
}
