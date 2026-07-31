/**
 * Where the connection details live, and the one function that answers "is
 * persistence configured at all?".
 *
 * Both variables are `NEXT_PUBLIC_` and both are meant to be in the browser: the
 * publishable key is a routing token, not a secret. What protects the data is
 * RLS plus the signed-in adult's JWT, and that is a deliberate choice — see
 * docs/decisions.md#the-adult-signs-in-and-rls-is-the-boundary.
 *
 * There is **no service-role key in this repository, on purpose**. If you ever
 * add one, RLS stops being the boundary and every query in the app becomes
 * responsible for scoping itself; one missing `where` is then another family's
 * child's bedtime story.
 *
 * Read at call time and never at import: with no variables set the app has to
 * run fully in memory, and a module that throws on import would take
 * `npm run build` down with it for anyone who only has an ANTHROPIC_API_KEY.
 */

export function supabaseUrl(): string | undefined {
  // Written out rather than indexed, because Next inlines NEXT_PUBLIC_ vars by
  // literal match. `process.env[name]` is undefined in the browser.
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabaseKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined;
}

/**
 * Whether this deployment stores anything.
 *
 * `false` is a supported way to run: the story works end to end, the archive
 * just does not exist and a reload loses the path. Every persistence call site
 * has to keep that true.
 */
export function hasPersistence(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}
