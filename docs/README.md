# Documentation

Four documents, with roles that do not overlap. If you are adding documentation,
fit it into one of these instead of creating a fifth file — the reason there are
so few is so nobody has to guess where a piece of information lives.

| Document | Answers |
| --- | --- |
| [story-bible.md](story-bible.md) | What the narrator can and cannot do. **Source of truth.** Written in pt-BR, like the prompt it governs. |
| [architecture.md](architecture.md) | How the code is put together and where a scene travels. |
| [decisions.md](decisions.md) | Why a strange-looking choice in the code is the right one. |
| [roadmap.md](roadmap.md) | What does not exist yet and where the hook already is. |

## Where to start

**Touching the prompt, a character or a content limit?**
[story-bible.md](story-bible.md) first, always. The prompt in
[lib/prompts/v1.ts](../lib/prompts/v1.ts) is that document translated into what
goes in the `system` — editing the code without editing the prose turns the
document into fiction, and the next person has no way to tell which of the two is
right.

**Touching streaming, the route, the cache or the database?**
[architecture.md](architecture.md), then [decisions.md](decisions.md).

**Found something in the code that looks wrong?**
Look in [decisions.md](decisions.md) before fixing it. The field order in the
schema, the `AudioContext` nobody uses and the empty event handler are all
deliberate and all have a written reason.

**Want to contribute?** [CONTRIBUTING.md](../CONTRIBUTING.md).

## Language

Code, comments and documentation are in **English**. The narrator's prose is not:
the constitution in [lib/prompts/v1.ts](../lib/prompts/v1.ts), the story bibles in
[lib/story-bibles/](../lib/story-bibles/), [story-bible.md](story-bible.md) and
the UI strings stay in pt-BR, because that is the product — a narrator speaking
Brazilian Portuguese to a Brazilian child. Translating it would change what the
child hears, not how the code reads.

## The golden rule

The hierarchy is **prose → prompt → code**.

`docs/story-bible.md` governs `lib/prompts/v1.ts`, which governs everything else.
When changing the constitution or the reading-level rules, raise `PROMPT_VERSION`
— every scene stores that version, and it is what lets you know which rules each
part of the archive was generated under.
