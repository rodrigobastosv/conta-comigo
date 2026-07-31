import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSceneHandler,
  type GenerationEventLike,
  type SceneGenerator,
} from "./scene-route.ts";
import { PROMPT_VERSION } from "./prompts/v1.ts";
import { FakeDb } from "./supabase/fake-db.ts";

/**
 * The route with an archive behind it.
 *
 * Every test here counts generator calls, for the same reason the in-memory
 * tests do: "it returned the right scene" is half the requirement, and the other
 * half is whether it paid the model to do it.
 */

const GUARDIAN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/**
 * Real uuids, because the route validates the ids a client sends back — a
 * readable label would be a 400 before it ever reached a query.
 */
const PROFILE = "aaaaaaaa-0000-4000-8000-000000000001";
const STORY = "aaaaaaaa-0000-4000-8000-000000000002";
const ROOT = "aaaaaaaa-0000-4000-8000-000000000003";
const ORPHAN_STORY = "bbbbbbbb-0000-4000-8000-000000000001";
const ORPHAN_SCENE = "bbbbbbbb-0000-4000-8000-000000000002";

function familyOf(guardian: string) {
  return {
    profiles: [
      {
        id: PROFILE,
        guardian_id: guardian,
        nickname: "Nina",
        age: 5,
        reading_level: "ouvir",
        preferred_voice: null,
        restrictions: [] as string[],
        forbidden_names: [] as string[],
        created_at: "2026-01-01",
      },
    ],
  };
}

/** Beat 1 already stored, so a test can go straight to the interesting beat. */
function withRootScene(guardian: string) {
  return {
    ...familyOf(guardian),
    stories: [
      {
        id: STORY,
        profile_id: PROFILE,
        bible_id: "loja-de-coisas-perdidas",
        world: null,
        title: "A Loja de Coisas Perdidas",
        helper_name: "Nina",
        created_at: "2026-01-01",
        ended_at: null,
      },
    ],
    scenes: [
      {
        id: ROOT,
        story_id: STORY,
        parent_scene_id: null,
        beat: 1,
        text: "A loja apareceu na esquina.",
        new_facts: ["a loja apareceu na esquina"],
        choices: [
          { label: "Entrar", icon: "🚪" },
          { label: "Esperar", icon: "⏳" },
        ],
        entry_choice: null,
        prompt_version: "v3",
        created_at: "2026-01-01",
      },
    ],
  };
}

function narrator(text = "A gaveta estava aberta. Dentro havia um chinelo.") {
  const calls: unknown[] = [];
  const generate: SceneGenerator = async function* (request) {
    calls.push(request);
    yield { type: "text", delta: text };
    yield {
      type: "scene",
      scene: {
        text,
        world: null,
        new_facts: ["o chinelo é amarelo"],
        choices: [
          { label: "Pegar", icon: "🩴" },
          { label: "Deixar", icon: "🚶" },
        ],
      },
    };
  };
  return { generate, calls };
}

function handlerFor(db: FakeDb, generate: SceneGenerator, limit = 60) {
  return createSceneHandler({
    generate,
    archiveFor: () => db.asDb(),
    persistence: () => true,
    limitPerWindow: limit,
  });
}

