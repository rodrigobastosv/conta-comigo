import type { Db } from "./server.ts";

/**
 * An in-memory stand-in for the database, for tests.
 *
 * Never imported by application code. It exists because the interesting
 * properties of the write path — a branch not seeing its sibling's facts, a
 * reused scene costing zero generations, another family's scene coming back as
 * nothing — are properties of queries, and a mock that just returns fixtures
 * cannot have them.
 *
 * Two things it deliberately models rather than fakes:
 *
 * 1. **RLS.** Every table is filtered by the guardian this client is acting as,
 *    the way the policies in supabase/schema.sql filter it. A test that asks for
 *    another family's row gets an empty result and not an error, which is what
 *    Postgres does and what the route has to be written against.
 * 2. **The unique index** on `(parent_scene_id, entry_choice)`, which returns
 *    `23505` exactly like Postgres. That index is the correctness boundary of
 *    scene reuse, so a test double that let a duplicate through would be testing
 *    a system we are not deploying.
 *
 * It is not a database. Anything it does not implement throws loudly rather than
 * returning an empty result, because a silent "no rows" from an unimplemented
 * operator is a test that passes for the wrong reason.
 */

type Row = Record<string, unknown>;
type Table = "profiles" | "stories" | "scenes" | "generation_counters";

export type Seed = {
  profiles?: Row[];
  stories?: Row[];
  scenes?: Row[];
};

const UNIQUE_VIOLATION = { code: "23505", message: "duplicate key value" };
const NO_ROWS = { code: "PGRST116", message: "no rows returned" };

export class FakeDb {
  readonly rows: Record<Table, Row[]> = {
    profiles: [],
    stories: [],
    scenes: [],
    generation_counters: [],
  };

  /** Calls to claim_generation, so a test can assert the ceiling was consulted. */
  claims = 0;
  /** Set to make the ceiling refuse, or to make the database unreachable. */
  claimAnswer: "ok" | "over-limit" | "no-session" | "unreachable" = "ok";

  private ids = 0;

  /**
   * Whose session this client carries. `null` is a caller with no session: every
   * table comes back empty, as it does when `auth.uid()` is null.
   *
   * Assigned in the body rather than declared as a constructor parameter
   * property: `npm test` runs this through node's strip-only type stripping,
   * which rejects `constructor(private readonly x: T)` outright.
   */
  private readonly guardian: string | null;

  constructor(guardian: string | null, seed: Seed = {}) {
    this.guardian = guardian;
    this.rows.profiles = [...(seed.profiles ?? [])];
    this.rows.stories = [...(seed.stories ?? [])];
    this.rows.scenes = [...(seed.scenes ?? [])];
  }

  /** The client the route sees. Only the surface the app actually uses. */
  asDb(): Db {
    return this as unknown as Db;
  }

  private nextId(): string {
    this.ids += 1;
    // A real uuid shape, because the route validates the ids a client sends
    // back and would reject a readable label.
    return `00000000-0000-4000-8000-${String(this.ids).padStart(12, "0")}`;
  }

  /** The policies from supabase/schema.sql, as predicates. */
  private visible(table: Table): Row[] {
    if (this.guardian === null) return [];

    const profiles = this.rows.profiles.filter(
      (p) => p.guardian_id === this.guardian,
    );
    if (table === "profiles") return profiles;

    const stories = this.rows.stories.filter((s) =>
      profiles.some((p) => p.id === s.profile_id),
    );
    if (table === "stories") return stories;
    if (table === "scenes") {
      return this.rows.scenes.filter((c) =>
        stories.some((s) => s.id === c.story_id),
      );
    }
    // generation_counters has no policy at all, on purpose.
    return [];
  }

  from(table: Table) {
    return new FakeQuery(this, table);
  }

