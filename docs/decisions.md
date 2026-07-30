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

## Narration starts free on the device, and buys quality later

Three tiers, cheapest first, all in one catalogue
([lib/tts/voices.ts](../lib/tts/voices.ts)):

| Tier | Provider | Cost | Needs |
| --- | --- | --- | --- |
| **Default** | the device's own `speechSynthesis` | nothing, ever | nothing |
| **Free quality** | Google Cloud `pt-BR-Chirp3-HD-*` | free inside 1M chars/month | a GCP account |
| **Paid quality** | ElevenLabs `eleven_flash_v2_5` | ~$0.05/1k chars | a paid plan |

The default is the **device voice** because it is the only option that narrates on
a fresh clone: no account, no key, no billing, no network. It is not the best voice
here and is not meant to be — it exists so that narration ships, and so the
playback queue (issue #13) can be built and tested before anyone signs up for
anything. Its cost is real, just not in money: the available voices differ per
device, iOS exposes far fewer than desktop, and there is no delivery control
beyond rate.

**Google is the free rung with real quality.** 1M characters a month on
Chirp3-HD, recurring rather than a trial, which at ~3.5k characters per
five-scene story is roughly **285 stories a month for nothing**. That is well past
what a family reads.

**ElevenLabs is the paid upgrade**, at about **$0.18 for a story the first time
and nothing on every re-read**. What the money buys is the deepest library of
native pt-BR voices to cast characters from, which is what makes adding a voice an
entry in a file instead of a provider migration.

### Why not OpenAI, and why latency did not decide

`gpt-4o-mini-tts` is the cheapest of the metered options and the only one that
takes free-text delivery instructions, and it is still out: its voices are
optimised for English and carry an audible US accent into Portuguese, with
reports of mixing pt-BR and pt-PT inside one output. A narrator with a foreign
accent is not a cheaper version of this product for a Brazilian five-year-old; it
is a different one.

The issue that opened this assumed latency would decide. It did not. Published
time-to-first-audio is ~75 ms for ElevenLabs Flash v2.5, ~90 ms for Cartesia
Sonic 3, ~300–600 ms for OpenAI — and the budget is first sound in 1–2 s, which
also has to cover generating the first sentence. Everything credible fits. Accent,
licensing and the depth of the voice library decided instead.

Cartesia Sonic 3 remains the runner-up on the paid rung: cheaper than ElevenLabs
and explicitly Brazil-targeted. **Switch if** the bill becomes the binding
constraint, or if pt-BR pronunciation complaints show up in real scenes.

### Licensing is what actually constrains the cache

The archive re-reads stored audio, so the right to keep the file matters more
here than the price of making it.

- **ElevenLabs paid plans**: explicit. Output rights are retained and the audio can
  be used indefinitely, so storing it and re-serving it by `audio_hash` is fine.
  On the **free** tier it is not — no commercial licence. That is why the free
  ElevenLabs tier is not one of the three rungs above.
- **Google**: generating audio per request for one end user is covered; Google's
  own guidance draws a line at "rebundling as a media library". A per-family
  archive of stories that family generated sits on the right side of that line as
  read here, but it is close enough that it is worth a lawyer's glance before
  relying on it at scale rather than a confident assumption in a code comment.
- **The device voice** raises none of this: the audio never exists as a file.

### The numbers above are vendor claims

Nobody has had an account on any of them yet, so nothing here is measured.
[scripts/bench-tts.ts](../scripts/bench-tts.ts) measures time to first playable
audio for whichever providers are configured, from where the users are, on real
sentences. Run it and paste the table here. Vendor marketing is not evidence.

### One consequence worth seeing early

The device voice is client-side, so it has no route, no audio file, no cache and
no cost — issue #12 exists only for the server tiers. `ProviderKind` in
[lib/tts/types.ts](../lib/tts/types.ts) is that fork, and the playback queue
branches on it exactly once.

## A voice is a character, and its id is permanent

[lib/tts/voices.ts](../lib/tts/voices.ts) holds the catalogue. Two ids exist,
`dispositivo`, `vitoria` and `contador`, and they are what
`profiles.preferred_voice` stores.

Never rename one and never re-cast one onto a different-sounding voice by
accident. Both are silent failures of the same kind: the parent chose a narrator
for their child, and one day a stranger reads the bedtime story. The provider and
its own id are separate fields precisely so a voice can move between providers —
`vitoria` on Google today, on ElevenLabs the day someone pays — without touching a
single stored profile. Moving a voice deliberately is fine; it changes how it
sounds, so say so where parents can see it.

The same applies to `DEFAULT_VOICE_ID`. It is `dispositivo` so that a fresh clone
narrates with no account at all. Changing it silently changes the narrator of
every profile that never picked one, which makes it a decision to record here
rather than a tweak.

A male voice does not contradict the constitution's "Você é a NARRADORA". The
narrator never refers to herself — that is a limit in
[story-bible.md](story-bible.md) — so nothing the child hears is gendered, and the
word only ever addresses the model.

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
