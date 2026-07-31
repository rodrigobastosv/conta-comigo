# Roadmap

What does not exist yet, in rough order of importance. Every item says where the
hook already is, because almost nothing here starts from zero.

The sequenced, dependency-ordered version of this list lives in the GitHub
issues — see the tracking issue "Sequencing: execution order and dependencies".

## Narration (TTS)

The biggest hole. In `ouvir` mode (~5 years old) the child does not read the
screen, so today the product only really works in `ler` mode.

Ready:

- `sentence` event emitted by [lib/generate-scene.ts](../lib/generate-scene.ts)
  for every sentence that closes, during streaming.
- `Sentences` in [lib/stream-json.ts](../lib/stream-json.ts) splitting the text as
  it arrives.
- `AudioContext` already unlocked on the user gesture
  ([lib/audio.ts](../lib/audio.ts)) — now the thing the server voices play
  through.
- `profiles.preferred_voice`.
- The decision **not** to store audio: every listen re-synthesizes, and the schema
  has no audio columns. See
  [decisions.md](decisions.md#the-narration-is-not-stored-anywhere).
- The providers are chosen, in three tiers: the device's own voice for free,
  Google Chirp3-HD inside a free monthly quota, ElevenLabs when it is worth
  paying. See
  [decisions.md](decisions.md#narration-starts-free-on-the-device-and-buys-quality-later).
- The voice catalogue and the provider seam in [lib/tts/](../lib/tts/), so adding
  a voice is adding an entry, and re-casting one onto another provider does not
  orphan a stored profile.

- The playback queue itself ([lib/tts/queue.ts](../lib/tts/queue.ts)), wired into
  [components/story.tsx](../components/story.tsx): sentences are spoken in order
  as they arrive, the voice stops the moment a choice is tapped, the sentence
  being read is highlighted, and there are pause and "de novo" controls.

- The per-sentence audio route for the server tiers
  ([lib/tts/audio-route.ts](../lib/tts/audio-route.ts), wired at
  [app/api/audio/route.ts](../app/api/audio/route.ts)), the Google adapter
  ([lib/tts/google.ts](../lib/tts/google.ts)), and the voice picker on the start
  screen.

**Narration works today with no account and no key, on the device voice — and on
Google's Chirp3-HD wherever `GOOGLE_TTS_API_KEY` is set.** Measured in a real
browser: the first sentence starts speaking 6.4 s before the scene finishes
generating.

Missing: nothing required. The picker's choice is now stored on
`profiles.preferred_voice`, so a family casts the narrator once. ElevenLabs has
no adapter because no voice is cast on it.

The project constraint: **first sound in 1–2 s**, playing sentence 1 while
sentence 3 is still being generated. Generating the whole scene's audio once it is
finished is the wrong solution, and that is why the event is per sentence and not
per scene.

Chirp3-HD does not meet that budget on its own — measured at ~1.6 s p50, against
a ~350 ms network floor. It is paid once per scene rather than once per sentence,
because the queue prefetches each sentence's audio while the previous one plays,
and it is spent watching the prose stream in rather than watching a blank screen.
The reasoning, the tier comparison and the `pt-BR-Neural2-*` escape hatch are in
[decisions.md](decisions.md#measured-at-last--and-chirp3-hd-is-far-slower-than-advertised).

## Persistence

Done. The adult signs in with an e-mail and a password, RLS is the boundary, and
every validated scene is stored in the graph. The route owns the story's history:
the client sends the parent scene's id and the server climbs `scene_path()` for
the facts, reads the world and the helper's name off the story row, and derives
the beat from the parent instead of believing it. A scene that already exists for
a (parent, choice) is replayed rather than regenerated, and a story can be picked
up where it stopped or read start to finish.

**With no Supabase variables the app is exactly what it was before any of this**:
no sign-in, one session, a reload loses the path. That is the second column of the
table in [architecture.md](architecture.md#two-ways-through-the-route), and the
duplication it describes can be deleted the day persistence stops being optional.

Missing: nothing required.

## Speculative pre-generation

While the child reads scene N, generate both possible branches of scene N+1. Her
choice then reveals content that is already finished: perceived latency close to
zero.

Now costed: a story goes from 5 generations to 9, which is **8.3¢ → 15.0¢ in
`ouvir`** and **12.1¢ → 21.8¢ in `ler`**. It buys the whole post-choice wait,
about 3 s to first token and 11 s to a finished scene.

Blocked on a measurement, not on code: **how often is a second path through the
same story ever taken?** The discarded branch is only waste if she never comes
back for it, and break-even is roughly one re-read per story. The graph now
stores what is needed to answer that — count scenes that have a sibling and were
visited. See
[decisions.md](decisions.md#what-this-says-about-speculative-pre-generation-15).

## Parents' mode

History of what has been read, and per-profile restrictions (fears to avoid,
forbidden names).

Ready, and now further along than it was: authentication exists, profiles exist
and are created in the UI, and **the restrictions already reach the prompt from
the server** — the route reads `profiles.restrictions` and passes them as
`extraRestrictions`, which is where they have to be read from, since a restriction
a client can drop from a request is not a restriction.

Done: [components/parents.tsx](../components/parents.tsx) — restrictions as four
common presets plus free text, forbidden names, the reading history with the path
each story took, and deleting a child (which cascades in the schema, so it is one
delete and not three). In front of it, a speed bump that is not security and does
not pretend to be: it exists so a five-year-old looking for the next story does
not land in the settings, and an eight-year-old is welcome to solve it.

Forbidden names are checked in two places, and only one of them counts: the route
refuses the helper name before generating anything, and the client repeats the
check so the child hears "escolhe outro" instead of watching a story fail to start
for a reason nobody explained. They also reach the prompt, or the model stays free
to hand the name to a character.

Done: `profiles.preferred_voice` is read and written — a family picks the
narrator once rather than every night, and a stored voice this deployment can no
longer speak falls back instead of going silent. `profiles.preferred_companion`
joins it: who reads the story and who waits on the home screen are two columns
on purpose, because a friend who reads the story has become the narrator.

Missing: nothing unattached in the schema.

## Evaluation set

Done: `npm run eval` runs fourteen fixed openings against the real model, in both
worlds, and measures words per scene, mean words per sentence, the refrain, the
choice-label lengths, a short list of constitution breaches, and the rules only an
invented world can break. Baseline in
[lib/eval/baseline.json](../lib/eval/baseline.json), now on `v3`.

Missing: acting on what it found, which after the `v3` run is a sharper ask than
it was. `v3` scores **5/14**, and every failure is one of two rules: the `ouvir`
sentence floor of 8 words (missed in all ten `ouvir` scenes, mean 7.6, across
*both* worlds) and the `ouvir` choice-label ceiling of 4 (missed six times, always
by exactly one word).

That is no longer a hypothesis about one world's prompt — it is the same result in
a world nobody wrote by hand. The fix is a prose decision and starts in
[story-bible.md](story-bible.md): floor 6, ceiling 5, then `lib/eval/rules.ts` to
match, then re-measure. See
[decisions.md](decisions.md#what-the-v3-run-found-on-twice-the-evidence).

Nothing else failed. None of the invented-world rules fired and no case needed a
second attempt, in either world — the structural half of layer 2b is solid and it
is the reading-level numbers that are wrong.

Still open: whether `EFFORT` should go from `low` to `medium`. Two runs now say no
— zero regenerations across 24 generations, including four that had to invent a
world from scratch.

## More worlds

Done: [lib/story-bibles/index.ts](../lib/story-bibles/index.ts) is the registry,
the generator resolves the bible from `request.bibleId` instead of importing one,
the start screen lets the family choose, and `Record<Beat, string>` makes "every
bible has all five beats" a compile error rather than a runtime surprise.

Two worlds ship: [the lost things
shop](../lib/story-bibles/loja-de-coisas-perdidas.ts), written by hand, and
[original](../lib/story-bibles/original.ts), where the model invents the world on
beat 1 from a charter. Adding a third is adding a file and an entry.

Three worlds ship now. The second hand-written one is [the circus that builds
itself](../lib/story-bibles/circo-que-monta-sozinho.ts), and it exists for a
reason that is not plumbing: the shop has no clock. Its engine is a question, and
the constitution permits exactly one tension — *"será que vai dar tempo?"* — that
no world was using. Here something is missing and the circus opens at dawn either
way, so the hurry is enjoyable because both endings are good.

[registry.test.ts](../lib/story-bibles/registry.test.ts) iterates the registry and
asserts what `Record<Beat, string>` cannot: a real instruction per beat, a final
beat that says "sem escolhas", a refrain present in layer 2 for a hand-written
world and absent for an invented one.

Missing: **the circus has no baseline.** Three cases were added to the evaluation
set and never run against the real model, so its numbers are unknown and the v3
baseline covers fourteen cases, not seventeen. Run `npm run eval` before trusting
anything about how this world reads.

## Keeping and letting go

Done. Every scene was always stored as it was generated, so "save it if you
liked it" was never about saving — the two things actually missing were marking
the good ones and removing a bad one. `stories.loved_at` does both: kept stories
sort first in a library that will hold thirty by month three, and deleting one
cascades to its scenes.

The friend asks at the end of a story, which is allowed because he is a friend
and not the narrator, and because "quer guardar essa?" is about the app rather
than about the story. See [story-bible.md](story-bible.md).

## Illustrations

The choice icons are emoji, and `Choice.icon` is capped at 8 characters because of
it. A 5-year-old chooses by the drawing, not by the text, so this is worth more
than it looks.

## Known technical debt

- **The route's own file is untested.** `lib/scene-route.ts` carries the logic and
  is covered; `app/api/scene/route.ts` is a few lines of Next wiring on top of it
  and is not.
- **The functions and the database are on different continents.** Measured on the
  live deployment: the function runs in `iad1` (Washington), the Supabase project
  is in `sa-east-1` (São Paulo), and the child is in Brazil. Beat 1 makes three
  round trips to the database — `claim_generation`, the profile's limits, the
  story insert — before the model is called at all, and every one of them crosses
  that gap.

  First measurements from production, beat 1, `ouvir`, the shop:

  | | time to first token | whole scene |
  | --- | --- | --- |
  | cold | 4870 ms | 12.2 s |
  | warm | 3903 ms | 14.4 s |
  | warm | 3683 ms | 10.7 s |

  So a cold start costs about a second and the rest is the model thinking. The
  three database round trips are the part that is ours, and they are the part
  that a region change would fix.

  **Pinning `gru1` was tried and is not available on the Hobby plan** — the
  deployment comes back `BLOCKED` with no error message. So this is blocked on
  billing, not on measurement. Before paying for it, get the number: instrument
  the route to log the time spent in the archive versus the time spent waiting
  for the model. If the database round trips are 300 ms of a 3.7 s wait, the
  region is not the thing to buy.
- **The table types are hand-written.** [lib/supabase/types.ts](../lib/supabase/types.ts)
  mirrors `supabase/schema.sql` by hand, and a stale type file is worse than none.
  Change both in the same commit, or swap it for the generator's output.
