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
- `scenes.audio_url` and `scenes.audio_hash` columns in the schema, for caching by
  hash of (text + voice + model).
- `profiles.preferred_voice`.

Missing: choosing the pt-BR voice provider, the route that generates audio per
sentence, and the playback queue in the client — the `sentence` event handler in
[components/story.tsx](../components/story.tsx) is an empty block today.

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

Ten fixed openings, run on every prompt change, measuring the numeric
reading-level rules: words per scene, words per sentence, and presence of the
refrain. Plus a check against the constitution's limits.

It is what allows changing the prompt without discovering the regression from a
child's mouth. It is also what decides whether `EFFORT` should go from `low` to
`medium`.

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
