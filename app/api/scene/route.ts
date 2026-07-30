import { z } from "zod";
import { generateScene } from "@/lib/generate-scene";
import { FINAL_BEAT } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.strictObject({
  beat: z.number().int().min(1).max(FINAL_BEAT),
  readingLevel: z.enum(["ouvir", "ler"]),
  helperName: z.string().min(1).max(40),
  facts: z.array(z.string().min(1)).max(60),
  choiceMade: z.string().min(1).max(120).nullable(),
});

/**
 * Generation ceiling per session. Enforced on the server, never on the front end
 * — the front end is inspectable by any 8-year-old with a curious finger.
 * TODO: move to Redis/Supabase once there is more than one instance.
 */
const LIMIT_PER_WINDOW = 60;
const WINDOW_MS = 60 * 60 * 1000;
const counter = new Map<string, { total: number; expiresAt: number }>();

function overLimit(key: string): boolean {
  const now = Date.now();
  const current = counter.get(key);

  if (!current || current.expiresAt < now) {
    counter.set(key, { total: 1, expiresAt: now + WINDOW_MS });
    return false;
  }

  current.total += 1;
  return current.total > LIMIT_PER_WINDOW;
}

export async function POST(req: Request) {
  const key = req.headers.get("x-forwarded-for") ?? "local";
  if (overLimit(key)) {
    return Response.json({ error: "generation-limit" }, { status: 429 });
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "invalid-request" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generateScene({
          ...body.data,
          beat: body.data.beat as 1 | 2 | 3 | 4 | 5,
        })) {
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