function post(body: unknown) {
  return new Request("http://localhost/api/scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Reads the whole SSE body and returns its frames.
 *
 * Every test that asserts on the database has to go through this first: the
 * scene is written while the stream is being consumed, so a handler whose body
 * nobody read has not finished writing anything.
 */
async function events(response: Response) {
  const raw = await new Response(response.body).text();
  return raw
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => ({
      event: frame.split("\n")[0].slice(7),
      data: JSON.parse(frame.split("data: ")[1]) as Record<string, unknown>,
    }));
}

const CONTINUE = {
  bibleId: "loja-de-coisas-perdidas",
  beat: 2,
  readingLevel: "ouvir",
  helperName: "Nina",
  choiceMade: "Entrar",
};

describe("the write path", () => {
  it("stores the story and the scene, chained to its parent", async () => {
    const db = new FakeDb(GUARDIAN, familyOf(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    const first = await events(
      await handler(
        post({
          bibleId: "loja-de-coisas-perdidas",
          beat: 1,
          readingLevel: "ouvir",
          helperName: "Nina",
          choiceMade: null,
          profileId: PROFILE,
        }),
      ),
    );

    assert.equal(db.rowsVisibleIn("stories").length, 1);
    assert.equal(db.rowsVisibleIn("scenes").length, 1);

    const root = db.rowsVisibleIn("scenes")[0];
    assert.equal(root.parent_scene_id, null, "the root scene has no parent");
    assert.equal(root.entry_choice, null, "nothing led to the first scene");
    // Against the constant, not a literal: the point of the column is that it
    // tracks whatever the prompt currently is, so a version bump must not need
    // a test edit.
    assert.equal(root.prompt_version, PROMPT_VERSION);

    const sceneEvent = first.at(-1)!;
    assert.equal(sceneEvent.event, "scene");
    assert.equal(sceneEvent.data.sceneId, root.id, "the client needs the id");

    // And the second beat hangs off it.
    await events(
      await handler(post({ ...CONTINUE, parentSceneId: root.id as string })),
    );
    const second = db
      .rowsVisibleIn("scenes")
      .find((s) => s.parent_scene_id === root.id);
    assert.ok(second, "beat 2 must be stored under beat 1");
    assert.equal(second.entry_choice, "Entrar");
  });

  it("keeps streaming when the write fails", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    // A story that is not this guardian's: the insert is refused by the policy.
    db.rows.stories.push({
      id: ORPHAN_STORY,
      profile_id: "cccccccc-0000-4000-8000-000000000001",
      bible_id: "loja-de-coisas-perdidas",
      world: null,
      title: "T",
      helper_name: "Nina",
      created_at: "2026-01-01",
      ended_at: null,
    });
    db.rows.scenes.push({
      id: ORPHAN_SCENE,
      story_id: ORPHAN_STORY,
      parent_scene_id: null,
      beat: 1,
      text: "t",
      new_facts: [],
      choices: [],
      entry_choice: null,
      prompt_version: "v3",
      created_at: "2026-01-01",
    });

    // The parent is invisible, so this is a 404 rather than a broken write —
    // which is itself the property worth pinning down.
    const response = await handler(
      post({ ...CONTINUE, parentSceneId: ORPHAN_SCENE }),
    );
    assert.equal(response.status, 404);
    assert.equal(
      spy.calls.length,
      0,
      "must not generate for a stranger's path",
    );
  });

  it("marks the story finished when beat 5 lands", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    // Walk beats 2, 3, 4, 5 down one branch.
    let parent: string = ROOT;
    for (const beat of [2, 3, 4, 5]) {
      const frames = await events(
        await handler(
          post({
            ...CONTINUE,
            beat,
            choiceMade: `Escolha ${beat}`,
            parentSceneId: parent,
          }),
        ),
      );
      parent = frames.at(-1)!.data.sceneId as string;
    }

    const story = db.rowsVisibleIn("stories")[0];
    assert.ok(story.ended_at, "beat 5 ends the story");
    assert.equal(db.rowsVisibleIn("scenes").length, 5);
  });
});

describe("the facts belong to the branch, not to the client", () => {
  it("never gives one branch the other branch's facts", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    // Branch A: beat 2 → beat 3.
    const a2 = (
      await events(
        await handler(
          post({ ...CONTINUE, choiceMade: "Entrar", parentSceneId: ROOT }),
        ),
      )
    ).at(-1)!.data.sceneId as string;

    // Branch B: the other choice, same parent.
    const b2 = (
      await events(
        await handler(
          post({
            ...CONTINUE,
            choiceMade: "Esperar",
            parentSceneId: ROOT,
          }),
        ),
      )
    ).at(-1)!.data.sceneId as string;

    assert.notEqual(
      a2,
      b2,
      "the other choice is a new scene, not an overwrite",
    );

    // Give the two branches different truths, then ask for beat 3 on A.
    const rowOf = (id: string) => db.rows.scenes.find((s) => s.id === id)!;
    rowOf(a2).new_facts = ["o chinelo é amarelo"];
    rowOf(b2).new_facts = ["a bota é vermelha"];

    await events(
      await handler(post({ ...CONTINUE, beat: 3, parentSceneId: a2 })),
    );

    const { facts } = spy.calls.at(-1) as { facts: string[] };
    assert.deepEqual(facts, [
      "a loja apareceu na esquina",
      "o chinelo é amarelo",
    ]);
    assert.ok(
      !facts.includes("a bota é vermelha"),
      "branch B's truth must not reach branch A",
    );
  });

  it("refuses a beat the parent does not lead to", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    // The hole this closes: a client asking for the last beat immediately and
    // getting a story that ends on the first screen.
    const response = await handler(
      post({ ...CONTINUE, beat: 5, parentSceneId: ROOT }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "beat-mismatch" });
    assert.equal(spy.calls.length, 0);
  });

  it("refuses a client that still sends its own facts", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    const response = await handler(
      post({
        ...CONTINUE,
        parentSceneId: ROOT,
        facts: ["um fato que eu inventei"],
      }),
    );

    assert.equal(response.status, 400, "an old client must fail loudly");
    assert.equal(spy.calls.length, 0);
  });

  it("returns nothing for another family's scene", async () => {
    const db = new FakeDb(OTHER, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    const response = await handler(post({ ...CONTINUE, parentSceneId: ROOT }));

    assert.equal(
      response.status,
      404,
      "not 403: confirming it exists is a leak",
    );
    assert.equal(spy.calls.length, 0);
  });
});

