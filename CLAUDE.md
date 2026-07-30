# Context for coding agents

Read [docs/README.md](docs/README.md) before changing anything. This file is only
the summary of what tends to get forgotten.

## Hierarchy of truth

**prose → prompt → code.** [docs/story-bible.md](docs/story-bible.md) governs
[lib/prompts/v1.ts](lib/prompts/v1.ts), which governs everything else.

A change in the narrator's behaviour **starts in the story bible**, not in the
prompt. If you edit only the prompt, the document becomes fiction and the next
person has no way to tell which of the two is right.

When changing the constitution or the reading-level rules, raise `PROMPT_VERSION`.

## Language

Identifiers, comments, documentation, commit messages: **English**.
`generateScene`, `FieldReader`, `beat`, `new_facts`. A `gerarCena` in the middle
makes the reader switch languages every file.

**The narrator's prose stays in pt-BR** — do not "helpfully" translate it:

- `CONSTITUTION` and the reading-level rules in [lib/prompts/v1.ts](lib/prompts/v1.ts)
- the bibles in [lib/story-bibles/](lib/story-bibles/) (`text`, `beats`, `title`, `refrain`)
- [docs/story-bible.md](docs/story-bible.md)
- the UI strings in [components/story.tsx](components/story.tsx)
- the `ReadingLevel` values `'ouvir' | 'ler'`, which are in the prompt and in the
  database constraint

That text is what a Brazilian child reads and hears. Translating it changes the
product; translating the code only changes how it reads.

A comment explains **why**, not what — and records what happens if someone undoes
the decision. That is the repository's tone; copy it.

## Things that look like bugs and are not

Before "fixing" any of these, read [docs/decisions.md](docs/decisions.md):

- `text` is the first field of `sceneSchema` **on purpose** — the streaming reader
  extracts that field from the partial JSON.
- [lib/audio.ts](lib/audio.ts) creates an `AudioContext` nobody consumes **on
  purpose**, and speaks an empty utterance at zero volume — the iOS unlock has to
  happen inside a user gesture, and `speechSynthesis` and `AudioContext` ask for
  that permission separately.
- [lib/tts/speaker.ts](lib/tts/speaker.ts) skips the first pt-BR voice the device
  offers **on purpose** — on macOS that is a novelty voice, not Luciana.
- [lib/tts/queue.ts](lib/tts/queue.ts) serialises playback instead of handing
  every sentence to the platform queue **on purpose** — it is what keeps a
  sentence from jumping ahead of its predecessor, and what makes a tap silence
  the voice in the same tick.
- Beat 5 returns `choices: []`. It is the end-of-story signal; there is no
  `finished` field.
- The filename of a story bible mirrors its `id`, which is what goes into
  `stories.bible_id`. That is why `loja-de-coisas-perdidas.ts` keeps a pt-BR name.
- Formatting is prettier's and linting is eslint's: `npm run format`, `npm run lint`. Both run in CI.

## Invariants that cannot be broken

- **Nothing volatile in the `system`.** Beat, level, facts and choice go in the
  user message, after the `cache_control`. Interpolating into the `system`
  invalidates the entire prefix on every call.
- **The API key never reaches the browser.** Only server code imports
  [lib/anthropic.ts](lib/anthropic.ts). Never prefix it with `NEXT_PUBLIC_`.
- **Cost and content limits live on the server.** The front end is inspectable.
- **Error to the client is a code**, not a stack trace or the provider's message.
- **Nothing that delays the first token.** It is the strongest product requirement
  that exists here.

## Verify before finishing

```bash
npm test && npm run typecheck && npm run lint && npm run format:check && npm run build
```

Changed streaming parsing? Add a test in
[lib/stream-json.test.ts](lib/stream-json.test.ts) — a bug there is silent.