  async rpc(name: string, args: Row) {
    if (name === "claim_generation") {
      this.claims += 1;
      if (this.claimAnswer === "unreachable") {
        return { data: null, error: { message: "connection refused" } };
      }
      if (this.guardian === null) return { data: "no-session", error: null };
      return { data: this.claimAnswer, error: null };
    }

    if (name === "scene_path") {
      const wanted = args.scene as string;
      const visible = this.visible("scenes");
      const path: Row[] = [];

      let at = visible.find((s) => s.id === wanted);
      while (at) {
        path.push(at);
        const parent = at.parent_scene_id as string | null;
        at = parent ? visible.find((s) => s.id === parent) : undefined;
      }

      // depth 0 is the scene asked for; the function returns root first.
      return {
        data: path
          .map((row, depth) => ({
            id: row.id,
            beat: row.beat,
            text: row.text,
            new_facts: row.new_facts,
            entry_choice: row.entry_choice,
            depth,
          }))
          .reverse(),
        error: null,
      };
    }

    throw new Error(`FakeDb: no such function ${name}`);
  }

  /** Used by FakeQuery. Kept here so the id counter is one per database. */
  insertInto(table: Table, values: Row) {
    if (table === "scenes") {
      const clash = this.rows.scenes.some(
        (s) =>
          s.parent_scene_id !== null &&
          s.parent_scene_id === values.parent_scene_id &&
          s.entry_choice === values.entry_choice,
      );
      if (clash) return { data: null, error: UNIQUE_VIOLATION };
    }

    const row: Row = {
      id: this.nextId(),
      created_at: new Date().toISOString(),
      ...values,
    };
    if (table === "stories") row.ended_at ??= null;
    if (table === "stories") row.world ??= null;

    this.rows[table].push(row);

    // Written rows are still subject to the policy on the way back out.
    return this.visible(table).includes(row)
      ? { data: row, error: null }
      : { data: null, error: { code: "42501", message: "row-level security" } };
  }

  rowsVisibleIn(table: Table): Row[] {
    return this.visible(table);
  }
}

type Filter = (row: Row) => boolean;

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: unknown }> {
  private filters: Filter[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private cap: number | null = null;
  private pending: { kind: "insert" | "update"; values: Row } | null = null;

  private readonly db: FakeDb;
  private readonly table: Table;

  constructor(db: FakeDb, table: Table) {
    this.db = db;
    this.table = table;
  }

  select(_columns?: string) {
    return this;
  }

  insert(values: Row) {
    this.pending = { kind: "insert", values };
    return this;
  }

  update(values: Row) {
    this.pending = { kind: "update", values };
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  not(column: string, operator: string, value: null) {
    if (operator !== "is") throw new Error(`FakeDb: not(${operator})`);
    this.filters.push((row) => (row[column] ?? null) !== value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sorts.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.cap = count;
    return this;
  }

  private matches(): Row[] {
    let found = this.db
      .rowsVisibleIn(this.table)
      .filter((row) => this.filters.every((f) => f(row)));

    for (const { column, ascending } of [...this.sorts].reverse()) {
      found = [...found].sort((a, b) => {
        const left = String(a[column] ?? "");
        const right = String(b[column] ?? "");
        return ascending
          ? left.localeCompare(right)
          : right.localeCompare(left);
      });
    }

    return this.cap === null ? found : found.slice(0, this.cap);
  }

  private run(): { data: Row[] | null; error: unknown } {
    if (this.pending?.kind === "insert") {
      const { data, error } = this.db.insertInto(
        this.table,
        this.pending.values,
      );
      return { data: data ? [data] : null, error };
    }

    if (this.pending?.kind === "update") {
      const values = this.pending.values;
      for (const row of this.matches()) Object.assign(row, values);
      return { data: [], error: null };
    }

    return { data: this.matches(), error: null };
  }

  async single() {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    if (!data || data.length !== 1) return { data: null, error: NO_ROWS };
    return { data: data[0], error: null };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    return { data: data?.[0] ?? null, error: null };
  }

  then<R1, R2 = never>(
    resolve?:
      | ((value: {
          data: Row[] | null;
          error: unknown;
        }) => R1 | PromiseLike<R1>)
      | null,
    reject?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}
