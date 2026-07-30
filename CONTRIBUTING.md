# Contributing

Thanks for the interest. This project is a tool children use, so two things weigh
more here than in the average project: **the safety of the generated content** and
**the latency until the first thing appears on screen**. Almost every architecture
decision comes out of one of those two.

## Before writing code

Read [docs/story-bible.md](docs/story-bible.md). It is the prose source of truth
for what the narrator can and cannot do, and much of the code only makes sense
after it. Then [docs/architecture.md](docs/architecture.md) and
[docs/decisions.md](docs/decisions.md) — the second explains choices that look
wrong until you know the reason.

## Environment

Requires Node 22.6+ (`npm test` uses `--experimental-strip-types` to run
TypeScript directly, with no build step).

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Only `ANTHROPIC_API_KEY` is required to run. Without the Supabase variables the
app works entirely in memory — the story goes end to end, but reloading the page
loses the path travelled. For working on the prompt, streaming or UI, that is
enough.

Before opening a PR:

```bash
npm test          # tests for the streaming JSON reader
npm run typecheck
npm run build
```

All three run in CI. The `build` does not need an API key.

## The rule that matters most

**A change in the narrator's behaviour starts in
[docs/story-bible.md](docs/story-bible.md), not in the code.**

The prompt in [lib/prompts/v1.ts](lib/prompts/v1.ts) is that document translated
into what goes in the `system`. If you edit the prompt without editing the prose,
the document becomes fiction and the next person has no way to tell which of the
two is right. Order: prose first, prompt second, `PROMPT_VERSION` last.

When changing the constitution or the reading-level rules, **raise
`PROMPT_VERSION`** in [lib/prompts/v1.ts](lib/prompts/v1.ts). Every scene stores
that version, so it is what lets you know which rules each part of the archive was
generated under.

## What gets a PR accepted quickly

- **One subject per PR.** Prompt and streaming in separate PRs.
- **A test for parsing logic.** [lib/stream-json.ts](lib/stream-json.ts) has tests
  because that is where a bug is silent: emitting half an escape sequence breaks
  nothing, it just shows `ç` on a child's screen. Changed the parser? Test it.
- **Nothing that increases the latency of the first token.** A 5-year-old gives up
  after 3 seconds of a frozen screen. If your change makes the server wait for the
  JSON to close before sending anything, it will be refused even if the code is
  good.
- **Do not interpolate anything volatile into the `system`.** See
  [docs/decisions.md](docs/decisions.md#the-cache-is-in-the-right-place) — it
  invalidates the whole prefix's cache and multiplies the cost per call.
- **Error to the client is a code, not a detail.** The `console.error` stays on the
  server; the browser gets `generation-failed`. Do not leak stack traces or the
  provider's message.

## Style

Identifiers, comments, documentation and commit messages in **English**. The code
is consistent about it (`generateScene`, `FieldReader`, `beat`); a `gerarCena` in
the middle makes the reader switch languages every file.

**Except for the narrator's prose, which stays in pt-BR**: the constitution and
reading-level rules in [lib/prompts/v1.ts](lib/prompts/v1.ts), the story bibles in
[lib/story-bibles/](lib/story-bibles/), [docs/story-bible.md](docs/story-bible.md),
and the UI strings the child reads. That text is the product — a narrator speaking
Brazilian Portuguese to a Brazilian child. Translating it changes what the child
hears, not how the code reads. The `ReadingLevel` values `'ouvir' | 'ler'` sit on
that side of the line too: they are in the prompt and in the database constraint.

A comment explains **why**, not what. The repository's pattern is a comment that
records the decision and what happens if you undo it — copy that tone.

No prettier/eslint configured at the moment. Follow the formatting of neighbouring
files: 2 spaces, double quotes, semicolons.

## Generated content

If you find a scene that violates the constitution's limits (death, a real
villain, an explicit moral, abandonment), open an issue with the **path of choices
that led to it** and the text that came out. It is the most useful report this
project can get, and it does not need to come with a fix.

If the violation can be provoked deliberately through user input, it is a security
flaw: follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code of conduct

By participating you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Licence

Contributions are made under the project's [MIT licence](LICENSE).
