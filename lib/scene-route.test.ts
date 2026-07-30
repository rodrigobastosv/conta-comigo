import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSceneHandler,
  type GenerationEventLike,
  type SceneGenerator,
} from "./scene-route.ts";

/**
 * The route is the other guard: it decides whether a request is allowed to cost
 * money. Every test here counts generator calls, because "returned 400" is only
 * half the requirement — the other half is that nothing was generated.
 */

function spyGenerator(events: GenerationEventLike[] = []) {
  const calls: unknown[] = [];
  const generate: SceneGenerator = async function* (request) {
    calls.push(request);
    for (const event of events) yield event;
  };
  return { generate, calls };
}

const VALID = {
  beat: 1,
  readingLevel: "ouvir",
  helperName: "Nina",
  facts: [],
  choiceMade: null,
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/scene: rejecting before spending", () => {
  it("rejects an unknown extra field, and generates nothing", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({ generate: spy.generate });

    const response = await handler(post({ ...VALID, extra: 1 }));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid-request" });
    assert.equal(spy.calls.length, 0, "must not generate");
  });

  it("rejects malformed JSON with a 400, not a 500", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({ generate: spy.generate });

    const response = await handler(post("not json at all"));

    assert.equal(response.status, 400);
    assert.equal(spy.calls.length, 0);
  });

  for (const [label, body] of [
    ["beat 0", { ...VALID, beat: 0 }],
    ["beat 6", { ...VALID, beat: 6 }],
    ["beat as a string", { ...VALID, beat: "2" }],
    ["fractional beat", { ...VALID, beat: 1.5 }],
    [
      "missing beat",
      { readingLevel: "ouvir", helperName: "N", facts: [], choiceMade: null },
    ],
    ["unknown reading level", { ...VALID, readingLevel: "cantar" }],
    ["empty helper name", { ...VALID, helperName: "" }],
    ["helper name over 40 chars", { ...VALID, helperName: "n".repeat(41) }],
    ["facts not an array", { ...VALID, facts: "um fato" }],
    ["more than 60 facts", { ...VALID, facts: Array(61).fill("f") }],
    ["empty choice string", { ...VALID, choiceMade: "" }],
  ] as const) {
    it(`rejects ${label}`, async () => {
      const spy = spyGenerator();
      const handler = createSceneHandler({ generate: spy.generate });

      const response = await handler(post(body));

      assert.equal(response.status, 400, `${label} should be a 400`);
      assert.equal(spy.calls.length, 0, `${label} must not generate`);
    });
  }

  it("accepts the final beat and a choice that led to it", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({ generate: spy.generate });

    const response = await handler(
      post({ ...VALID, beat: 5, choiceMade: "Abrir a gaveta" }),
    );

    assert.equal(response.status, 200);
    assert.equal(spy.calls.length, 1);
  });
});

describe("POST /api/scene: the generation ceiling", () => {
  it("returns 429 past the limit, without generating", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({
      generate: spy.generate,
      limitPerWindow: 2,
    });
    const headers = { "x-forwarded-for": "1.2.3.4" };

    assert.equal((await handler(post(VALID, headers))).status, 200);
    assert.equal((await handler(post(VALID, headers))).status, 200);

    const third = await handler(post(VALID, headers));
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), { error: "generation-limit" });
    assert.equal(spy.calls.length, 2, "the refused call must not generate");
  });

  it("counts each caller separately", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({
      generate: spy.generate,
      limitPerWindow: 1,
    });

    assert.equal(
      (await handler(post(VALID, { "x-forwarded-for": "1.1.1.1" }))).status,
      200,
    );
    assert.equal(
      (await handler(post(VALID, { "x-forwarded-for": "2.2.2.2" }))).status,
      200,
    );
    assert.equal(
      (await handler(post(VALID, { "x-forwarded-for": "1.1.1.1" }))).status,
      429,
    );
  });

  it("lets the window expire", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({
      generate: spy.generate,
      limitPerWindow: 1,
      windowMs: 1,
    });
    const headers = { "x-forwarded-for": "9.9.9.9" };

    assert.equal((await handler(post(VALID, headers))).status, 200);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal((await handler(post(VALID, headers))).status, 200);
  });

  // The ceiling is checked before the body is parsed: a caller must not be able
  // to buy extra attempts by sending rubbish.
  it("counts an invalid request against the ceiling too", async () => {
    const spy = spyGenerator();
    const handler = createSceneHandler({
      generate: spy.generate,
      limitPerWindow: 1,
    });
    const headers = { "x-forwarded-for": "5.5.5.5" };

    assert.equal((await handler(post("junk", headers))).status, 400);
    assert.equal((await handler(post(VALID, headers))).status, 429);
  });
});

