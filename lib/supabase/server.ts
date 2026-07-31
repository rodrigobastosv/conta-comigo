import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasPersistence, supabaseKey, supabaseUrl } from "./config.ts";
import type { Database } from "./types.ts";

export type Db = SupabaseClient<Database>;

/**
 * The database, as the signed-in adult.
 *
 * There is no ambient server client here and there must never be one. Every
 * client this module hands out carries one caller's access token, so every
 * query runs under that caller's RLS policies — which is what makes the
 * policies in supabase/schema.sql the actual boundary rather than decoration.
 *
 * The consequence to keep in mind while writing queries: **a query that would
 * cross into another family's data does not return their rows, it returns
 * none.** You will see an empty result, not an error. Code accordingly — a
 * missing row is the security control working, not a bug to route around.
 */

/**
 * Reads the caller's access token off the request.
 *
 * The browser sends it; the route never mints one. A malformed or expired token
 * is not rejected here — Postgres rejects it, and it does so for every query at
 * once, which is a better place for that decision than a helper function.
 */
export function accessToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * A client acting as the holder of `token`, or null when this deployment has no
 * database or the caller brought no session.
 *
 * Null is a first-class answer, not a failure: the app is supposed to run with
 * no Supabase variables at all, and the caller's job is to fall back to the
 * in-memory path rather than to throw.
 */
export function dbFor(token: string | null): Db | null {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key || !token) return null;

  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    // Nothing on the server should be storing or refreshing anybody's session:
    // the token arrived with this one request and dies with it.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { hasPersistence };
