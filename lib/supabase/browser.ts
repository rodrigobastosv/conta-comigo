"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasPersistence, supabaseKey, supabaseUrl } from "./config";
import type { Database } from "./types";

/**
 * The browser's client: sign-in, sign-out, and reading back the family's own
 * rows through RLS.
 *
 * One instance for the tab, built on first use. Two clients would mean two
 * session listeners and two refresh timers racing over the same stored token,
 * which shows up as a user who is randomly signed out.
 *
 * Writes do not come through here. Scenes are written by the route, which is
 * where the model's output is validated — a client that could insert a scene
 * could insert one the UI would have rejected, straight into the permanent
 * archive.
 */

let client: SupabaseClient<Database> | null = null;

export function supabase(): SupabaseClient<Database> | null {
  if (!hasPersistence()) return null;
  client ??= createClient<Database>(supabaseUrl()!, supabaseKey()!, {
    auth: {
      // Survives a reload — which is the entire point of the archive.
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

export { hasPersistence };
