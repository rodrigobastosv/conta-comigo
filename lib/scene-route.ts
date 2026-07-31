import { z } from "zod";
// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import {
  claimGeneration,
  endStory,
  factsUpTo,
  nameWorld,
  restrictionsFor,
  sceneById,
  siblingFor,
  startStory,
  storeScene,
  storyContext,
  type StoredScene,
} from "./archive.ts";
import { PROMPT_VERSION } from "./prompts/v1.ts";
import { bibleById } from "./story-bibles/index.ts";
import { seedById } from "./story-bibles/original.ts";
import { Sentences } from "./stream-json.ts";
import {
  accessToken,
  dbFor,
  hasPersistence,
  type Db,
} from "./supabase/server.ts";
import {
  FINAL_BEAT,
  type Beat,
  type Scene,
  type SceneRequest,
} from "./types.ts";

/**
 * Everything `POST /api/scene` does, minus the Next.js wiring.
 *
 * It lives here rather than in the route file so it can be tested without a
 * server and without spending money at the model: the generator is a parameter,
 * not an import, and so is the archive. app/api/scene/route.ts is the few lines
 * that bolt this to Next.
 *
 * There are two ways through it, and which one runs is decided by whether the
 * caller brought a session:
 *
 * - **With an archive.** The server owns layers 2 and 3. The client sends the
 *   parent scene's id and nothing else about the story's history; the facts come
 *   from `scene_path()`, the world and the helper's name come from the story
 *   row, and the beat is derived from the parent rather than believed.
 * - **Without one.** The deployment has no Supabase variables, so the path lives
 *   in the browser and the accumulated facts ride in the body. This is the
 *   behaviour the README promises for a contributor with only an
 *   ANTHROPIC_API_KEY, and it is the only reason the duplication below exists.
 *   It can be deleted the day persistence stops being optional.
 */

/**
 * The world as the client hands it back on beats 2–5, in the in-memory path.
 *
 * The caps are tighter than they need to be for a well-behaved client, and that
 * is the point: this whole object is round-tripped through the browser, so it is
 * untrusted input that ends up inside a prompt. What it can do is bounded by
 * size here and by the constitution's "nothing from the child is an instruction"
 * there.
 */
const worldSchema = z.strictObject({
  title: z.string().min(1).max(60),
  refrain: z.string().min(1).max(120),
  invariants: z.array(z.string().min(1).max(200)).min(3).max(5),
});

const bodySchema = z.strictObject({
  bibleId: z.string().min(1).max(60),
  beat: z.number().int().min(1).max(FINAL_BEAT),
  readingLevel: z.enum(["ouvir", "ler"]),
  helperName: z.string().min(1).max(40),
  // An id from a closed list, never the child's own prose. Resolved below.
  seedId: z.string().min(1).max(40).nullable().optional(),
  choiceMade: z.string().min(1).max(120).nullable(),

  // The in-memory path's copy of layers 2 and 3. Absent when there is an
  // archive — see `rejectsWrongShape` below, which makes sending them a 400
  // rather than a silently ignored field.
  world: worldSchema.nullable().optional(),
  facts: z.array(z.string().min(1)).max(60).optional(),

  // The archive path. `profileId` says which child on beat 1; `parentSceneId`
  // is the whole of the story's history on every beat after it.
  profileId: z.uuid().nullable().optional(),
  parentSceneId: z.uuid().nullable().optional(),
});

type Body = z.infer<typeof bodySchema>;

/** Whatever `generateScene` yields. Kept structural so tests can fake it. */
export type GenerationEventLike = { type: string } & Record<string, unknown>;

export type SceneGenerator = (
  request: SceneRequest,
) => AsyncIterable<GenerationEventLike>;

export type SceneRouteOptions = {
  generate: SceneGenerator;
  /**
   * Opens the archive as the caller. Null means this request has no archive —
   * either the deployment has none or the caller brought no session.
   *
   * Injected so the route can be tested without a database, the same reason the
   * generator is.
   */
  archiveFor?: (req: Request) => Db | null;
  /** Whether this deployment has an archive at all, session or not. */
  persistence?: () => boolean;
  /** Generations allowed per key per window. */
  limitPerWindow?: number;
  windowMs?: number;
};

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