describe("reuse, don't regenerate", () => {
  it("serves the stored scene with zero generations", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    const first = await events(
      await handler(post({ ...CONTINUE, parentSceneId: ROOT })),
    );
    assert.equal(spy.calls.length, 1);

    const again = await events(
      await handler(post({ ...CONTINUE, parentSceneId: ROOT })),
    );

    assert.equal(spy.calls.length, 1, "the second visit must not generate");
    assert.equal(db.rowsVisibleIn("scenes").length, 2, "and must not insert");
    assert.deepEqual(again.at(-1)!.data.scene, first.at(-1)!.data.scene);
    assert.equal(again.at(-1)!.data.sceneId, first.at(-1)!.data.sceneId);
  });

  it("emits the same event sequence as a generated scene", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    await events(await handler(post({ ...CONTINUE, parentSceneId: ROOT })));
    const replayed = await events(
      await handler(post({ ...CONTINUE, parentSceneId: ROOT })),
    );

    assert.deepEqual(
      replayed.map((e) => e.event),
      ["text", "sentence", "sentence", "scene"],
      "the client is one code path, and the narration queue needs its sentences",
    );
    assert.equal(replayed[1].data.index, 0);
    assert.equal(replayed[2].data.index, 1);
  });

  it("still generates for the other choice", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    await events(await handler(post({ ...CONTINUE, parentSceneId: ROOT })));
    await events(
      await handler(
        post({ ...CONTINUE, choiceMade: "Esperar", parentSceneId: ROOT }),
      ),
    );

    assert.equal(spy.calls.length, 2);
    assert.equal(db.rowsVisibleIn("scenes").length, 3);
  });

  it("ends with one row and two answered children when they race", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);
    const body = post({ ...CONTINUE, parentSceneId: ROOT });

    // Two identical requests in flight at once: both miss the lookup, both
    // generate, and the unique index lets exactly one insert through.
    const [one, two] = await Promise.all([
      handler(body.clone()).then(events),
      handler(body.clone()).then(events),
    ]);

    assert.equal(db.rowsVisibleIn("scenes").length, 2, "exactly one new scene");
    assert.equal(one.at(-1)!.event, "scene", "both children get a scene");
    assert.equal(two.at(-1)!.event, "scene");
    assert.equal(
      one.at(-1)!.data.sceneId,
      two.at(-1)!.data.sceneId,
      "and it is the same scene",
    );
  });

  it("does not spend a place in the ceiling", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    await events(await handler(post({ ...CONTINUE, parentSceneId: ROOT })));
    assert.equal(db.claims, 1);

    await events(await handler(post({ ...CONTINUE, parentSceneId: ROOT })));
    assert.equal(db.claims, 1, "a re-read is not a generation");
  });
});

