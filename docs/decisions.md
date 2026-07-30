# Decisions that are not obvious in the code

Every item here is a choice that looks wrong or arbitrary until you know the
reason. If you are going to undo one, undo it knowing what starts hurting again.

## Beat 5 returns `choices: []`

It is the end-of-story signal for the UI — there is no `finished` field.
`validateScene` in [lib/schema.ts](../lib/schema.ts) rejects any other
combination: beat 5 requires 0 choices, every other beat requires exactly 2. If
something else comes back, the right move is to **regenerate, not render**.

The model returns 3 choices when you asked for 2. That is not a hypothesis.

## The field order in the schema matters

`text` comes first in `sceneSchema` because `FieldReader` extracts that field from
the **partial** JSON, while it is still arriving. If `new_facts` came first, the
text would only start appearing after the facts finished being written, and the
screen would sit frozen for that time.

Structured output and streaming fight each other: what arrives on the wire is
JSON, not prose.

## The cache is in the right place

Constitution and bible go in stable `system` blocks, with the `cache_control` on
the **last** one. Everything that varies — beat, reading level, accumulated
facts, choice made — goes in the user message, after the breakpoint.

Interpolating anything volatile into the `system` would invalidate the entire
prefix on every call, and the prefix is most of the prompt. It is the difference
between paying for the bible's text once per story and paying for it five times.

This is the real reason for the split between layers 1/2 and layer 3. It is not
file organisation, it is cache economics.

## The `sentence` events already exist, the narration does not

Every complete sentence is emitted the moment it closes, in
[lib/generate-scene.ts](../lib/generate-scene.ts). It is the unit the TTS will
receive to play in a queue while the rest of the scene is still being generated:
first sound in 1–2 s instead of 8.

The event's handler in the client is an empty block today, on purpose. The
alternative was generating the whole scene's audio once it was finished, and then
the child faces eight seconds of silence.

## The `AudioContext` is unlocked before there is any audio

[lib/audio.ts](../lib/audio.ts) creates and calls `resume()` on the `AudioContext`
when "Começar a história" is tapped, and nothing consumes that context today.

On iOS, audio only plays after a user gesture. If you find that out when the
narration lands, the symptom is the first scene coming out silent on the iPad and
nowhere else — the worst kind of bug to diagnose after the fact. The right gesture
exists exactly once per session and it is that button; spending 20 lines now is
cheaper than rediscovering this later.

## The reading-level rules are numeric on purpose

"Suitable for a 5-year-old" is not testable. "Average sentence of 8 to 14 words"
and "90 to 140 words in this scene" are.

That is what the evaluation set will measure on every prompt change. A rule that
cannot be measured does not go into [lib/prompts/v1.ts](../lib/prompts/v1.ts).

## The generation ceiling is on the server

The front end is inspectable by any 8-year-old with a curious finger. The limit
lives in [app/api/scene/route.ts](../app/api/scene/route.ts), before any call to
the model, and returns 429.

It sits in a `Map` in the process memory, which is only correct with one instance.
It is conscious debt, with a `TODO` in the code: with two instances, each counts
its own ceiling and the total doubles.

## The request body is a `strictObject`

An extra field in the POST is a 400, not an ignored field. On a route that costs
money per call, silently accepting what you do not understand is how the client
and the server start disagreeing without anyone noticing.

## A parent does not have two scenes for the same choice

The unique index `scenes_parent_choice` in
[supabase/schema.sql](../supabase/schema.sql). Going back a scene and picking the
same option again must **reuse** the scene that already exists, not generate
another one: the child expects to find the same story again, and regenerating
charges the API for something already paid for.

## The prompt is versioned and the version is stored on the scene

`PROMPT_VERSION` in [lib/prompts/v1.ts](../lib/prompts/v1.ts), written to
`scenes.prompt_version`. Without it, after three changes to the constitution you
have an archive where scenes were generated under different rules and no way to
tell which.

Version `v2` is where the output field names went from Portuguese to English
(`texto` → `text`, `fatos_novos` → `new_facts`, `escolhas` → `choices`,
`rotulo` → `label`, `icone` → `icon`). Anything stored under `v1` used the old
names. The narrator's prose did not change at that version — only the shape of the
JSON around it.

## Error to the client is a code, not a message

`console.error` stays in the server log; the browser gets `generation-failed`,
`scene-truncated`, `model-refusal`. The UI translates it into a sentence that fits
inside the story's world ("A loja não apareceu. Tente de novo.").

Two reasons: a provider's error message can contain infrastructure detail, and
"error 500: unexpected token" is not text for a 5-year-old to read.

## Code is English, the narrator is not

Identifiers, comments and documentation are in English. The constitution, the
story bibles, [story-bible.md](story-bible.md) and the UI strings stay in pt-BR.

The line is not about tidiness: everything on the pt-BR side is text a Brazilian
child reads or hears, or the prose that governs it. Translate it and you have
changed the product. Translate the code and you have only changed how it reads.
The `ReadingLevel` values `'ouvir' | 'ler'` sit on the pt-BR side of that line for
the same reason — they appear in the prompt and in the database constraint.

## No evil antagonist

Antagonists are misunderstanding, stubbornness, fear or haste — and they all end
up understood, not defeated. Maximum permitted tension: "will there be enough
time?". Never "is he going to get hurt?".

The practical consequence is that the model needs an explicit instruction,
because the narrative structure it learned tends to produce a villain.