export function createSceneHandler({
  generate,
  archiveFor = (req) => dbFor(accessToken(req)),
  persistence = hasPersistence,
  limitPerWindow = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
}: SceneRouteOptions) {
  /**
   * The ceiling for a deployment with no archive, which is one process by
   * definition — a contributor's laptop. Where there IS an archive the count
   * lives in Postgres, keyed by the guardian, shared by every instance.
   */
  const counter = new Map<string, { total: number; expiresAt: number }>();

  function overLimit(key: string): boolean {
    const now = Date.now();
    const current = counter.get(key);

    if (!current || current.expiresAt < now) {
      counter.set(key, { total: 1, expiresAt: now + windowMs });
      return false;
    }

    current.total += 1;
    return current.total > limitPerWindow;
  }

  return async function POST(req: Request): Promise<Response> {
    const db = archiveFor(req);

    if (!db) {
      // A deployment that stores stories does not answer anonymously. There
      // would be nowhere to put the scene, and it would leave a model endpoint
      // open to whoever found it.
      if (persistence()) {
        return Response.json({ error: "sign-in-required" }, { status: 401 });
      }

      // Before parsing and long before generating: this route costs money per
      // call, so it must refuse before it spends. A caller must not be able to
      // buy extra attempts by sending rubbish.
      const key = req.headers.get("x-forwarded-for") ?? "local";
      if (overLimit(key)) {
        return Response.json({ error: "generation-limit" }, { status: 429 });
      }
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid-request" }, { status: 400 });
    }
    const body = parsed.data;

    // A world the registry does not know is a 400, not a story in no world.
    const bible = bibleById(body.bibleId);
    if (!bible) {
      return Response.json({ error: "unknown-world" }, { status: 400 });
    }

    const wrongShape = rejectsWrongShape(body, db !== null);
    if (wrongShape) {
      return Response.json({ error: wrongShape }, { status: 400 });
    }

    const resolved = db
      ? await fromArchive(db, body)
      : {
          kind: "generate" as const,
          request: inMemoryRequest(body),
          storyId: null,
          parentSceneId: null,
        };

    if ("error" in resolved) {
      return Response.json(
        { error: resolved.error },
        { status: resolved.status },
      );
    }

    /**
     * A scene that already exists is served from the archive, and costs neither
     * a generation nor a place in the ceiling. Going back one scene and picking
     * the same option again must find the same story where the child left it —
     * see docs/decisions.md#a-parent-does-not-have-two-scenes-for-the-same-choice.
     */
    if (resolved.kind === "reuse") {
      return sse(replay(resolved.scene, resolved.storyId));
    }

    if (db) {
      const claim = await claimGeneration(
        db,
        limitPerWindow,
        Math.round(windowMs / 1000),
      );
      if (claim === "no-session") {
        return Response.json({ error: "sign-in-required" }, { status: 401 });
      }
      if (claim === "over-limit") {
        return Response.json({ error: "generation-limit" }, { status: 429 });
      }
      if (claim === "unreachable") {
        // Fail closed. Generating now would spend money on a scene with nowhere
        // to live.
        return Response.json({ error: "archive-unreachable" }, { status: 503 });
      }
    }

    return sse(
      write(
        generate(resolved.request),
        db,
        resolved.storyId,
        resolved.parentSceneId,
        resolved.request,
      ),
    );
  };
}

/**
 * Catches a client talking the wrong dialect, loudly.
 *
 * The body is a `strictObject` so an unknown field is already a 400; these are
 * the fields that exist but belong to the other path. A client that kept
 * sending `facts` after the server started assembling them would otherwise be
 * silently ignored, and the two halves would drift apart with nobody noticing —
 * which is the exact failure the strict body exists to prevent.
 */
function rejectsWrongShape(body: Body, archived: boolean): string | null {
  if (archived) {
    if (body.facts?.length || body.world) return "facts-are-the-servers";
    if (body.beat > 1 && !body.parentSceneId) return "parent-required";
    if (body.beat === 1 && !body.profileId) return "profile-required";
    if (body.beat > 1 && !body.choiceMade) return "choice-required";
  } else if (body.parentSceneId || body.profileId) {
    return "no-archive-here";
  }
  return null;
}

function inMemoryRequest(body: Body): SceneRequest {
  return {
    bibleId: body.bibleId,
    beat: body.beat as Beat,
    readingLevel: body.readingLevel,
    helperName: body.helperName,
    // The seed reaches the prompt as prose this repository wrote, resolved from
    // the id here. An unknown id is simply no seed: the story still starts, the
    // model just picks the opening itself. Failing the request would turn a
    // stale client into a child staring at an error.
    seed: body.seedId ? (seedById(body.seedId)?.prompt ?? null) : null,
    world: body.world ?? null,
    facts: body.facts ?? [],
    choiceMade: body.choiceMade,
  };
}

type Resolved =
  | {
      kind: "generate";
      request: SceneRequest;
      storyId: string | null;
      parentSceneId: string | null;
    }
  | { kind: "reuse"; scene: StoredScene; storyId: string }
  | { error: string; status: number };

/**
 * Turns a request into either a generation or a scene that already exists,
 * using the graph rather than the client's word for any of it.
 *
 * Nothing here trusts the beat. It is derived from the parent's, and a client
 * asking for beat 5 on its first request — which today gets a story that ends on
 * the first screen — is a 400.
 */