describe("the ceiling, once it is shared", () => {
  it("refuses past the limit without generating", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);
    db.claimAnswer = "over-limit";

    const response = await handler(post({ ...CONTINUE, parentSceneId: ROOT }));

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: "generation-limit" });
    assert.equal(spy.calls.length, 0);
  });

  it("fails closed when the archive cannot be reached", async () => {
    const db = new FakeDb(GUARDIAN, withRootScene(GUARDIAN));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);
    db.claimAnswer = "unreachable";

    const response = await handler(post({ ...CONTINUE, parentSceneId: ROOT }));

    // Generating now would spend money on a scene with nowhere to live.
    assert.equal(response.status, 503);
    assert.equal(spy.calls.length, 0);
  });

  it("does not answer a caller with no session where there is an archive", async () => {
    const spy = narrator();
    const handler = createSceneHandler({
      generate: spy.generate,
      archiveFor: () => null,
      persistence: () => true,
    });

    const response = await handler(
      post({
        bibleId: "original",
        beat: 1,
        readingLevel: "ouvir",
        helperName: "Nina",
        choiceMade: null,
        facts: [],
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "sign-in-required" });
    assert.equal(spy.calls.length, 0, "never a free model endpoint");
  });
});

describe("the family's limits, applied on the server", () => {
  function familyWithLimits(restrictions: string[], names: string[]) {
    const seed = withRootScene(GUARDIAN);
    seed.profiles[0].restrictions = restrictions;
    seed.profiles[0].forbidden_names = names;
    return seed;
  }

  it("puts the profile's restrictions into the request the model sees", async () => {
    const db = new FakeDb(GUARDIAN, familyWithLimits(["cachorro grande"], []));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    await events(await handler(post({ ...CONTINUE, parentSceneId: ROOT })));

    const { extraRestrictions } = spy.calls[0] as {
      extraRestrictions: string[];
    };
    // Never from the body. A restriction a client can drop from a request is
    // not a restriction.
    assert.ok(extraRestrictions.includes("cachorro grande"));
  });

  it("refuses a forbidden name as the helper, before generating", async () => {
    // No root scene in this one: the assertion at the end is that no story row
    // exists at all, and withRootScene would have seeded one.
    const family = familyOf(GUARDIAN);
    family.profiles[0].forbidden_names = ["Téo"];
    const db = new FakeDb(GUARDIAN, family);
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    const response = await handler(
      post({
        bibleId: "loja-de-coisas-perdidas",
        beat: 1,
        readingLevel: "ouvir",
        helperName: "téo",
        choiceMade: null,
        profileId: PROFILE,
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "forbidden-name" });
    assert.equal(spy.calls.length, 0);
    assert.equal(
      db.rowsVisibleIn("stories").length,
      0,
      "and no story is left behind",
    );
  });

  it("tells the model to keep a forbidden name out of the cast too", async () => {
    const db = new FakeDb(GUARDIAN, familyWithLimits([], ["Téo"]));
    const spy = narrator();
    const handler = handlerFor(db, spy.generate);

    await events(await handler(post({ ...CONTINUE, parentSceneId: ROOT })));

    const { extraRestrictions } = spy.calls[0] as {
      extraRestrictions: string[];
    };
    assert.ok(extraRestrictions.some((line) => line.includes("Téo")));
  });
});

describe("an invented world is named once, on the story", () => {
  it("writes the world to the story and not to the scene", async () => {
    const db = new FakeDb(GUARDIAN, familyOf(GUARDIAN));
    const world = {
      title: "O Caminho de Papel",
      refrain: "Quem procura devagar encontra duas vezes.",
      invariants: ["a", "b", "c"],
    };
    const generate: SceneGenerator = async function* () {
      yield {
        type: "scene",
        scene: {
          text: "Era uma vez um caminho de papel.",
          world,
          new_facts: [],
          choices: [
            { label: "Ir", icon: "👣" },
            { label: "Ficar", icon: "🪑" },
          ],
        },
      } satisfies GenerationEventLike;
    };

    const handler = handlerFor(db, generate);
    await events(
      await handler(
        post({
          bibleId: "original",
          beat: 1,
          readingLevel: "ouvir",
          helperName: "Nina",
          choiceMade: null,
          profileId: PROFILE,
        }),
      ),
    );

    const story = db.rowsVisibleIn("stories")[0];
    assert.deepEqual(story.world, world, "every branch shares one world");
    assert.equal(story.title, world.title, "and the story is named after it");
  });
});
