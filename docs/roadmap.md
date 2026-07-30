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
  ([lib/audio.ts](../lib/audio.ts)), with `audioContext()` exported for the queue
  to use.
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

**Narration works today, on the device voice, with no account and no key.**
Measured in a real browser: the first sentence starts speaking 6.4 s before the
scene finishes generating.

Missing: the route that synthesizes per sentence for the **server** tiers only
(issue #12), and a key for one of them — plus `npm run tts:bench` to turn the
vendors' published latency into a measured one. Also missing: a voice picker in
the UI, so a family can choose between Dona Vitória and o contador rather than
always getting the device voice.

The project constraint: **first sound in 1–2 s**, playing sentence 1 while
sentence 3 is still being generated. Generating the whole scene's audio once it is
finished is the wrong solution, and that is why the event is per sentence and not
per scene.

## Persistence

[supabase/schema.sql](../supabase/schema.sql) is written and has RLS, and the app
does not write to it. Today the path lives in `useState` and reloading the page
loses everything.

Missing: storing the scene and reading the path back, and using `scene_path()` to
assemble the facts instead of accumulating them in the client. Respecting
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

Done: `npm run eval` runs ten fixed openings against the real model and measures
words per scene, mean words per sentence, the refrain, the choice-label lengths
and a short list of constitution breaches. Baseline in
[lib/eval/baseline.json](../lib/eval/baseline.json).

Missing: acting on what it found. `v2` scores 4/10 — the `ouvir` sentence floor
of 8 words is not what the model produces and probably not what a five-year-old
wants. That is a prose change, so it starts in
[story-bible.md](story-bible.md). See
[decisions.md](decisions.md#what-the-first-run-found).

Still open: whether `EFFORT` should go from `low` to `medium`. Nothing in the
first run suggests it — no case needed a second attempt.

## More worlds

There is only one bible: [the lost things
shop](../lib/story-bibles/loja-de-coisas-perdidas.ts). Layer 2 is already one file
per world and `stories.bible_id` already records which one was used — but
[lib/generate-scene.ts](../lib/generate-scene.ts) still imports that bible
directly, so adding a world is adding a file **and** editing the generator. A
registry, the UI to choose, and the validation that every bible has all five beats
are missing.

## Illustrations

The choice icons are emoji, and `Choice.icon` is capped at 8 characters because of
it. A 5-year-old chooses by the drawing, not by the text, so this is worth more
than it looks.

## Known technical debt

- **Generation ceiling in memory.** Only correct with one instance. See
  [decisions.md](decisions.md#the-generation-ceiling-is-on-the-server).
- **No linter.** Neither eslint nor prettier configured; CI runs `typecheck`,
  `test` and `build`.
- **Tests only for the parser.** [lib/stream-json.test.ts](../lib/stream-json.test.ts)
  covers `FieldReader` and `Sentences`. `validateScene` and the route have no
  tests.