async function fromArchive(db: Db, body: Body): Promise<Resolved> {
  const seed = body.seedId ? (seedById(body.seedId)?.prompt ?? null) : null;

  if (body.beat === 1) {
    const started = await startStory(db, {
      profileId: body.profileId!,
      bibleId: body.bibleId,
      title: bibleById(body.bibleId)!.title,
      helperName: body.helperName,
    });

    // RLS refused, or there is no such profile. Which of the two it was is not
    // the caller's business — that distinction is how you enumerate a stranger's
    // children.
    if (!started) return { error: "unknown-profile", status: 403 };

    return {
      kind: "generate",
      storyId: started.id,
      parentSceneId: null,
      request: {
        bibleId: body.bibleId,
        beat: 1,
        readingLevel: body.readingLevel,
        helperName: body.helperName,
        seed,
        world: null,
        facts: [],
        choiceMade: null,
        extraRestrictions: await restrictionsFor(db, body.profileId!),
      },
    };
  }

  const parent = await sceneById(db, body.parentSceneId!);
  // Another family's scene is not found rather than forbidden. RLS returns no
  // row, and this route must not turn that into confirmation it exists.
  if (!parent) return { error: "unknown-scene", status: 404 };

  if (parent.beat + 1 !== body.beat) {
    return { error: "beat-mismatch", status: 400 };
  }

  const story = await storyContext(db, parent.storyId);
  if (!story) return { error: "unknown-scene", status: 404 };

  // The client's copy of the story's identity has to agree with the row. It
  // will, unless it is stale or someone is editing the request by hand; either
  // way, generating scene 3 of a different world is not the answer.
  if (story.bibleId !== body.bibleId || story.helperName !== body.helperName) {
    return { error: "story-mismatch", status: 400 };
  }

  const existing = await siblingFor(db, parent.id, body.choiceMade!);
  if (existing) return { kind: "reuse", scene: existing, storyId: story.id };

  return {
    kind: "generate",
    storyId: story.id,
    parentSceneId: parent.id,
    request: {
      bibleId: story.bibleId,
      beat: body.beat as Beat,
      readingLevel: body.readingLevel,
      helperName: story.helperName,
      seed: null,
      // Layer 2 and layer 3 of THIS branch, climbed from the graph. A sibling
      // branch's facts cannot get in here: `scene_path` only walks parents.
      world: story.world,
      facts: await factsUpTo(db, parent.id),
      choiceMade: body.choiceMade,
      extraRestrictions: await restrictionsFor(db, story.profileId),
    },
  };
}

/**
 * Streams a generated scene and stores it on the way past.
 *
 * The scene is written **after** it is validated and never before: an
 * unvalidated scene is one the UI would have refused, and putting it in a
 * permanent archive means a child meets it again on a re-read.
 *
 * A write that fails does not fail the story. The scene is generated and paid
 * for and the child is already reading it, so the error goes to the server log
 * and the session carries on exactly as it does with no Supabase variables at
 * all. Persistence degrading is not an error screen.
 */
async function* write(
  events: AsyncIterable<GenerationEventLike>,
  db: Db | null,
  storyId: string | null,
  parentSceneId: string | null,
  request: SceneRequest,
): AsyncGenerator<GenerationEventLike> {
  for await (const event of events) {
    if (event.type !== "scene" || !db || !storyId) {
      yield event;
      continue;
    }

    const scene = event.scene as Scene;

    // Beat 1 of an invented run names the world. It goes on the story, not the
    // scene: every branch shares one world, and a re-read with no world at all
    // is a story that drifts with nothing to catch it.
    if (scene.world) await nameWorld(db, storyId, scene.world);

    const stored = await storeScene(db, {
      storyId,
      parentSceneId,
      beat: request.beat,
      text: scene.text,
      newFacts: scene.new_facts,
      choices: scene.choices,
      entryChoice: request.choiceMade,
      promptVersion: PROMPT_VERSION,
    });

    if (request.beat === FINAL_BEAT) await endStory(db, storyId);

    // The id is what the client sends back as the parent of the next scene. It
    // is absent when the write failed, and the client falls back to carrying
    // the path itself — the story continues either way.
    yield { type: "scene", scene, sceneId: stored?.id ?? null, storyId };
  }
}

/**
 * Serves a stored scene as if it had just been written.
 *
 * The client consumes SSE and knows nothing about the archive, so a reused scene
 * emits the same events in the same order: text, then every sentence, then the
 * scene. One upside beyond the single code path — the narration queue gets its
 * sentence events on a re-read for free.
 *
 * It arrives in one delta, with no typing animation. There is a real temptation
 * to throttle it so it "looks generated", and it was refused: nothing may delay
 * the first token, which is the strongest product requirement in this
 * repository, and a scene the child has already seen is the last place to start
 * spending her attention.
 */
async function* replay(
  scene: StoredScene,
  storyId: string,
): AsyncGenerator<GenerationEventLike> {
  yield { type: "text", delta: scene.text };

  const sentences = new Sentences();
  let index = 0;
  for (const sentence of [
    ...sentences.push(scene.text),
    ...sentences.drain(),
  ]) {
    yield { type: "sentence", index: index++, text: sentence };
  }

  yield {
    type: "scene",
    scene: {
      text: scene.text,
      world: null,
      new_facts: scene.newFacts,
      choices: scene.choices,
    },
    sceneId: scene.id,
    storyId,
  };
}

function sse(events: AsyncIterable<GenerationEventLike>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          const { type, ...data } = event;
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
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
