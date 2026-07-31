# Conta Comigo

Interactive children's stories: children don't just listen, they build. Every
choice branches the narrative, and nothing is overwritten — the archive grows and
you can go back and see the other path.

[![CI](https://github.com/rodrigobastosv/conta-comigo/actions/workflows/ci.yml/badge.svg)](https://github.com/rodrigobastosv/conta-comigo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Five beats per story, two choices per beat. The child names the helper, chooses by
the picture, and the story branches into a graph: taking another path creates a
new scene instead of erasing the previous one.

The stories are in Brazilian Portuguese — that is the product. The code and the
documentation are in English.

## Run it

Requires Node 22.6+ (`npm test` runs TypeScript directly, with no build step).

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

```bash
npm test        # tests for the streaming JSON reader
npm run typecheck
npm run build   # does not need an API key
```

Only `ANTHROPIC_API_KEY` is required. Without the Supabase variables the app runs
entirely in memory: the story works end to end, there is no sign-in, and reloading
the page loses the path travelled.

### With an archive

Two variables and two clicks, once:

1. Supabase dashboard → **SQL editor** → run [supabase/schema.sql](supabase/schema.sql).
2. **Authentication → Sign In / Providers → Email** → turn **Confirm email** off.
   A parent hunting for a link in an inbox while a five-year-old waits has already
   lost the evening; the reasoning is in
   [docs/decisions.md](docs/decisions.md#the-adult-signs-in-and-rls-is-the-boundary).
3. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
   `.env.local`.

Then stories persist, the archive grows, and a story can be picked up where it
stopped. Both keys are public by design — **there is no service-role key in this
project**, and adding one would turn RLS from the boundary into decoration.

### Without a key, and without a bill

```bash
npm run dev:fake             # http://localhost:3000, canned scenes
```

`dev:fake` sets `FAKE_MODEL=1` and a narrator made of canned prose answers
instead of the model — five real beats, streamed sentence by sentence, in
pt-BR. Everything downstream is the real thing: the SSE stream, the sentence
splitting, the narration queue, the choice buttons, the write path.

Use it for anything that is not the prompt itself. It is opt-in and never
inferred from a missing key, and it warns in the server log on every scene.

## Deploying

Vercel, and production is whatever is on `main` **and passed CI**. That ordering
is the only interesting part: Vercel's own Git integration deploys on push
regardless of the tests, which is how a red build reaches a child at bedtime. So
`vercel.json` switches off automatic deployment for `main` and the `deploy` job in
[ci.yml](.github/workflows/ci.yml) hangs off `needs: verify`. Preview deployments
on other branches stay on, because they cost nothing and break nothing.

Once, to connect a fork or a new project:

1. `npx vercel link`, then read `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` out of
   `.vercel/project.json`.
2. Add three repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`. With no token the deploy job says so and passes — a fork
   should not get a red X on its first push.
3. Add the environment variables to the Vercel project: `ANTHROPIC_API_KEY`, the
   two `NEXT_PUBLIC_SUPABASE_*` ones, and `GOOGLE_TTS_API_KEY` if you want the
   server voices. The `NEXT_PUBLIC_` pair is read at build time, so changing one
   needs a redeploy, not a restart.

**Never set `FAKE_MODEL` on a deployment.** It is for a laptop.

## Documentation

| Document | Answers |
| --- | --- |
| [docs/story-bible.md](docs/story-bible.md) | What the narrator can and cannot do. **Source of truth — change it here first, code after.** In pt-BR, like the prompt it governs. |
| [docs/architecture.md](docs/architecture.md) | How the code is put together and where a scene travels. |
| [docs/decisions.md](docs/decisions.md) | Why a strange-looking choice in the code is the right one. |
| [docs/roadmap.md](docs/roadmap.md) | What does not exist yet and where the hook already is. |

Index and reading order in [docs/](docs/README.md).

## How it works, briefly

One real endpoint: `POST /api/scene`, which returns SSE.

The model writes JSON validated by a schema, but the screen cannot wait for the
JSON to close — a 5-year-old gives up after 3 seconds of a frozen screen. So
[lib/stream-json.ts](lib/stream-json.ts) extracts the `text` field from the JSON
**while it is still arriving** and splits it into sentences, which is the unit the
narration will receive to play in a queue while the rest of the scene is generated.

The story bible has three layers, and the split between them is about the cache,
not organisation:

| Layer | Scope | Where it lives | In the prompt |
| --- | --- | --- | --- |
| 1. Constitution | Every story, forever | [lib/prompts/v1.ts](lib/prompts/v1.ts) | `system`, in full, **cached** |
| 2. Story bible | One world | [lib/story-bibles/](lib/story-bibles/) | `system`, in full, **cached** |
| 3. Established facts | One path in the graph | `scenes.new_facts` | user message, accumulated |

Layer 3 is what stops the dragon that was blue in scene 2 from being green in
scene 4. Every scene returns the facts it created; the whole path comes back on
the next call. Climbing `parent_scene_id` gives exactly the facts of that branch —
different branches hold different truths without contaminating each other.

Details in [docs/architecture.md](docs/architecture.md).

## Current state

Works end to end: generates all five scenes, branches, goes back one scene and
takes the other path, reads itself aloud, and — where Supabase is configured —
signs the adult in, stores every scene, picks a story back up after a reload,
never regenerates a scene that already exists, reads a finished story back, and
shares it. Light and dark, because it is used at bedtime.

**A story costs about 8.3¢** in `ouvir` and 12.1¢ in `ler` — that is the unit
this project argues in, and `npm run cost` is what measures it. See
[docs/decisions.md](docs/decisions.md#the-unit-of-cost-is-one-story).

Does not exist yet: illustrations in place of the emoji; speculative
pre-generation (costed, and blocked on a measurement rather than on code);
sharing as a link rather than as text. See [docs/roadmap.md](docs/roadmap.md),
and the GitHub issues for the sequenced version of that list.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) — and read
[docs/story-bible.md](docs/story-bible.md) before touching the prompt.

Found a scene that violates the constitution's limits? Open an issue with the path
of choices that led to it. It is the most useful report this project can get.

Security flaw: [SECURITY.md](SECURITY.md), not a public issue.

## Licence

[MIT](LICENSE).
