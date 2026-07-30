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
entirely in memory: the story works end to end, but reloading the page loses the
path travelled.

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
takes the other path.

Does not exist yet: **narration (TTS)** — the hook is ready, the pt-BR voice is
missing; **persistence** — the schema is written, the app does not write to it;
parents' mode; illustrations in place of the emoji; the evaluation set. See
[docs/roadmap.md](docs/roadmap.md), and the GitHub issues for the sequenced
version of that list.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) — and read
[docs/story-bible.md](docs/story-bible.md) before touching the prompt.

Found a scene that violates the constitution's limits? Open an issue with the path
of choices that led to it. It is the most useful report this project can get.

Security flaw: [SECURITY.md](SECURITY.md), not a public issue.

## Licence

[MIT](LICENSE).
