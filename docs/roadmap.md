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

Missing: nothing required. What is left is optional and measured, not assumed —
`profiles.preferred_voice` is still not read or written (the picker's choice
lives in `useState` and resets on reload, which waits on parents' mode, issue
#16), and ElevenLabs has no adapter because no voice is cast on it.

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

[supabase/schema.sql](../supabase/schema.sql) is written and has RLS, and the app
does not write to it. Today the path lives in `useState` and reloading the page
loses everything.

Missing: storing the scene and reading the path back, and using `scene_path()` to
assemble the facts instead of accumulating them in the client. An invented world
also has to land in `stories.world`, or a re-read comes back in no world at all —
today it lives in `useState` next to the path and dies with the tab. Respecting
`scenes_parent_choice`: if the scene for that (parent, choice) pair already
exists, reuse it instead of regenerating.

It is what turns "one session" into "the archive grows" — the premise of the
product.

## Speculative pre-generation

While the child reads scene N, generate both possible branches of scene N+1. Her
choice then reveals content that is already finished: perceived latency close to
zero.

It costs two generations where one will be used. It makes sense after
persistence, because the discarded branch is not waste — it stays in the archive
for when she comes back and takes the other path.

## Parents' mode

History of what has been read, and per-profile restrictions (fears to avoid,
forbidden names).

Ready: the `profiles.restrictions` column, the `extraRestrictions` field in
`SceneRequest`, and the passage in `buildRequest` that injects those restrictions
into the prompt with the instruction to obey without mentioning them. Only the UI
and the authentication are missing.

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

Missing: a second **hand-written** world. The charter buys variety, not the kind
of specificity Dona Vitória has, and the roadmap item that mattered here was
always "a world someone loved writing".

## Illustrations

The choice icons are emoji, and `Choice.icon` is capped at 8 characters because of
it. A 5-year-old chooses by the drawing, not by the text, so this is worth more
than it looks.

## Known technical debt

- **Generation ceiling in memory.** Only correct with one instance. See
  [decisions.md](decisions.md#the-generation-ceiling-is-on-the-server).
- **The route's own file is untested.** `lib/scene-route.ts` carries the logic and
  is covered; `app/api/scene/route.ts` is four lines of Next wiring on top of it
  and is not.
