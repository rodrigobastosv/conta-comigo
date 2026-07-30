import { z } from "zod";
// Relative, with the extension: `npm test` runs this through node's strip-only
// type stripping, which does not resolve the `@/` tsconfig alias.
import { bibleById } from "./story-bibles/index.ts";
import { seedById } from "./story-bibles/original.ts";
import { FINAL_BEAT, type SceneRequest } from "./types.ts";

/**
 * Everything `POST /api/scene` does, minus the Next.js wiring.
 *
 * It lives here rather than in the route file so it can be tested without a
 * server and without spending money at the model: the generator is a parameter,
 * not an import. app/api/scene/route.ts is the four lines that bolt this to Next.
 */

/**
 * The world as the client hands it back on beats 2–5.
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
  world: worldSchema.nullable().optional(),
  facts: z.array(z.string().min(1)).max(60),
  choiceMade: z.string().min(1).max(120).nullable(),
});

/** Whatever `generateScene` yields. Kept structural so tests can fake it. */
export type GenerationEventLike = { type: string } & Record<string, unknown>;

export type SceneGenerator = (
  request: SceneRequest,
) => AsyncIterable<GenerationEventLike>;

export type SceneRouteOptions = {
  generate: SceneGenerator;
  /** Generations allowed per key per window. */
  limitPerWindow?: number;
  windowMs?: number;
};

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

export function createSceneHandler({
  generate,
  limitPerWindow = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
}: SceneRouteOptions) {
  /**
   * Generation ceiling per session. Enforced on the server, never on the front
   * end — the front end is inspectable by any 8-year-old with a curious finger.
   *
   * One counter per handler rather than one per module: it makes the limit
   * testable, and in production there is exactly one handler anyway.
   * TODO: move to Redis/Supabase once there is more than one instance.
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
    const key = req.headers.get("x-forwarded-for") ?? "local";

    // Before parsing and long before generating: this route costs money per
    // call, so it must refuse before it spends.
    if (overLimit(key)) {
      return Response.json({ error: "generation-limit" }, { status: 429 });
    }

    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return Response.json({ error: "invalid-request" }, { status: 400 });
    }

    // A world the registry does not know is a 400, not a story in no world.
    if (!bibleById(body.data.bibleId)) {
      return Response.json({ error: "unknown-world" }, { status: 400 });
    }

    // The seed reaches the prompt as prose this repository wrote, resolved from
    // the id here. An unknown id is simply no seed: the story still starts, the
    // model just picks the opening itself. Failing the request would turn a
    // stale client into a child staring at an error.
    const { seedId, ...rest } = body.data;
    const request: SceneRequest = {
      ...rest,
      seed: seedId ? (seedById(seedId)?.prompt ?? null) : null,
      world: rest.world ?? null,
      beat: rest.beat as 1 | 2 | 3 | 4 | 5,
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of generate(request)) {
            const { type, ...data } = event;
            controller.enqueue(
              encoder.encode(
                `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
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
  };
}
