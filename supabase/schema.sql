-- Conta Comigo — the scene graph.
--
-- The central idea: nothing is overwritten. Taking another path creates a new
-- scene under the SAME parent. The archive grows, and the path travelled
-- (climbing parent_scene_id) is the little book the child re-reads later.

create extension if not exists "pgcrypto";

-- One account per adult. Children do not have logins.
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  guardian_id   uuid not null references auth.users (id) on delete cascade,
  nickname      text not null,
  age           smallint not null check (age between 2 and 14),
  -- Values stay in Portuguese: they are also in the prompt and in ReadingLevel.
  reading_level text not null check (reading_level in ('ouvir', 'ler')),
  preferred_voice text,
  -- Parents' mode. Free text, one restriction per entry ("cachorros grandes",
  -- "trovão"), reaching the prompt as extraRestrictions with the instruction to
  -- obey without mentioning them.
  restrictions  jsonb not null default '[]'::jsonb,
  -- Kept apart from `restrictions` because it is checked in two places, not
  -- one: it reaches the prompt AND it is refused at the helper-name input. A
  -- name the model was told to avoid is no use if the child can type it in as
  -- the hero.
  forbidden_names text[] not null default '{}'::text[],
  created_at    timestamptz not null default now()
);

create table stories (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  -- Which bible (world) was used: 'loja-de-coisas-perdidas' or 'original'.
  bible_id    text not null,
  -- Layer 2 of a story whose world nobody wrote by hand: the title, refrain and
  -- invariants beat 1 invented. Null for a fixed world, whose layer 2 is in the
  -- repository. It lives on the story and not on the scene because every branch
  -- of the story shares one world — see docs/story-bible.md, layer 2b.
  world       jsonb,
  title       text not null,
  -- The name the child gave the helper. Asked once per story and a fiction
  -- nickname, not an identity — but it lives here because coherence between
  -- scenes and the little book depend on it (and the name is inside the text
  -- anyway).
  helper_name text not null,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create table scenes (
  id              uuid primary key default gen_random_uuid(),
  story_id        uuid not null references stories (id) on delete cascade,
  parent_scene_id uuid references scenes (id) on delete cascade,
  beat            smallint not null check (beat between 1 and 5),
  text            text not null,
  -- Layer 3 of the story bible: the facts THIS scene made true.
  new_facts       jsonb not null default '[]'::jsonb,
  -- [] on beat 5 — it is the end-of-story signal for the UI.
  choices         jsonb not null default '[]'::jsonb,
  -- Label of the choice that led here. Null on the root scene.
  entry_choice    text,
  -- No audio columns, deliberately: the narration is re-synthesized on every
  -- listen and never stored. The text IS the archive. See
  -- docs/decisions.md#the-narration-is-not-stored-anywhere.
  prompt_version  text not null,
  created_at      timestamptz not null default now()
);

create index scenes_by_story on scenes (story_id);
create index scenes_by_parent on scenes (parent_scene_id);
-- A parent must not have two scenes generated for the same choice: reuse, don't regenerate.
create unique index scenes_parent_choice
  on scenes (parent_scene_id, entry_choice)
  where parent_scene_id is not null;

-- Path from the root down to a scene. This is what assembles the little book and
-- the set of facts of that branch — different branches hold different truths
-- without contaminating each other.
create or replace function scene_path(scene uuid)
returns table (
  id uuid,
  beat smallint,
  text text,
  new_facts jsonb,
  entry_choice text,
  depth int
)
language sql stable as $$
  with recursive climb as (
    select s.id, s.parent_scene_id, s.beat, s.text, s.new_facts,
           s.entry_choice, 0 as depth
      from scenes s where s.id = scene
    union all
    select p.id, p.parent_scene_id, p.beat, p.text, p.new_facts,
           p.entry_choice, c.depth + 1
      from scenes p join climb c on p.id = c.parent_scene_id
  )
  select id, beat, text, new_facts, entry_choice, depth
    from climb order by depth desc;
$$;

-- Zero child data leaves here. Each guardian only sees what is theirs.
--
-- RLS is the real boundary, not decoration: the app never holds a service-role
-- key. Every request runs as the signed-in adult, so a missing `where` in
-- application code cannot leak another family's scene — the database refuses
-- before the code gets the chance. See
-- docs/decisions.md#the-adult-signs-in-and-rls-is-the-boundary.
alter table profiles enable row level security;
alter table stories enable row level security;
alter table scenes enable row level security;

-- `for all` with no `with check`: Postgres reuses the `using` expression for
-- inserts, so a guardian cannot write a row they would not be allowed to read.
create policy "guardian's profiles" on profiles
  for all using (guardian_id = auth.uid());

create policy "guardian's stories" on stories
  for all using (
    exists (
      select 1 from profiles p
       where p.id = stories.profile_id and p.guardian_id = auth.uid()
    )
  );

create policy "guardian's scenes" on scenes
  for all using (
    exists (
      select 1 from stories s join profiles p on p.id = s.profile_id
       where s.id = scenes.story_id and p.guardian_id = auth.uid()
    )
  );

-- The generation ceiling, shared by every instance.
--
-- It used to be a Map in one process, which is correct with exactly one
-- instance and worthless on a platform that starts a new one whenever it feels
-- like it — the counter resets under exactly the load it was written for.
create table generation_counters (
  -- The guardian, or an IP for traffic with no session.
  key        text primary key,
  total      integer not null default 0,
  expires_at timestamptz not null
);

alter table generation_counters enable row level security;
-- No policy on purpose: nothing reaches this table except claim_generation(),
-- which is security definer. A client that could read it could read every
-- family's usage; a client that could write it could reset its own ceiling.

/**
 * Counts one generation and says whether it is allowed.
 *
 * security definer, and the key is auth.uid() read INSIDE the function — never
 * an argument. A ceiling whose key the caller chooses is not a ceiling. The
 * caller's identity here is the subject of a JWT Postgres has already verified.
 *
 * The count is one statement so it is atomic: read-then-write from two
 * instances is the same bug in a new place.
 *
 * Returns a code rather than a boolean because "you are over the ceiling" and
 * "your session expired" are different answers to the caller, and a boolean
 * would send a family whose token went stale a message about spending too much.
 *   'ok' | 'over-limit' | 'no-session'
 */
create or replace function claim_generation(
  max_per_window integer,
  window_seconds integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  if auth.uid() is null then
    -- With persistence configured, a caller with no session has nowhere to
    -- store a scene anyway, and answering would make this a free model endpoint
    -- for whoever finds it.
    return 'no-session';
  end if;

  insert into generation_counters (key, total, expires_at)
       values (auth.uid()::text, 1, now() + make_interval(secs => window_seconds))
  on conflict (key) do update
          set total = case
                        when generation_counters.expires_at < now() then 1
                        else generation_counters.total + 1
                      end,
              expires_at = case
                             when generation_counters.expires_at < now()
                               then now() + make_interval(secs => window_seconds)
                             else generation_counters.expires_at
                           end
    returning total into claimed;

  return case when claimed <= max_per_window then 'ok' else 'over-limit' end;
end;
$$;

revoke all on function claim_generation(integer, integer) from public;
grant execute on function claim_generation(integer, integer) to authenticated;
