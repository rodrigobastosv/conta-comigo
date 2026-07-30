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
  -- Parents' mode: fears to avoid, forbidden names. Reaches the prompt as
  -- extraRestrictions. Empty today, the structure already exists.
  restrictions  jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create table stories (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  -- Which bible (world) was used: 'loja-de-coisas-perdidas'.
  bible_id    text not null,
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
  -- Narration audio, in Storage. Cached by hash of (text + voice + model).
  audio_url       text,
  audio_hash      text,
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
alter table profiles enable row level security;
alter table stories enable row level security;
alter table scenes enable row level security;

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
