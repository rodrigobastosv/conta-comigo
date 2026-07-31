import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAudioHandler, type ProviderLookup } from "./audio-route.ts";
import type { ProviderName, ServerTtsProvider, Voice } from "./types.ts";

/**
 * Like the scene route, this one decides whether a request is allowed to cost
 * money — so every test counts synthesis calls. "Returned 400" is only half the
 * requirement; the other half is that nothing was synthesized.
 */

function spyProvider(behaviour: "ok" | "throws" = "ok") {
  const calls: { sentence: string; voice: Voice }[] = [];

  const provider: ServerTtsProvider = {
    name: "google",
    async synthesize(sentence, voice) {
      calls.push({ sentence, voice });
      if (behaviour === "throws") {
        throw new Error("google returned 403 for project bedtime-stories-42");
      }
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });
    },
  };

  const providers: ProviderLookup = () =>
    new Map<ProviderName, ServerTtsProvider>([["google", provider]]);

  return { providers, calls };
}

const NONE: ProviderLookup = () => new Map();

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/audio: rejecting before spending", () => {
  it("synthesizes one sentence in the voice that was asked for", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(
      post({ voiceId: "vitoria", text: "Boa noite, Nina." }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].sentence, "Boa noite, Nina.");
    assert.equal(spy.calls[0].voice.id, "vitoria");
  });

  // Nothing keeps this audio — not us, and not anything between us and the
  // browser. See docs/decisions.md#the-narration-is-not-stored-anywhere.
  it("forbids caching the clip anywhere on the way", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });
    const response = await handler(post({ voiceId: "vitoria", text: "Oi." }));

    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });

  it("rejects an unknown extra field, and synthesizes nothing", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(
      post({ voiceId: "vitoria", text: "Oi.", ssml: "<speak>" }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid-request" });
    assert.equal(spy.calls.length, 0, "must not synthesize");
  });

  it("rejects a body that is not JSON", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(post("nope"));

    assert.equal(response.status, 400);
    assert.equal(spy.calls.length, 0);
  });

  /**
   * The unit is one sentence. A client that asks for a scene would spend a
   * scene's worth of characters in one call and defeat the whole per-sentence
   * design — the child would wait for the lot before hearing anything.
   */
  it("refuses a whole scene, and synthesizes nothing", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(
      post({ voiceId: "vitoria", text: "a".repeat(401) }),
    );

    assert.equal(response.status, 400);
    assert.equal(spy.calls.length, 0);
  });

  it("rejects an id no voice has", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(
      post({ voiceId: "dona-vitoria", text: "Oi." }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "unknown-voice" });
    assert.equal(spy.calls.length, 0);
  });

  // The device voice never leaves the browser. A request for it here means the
  // client took the wrong branch, and answering would hide that.
  it("refuses the device voice instead of synthesizing it", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(
      post({ voiceId: "dispositivo", text: "Oi." }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "not-a-server-voice" });
    assert.equal(spy.calls.length, 0);
  });

  it("says the voice is unavailable when its key is gone", async () => {
    const handler = createAudioHandler({ providers: NONE });

    const response = await handler(post({ voiceId: "vitoria", text: "Oi." }));

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "voice-unavailable" });
  });
});

describe("POST /api/audio: the ceiling", () => {
  it("stops at the character budget, not at a call count", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({
      providers: spy.providers,
      charsPerWindow: 20,
    });

    const ok = await handler(
      post({ voiceId: "vitoria", text: "a".repeat(15) }),
    );
    const over = await handler(
      post({ voiceId: "vitoria", text: "b".repeat(10) }),
    );

    assert.equal(ok.status, 200);
    assert.equal(over.status, 429);
    assert.deepEqual(await over.json(), { error: "audio-limit" });
    assert.equal(spy.calls.length, 1, "the refused call must not synthesize");
  });

  it("counts per key, so one child cannot silence another", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({
      providers: spy.providers,
      charsPerWindow: 5,
    });

    await handler(
      post(
        { voiceId: "vitoria", text: "aaaaaa" },
        { "x-forwarded-for": "1.1.1.1" },
      ),
    );
    const other = await handler(
      post(
        { voiceId: "vitoria", text: "oi" },
        { "x-forwarded-for": "2.2.2.2" },
      ),
    );

    assert.equal(other.status, 200);
  });

  it("reopens once the window has passed", async () => {
    const spy = spyProvider();
    const handler = createAudioHandler({
      providers: spy.providers,
      charsPerWindow: 5,
      windowMs: 1,
    });

    await handler(post({ voiceId: "vitoria", text: "aaaaaa" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const after = await handler(post({ voiceId: "vitoria", text: "oi" }));

    assert.equal(after.status, 200);
  });
});

describe("POST /api/audio: when the provider fails", () => {
  /**
   * The client is a child's browser and the provider's message can name our
   * project and our quota. An error to the client is a code — never a stack and
   * never the provider's prose.
   */
  it("answers with a code, never the provider's message", async () => {
    const spy = spyProvider("throws");
    const handler = createAudioHandler({ providers: spy.providers });

    const response = await handler(post({ voiceId: "vitoria", text: "Oi." }));
    const body = await response.text();

    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(body), { error: "synthesis-failed" });
    assert.ok(!body.includes("bedtime-stories-42"), "leaked the project name");
    assert.ok(!body.includes("403"), "leaked the provider's status");
  });
});