describe("POST /api/scene: the SSE it writes", () => {
  const events: GenerationEventLike[] = [
    { type: "text", delta: "A loja " },
    { type: "sentence", index: 0, text: "A loja apareceu." },
    { type: "scene", scene: { text: "A loja apareceu.", choices: [] } },
  ];

  async function bodyOf(response: Response): Promise<string> {
    return await new Response(response.body).text();
  }

  it("declares itself an event stream that must not be cached", async () => {
    const spy = spyGenerator(events);
    const handler = createSceneHandler({ generate: spy.generate });

    const response = await handler(post(VALID));

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("Content-Type"),
      "text/event-stream; charset=utf-8",
    );
    assert.match(response.headers.get("Cache-Control") ?? "", /no-cache/);
    // Without no-transform a proxy may buffer the stream, which silently undoes
    // the entire point of streaming.
    assert.match(response.headers.get("Cache-Control") ?? "", /no-transform/);
  });

  // A missing blank line between frames breaks every SSE client silently.
  it("writes well-formed frames, blank line and all", async () => {
    const spy = spyGenerator(events);
    const handler = createSceneHandler({ generate: spy.generate });

    const body = await bodyOf(await handler(post(VALID)));
    const frames = body.split("\n\n").filter(Boolean);

    assert.equal(frames.length, 3);
    for (const frame of frames) {
      assert.match(frame, /^event: [a-z]+\ndata: \{.*\}$/s);
    }
    assert.ok(body.endsWith("\n\n"), "the last frame needs its blank line too");
  });

  it("keeps the event name out of the data payload", async () => {
    const spy = spyGenerator(events);
    const handler = createSceneHandler({ generate: spy.generate });

    const body = await bodyOf(await handler(post(VALID)));
    const [first] = body.split("\n\n");

    assert.equal(first.split("\n")[0], "event: text");
    assert.deepEqual(JSON.parse(first.split("data: ")[1]), {
      delta: "A loja ",
    });
  });

  it("passes the request through to the generator unchanged", async () => {
    const spy = spyGenerator(events);
    const handler = createSceneHandler({ generate: spy.generate });

    await handler(
      post({
        beat: 3,
        readingLevel: "ler",
        helperName: "Nina",
        facts: ["o chinelo é amarelo"],
        choiceMade: "Abrir a gaveta",
      }),
    );

    assert.deepEqual(spy.calls[0], {
      beat: 3,
      readingLevel: "ler",
      helperName: "Nina",
      facts: ["o chinelo é amarelo"],
      choiceMade: "Abrir a gaveta",
    });
  });

  it("closes the stream when the generator ends", async () => {
    const spy = spyGenerator([]);
    const handler = createSceneHandler({ generate: spy.generate });

    assert.equal(await bodyOf(await handler(post(VALID))), "");
  });

  /**
   * An error mid-stream is still a 200 — the headers went out long before. The
   * `finally` closes the stream, so the client gets what was written and a clean
   * end, not a hang at the transport level.
   *
   * Worth knowing what this does NOT do: no `error` frame is written, so a
   * client that is waiting for `scene` or `error` sees neither and keeps
   * waiting. Nothing hits that today because `generateScene` catches its own
   * failures and yields an `error` event itself — this `finally` is only the
   * backstop under it. If that ever stops being true, the fix belongs here.
   */
  it("closes the stream when the generator throws, keeping what was written", async () => {
    const generate: SceneGenerator = async function* () {
      yield { type: "text", delta: "começou" };
      throw new Error("boom");
    };
    const handler = createSceneHandler({ generate });

    const body = await bodyOf(await handler(post(VALID)));

    assert.equal(body, 'event: text\ndata: {"delta":"começou"}\n\n');
    assert.ok(
      !body.includes("event: error"),
      "no error frame is written today",
    );
  });
});
