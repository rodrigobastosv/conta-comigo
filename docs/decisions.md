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

## The narration unit is the sentence, not the scene

Every complete sentence is emitted the moment it closes, in
[lib/generate-scene.ts](../lib/generate-scene.ts), and
[lib/tts/queue.ts](../lib/tts/queue.ts) speaks it while the rest of the scene is
still being written. Measured in a real browser: **the first sentence starts
speaking 6.4 seconds before the scene finishes generating.**

The alternative was synthesizing the scene's audio once it was complete, and then
the child faces those 6.4 seconds as silence. That is the entire reason the event
is per sentence, and it is why the queue serialises playback itself instead of
waiting for a scene to be whole.

The queue's two jobs are both invisible when they work:

- **Order.** A sentence waits for its predecessor even if its own audio is ready
  first — which the server tier will cause constantly once it fetches in
  parallel.
- **Silence on demand.** Choosing an option stops the voice in the same tick. A
  leftover sentence narrating over the next scene is the most jarring thing this
  feature can do.

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

### Licensing, now that nothing is stored

Since the narration is never kept (see below), the only right we need is the right
to generate audio and play it to the family that asked for it. All three tiers
grant that plainly.

What went away with the cache: Google's guidance covers per-request generation for
one end user but draws a line at "rebundling as a media library", and a stored
per-family archive sat close enough to that line to need a lawyer. Not storing is
the cheapest possible answer to that question.

**The ElevenLabs free tier is not a fourth rung, and storage is not the reason.**
It is restricted to personal, non-commercial use and requires attribution when
you publish — neither of which is unlocked by keeping no files. But the binding
constraint is arithmetic: 10,000 credits a month is about 10 minutes of audio, an
`ouvir` scene read slowly runs about a minute, so a five-scene story is ~5 minutes.
That is **roughly two stories a month**, against Google's ~285. It is fine for
trying a voice out; it is not a tier anyone can read bedtime stories on.

### The numbers above are vendor claims

Nobody has had an account on any of them yet, so nothing here is measured.
[scripts/bench-tts.ts](../scripts/bench-tts.ts) measures time to first playable
audio for whichever providers are configured, from where the users are, on real
sentences. Run it and paste the table here. Vendor marketing is not evidence.

## The narration is not stored anywhere

Every listen re-synthesizes. There is no audio file, no Storage bucket, no
`audio_url`, no `audio_hash` — the schema deliberately has no audio columns.
**The text is the archive.**

The original design cached audio keyed by a hash of (text + voice + model). The
arithmetic did not support it:

| Tier | Cost of one full re-listen (~3.5k chars) | What a cache saves |
| --- | --- | --- |
| Device voice (the default) | nothing | nothing — there is no file to store |
| Google, inside the free quota | nothing | nothing, until ~285 listens/month |
| ElevenLabs paid | ~$0.18 | ~$0.18, per repeat of the same scene in the same voice |

So a cache pays only on a metered provider, only for a repeat listen, and only
while the voice is unchanged — change the voice and it was invalid anyway.

**And dropping it costs no latency at all**, which is what settles it. Synthesis is
per sentence, so a re-listen pays exactly what the first listen paid, and the first
listen already has to meet the 1–2 s budget. Re-synthesizing is not a degraded
experience; it is an identical one.

What not storing buys, beyond the machinery it deletes:

- **Less of a child's data at rest.** Audio of a child's stories is more personal
  data to secure, to cover with RLS, and to erase when an account is deleted.
- **The Google licensing question disappears.** Nothing stored, nothing to argue
  about.
- **A schema mismatch dissolves.** `audio_url`/`audio_hash` were per *scene* while
  synthesis is per *sentence*; caching properly needed a related table.

**Bring it back when** we are on a metered provider *and* measurement shows repeat
listens of the same scene in the same voice are common. Both halves matter, and
both are measurable — do not re-add this on a hunch. Adding a nullable column
later is a trivial migration; the cost of guessing wrong now is a Storage bucket
full of children's voices we never needed.

The one real thing lost: a stored file would preserve the exact reading a child
heard, which is a keepsake argument for a product built on re-reading. If that is
what someone wants later, it is a feature ("save this story"), not a cache.

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

## Both audio permissions are taken on the one gesture there is

On iOS, audio only plays after a user gesture, and `speechSynthesis` and the
`AudioContext` ask for that permission **separately**. The gesture exists exactly
once per session — the "Começar a história" tap — so
[lib/audio.ts](../lib/audio.ts) spends it on both: it resumes an `AudioContext`
and speaks an empty utterance at zero volume.

The child hears nothing from either. What they buy is that the iPad talks at all.
Miss this and the symptom is the first scene coming out silent on iOS and nowhere
else, with no error anywhere — iOS does not reject a `speak()` made outside a
gesture, it ignores it.

The `AudioContext` half still has no consumer: the device voice does not need it.
It is there for the server tier (issue #12), which will play real audio files.
Leave it.

## A cartoon voice is not a bedtime voice

[lib/tts/speaker.ts](../lib/tts/speaker.ts) does not take the first pt-BR voice
the device offers. On macOS that is **Eddy**, one of Apple's novelty voices, and
the natural one — **Luciana** — is eight entries further down the list. Apple
ships that same joke set in every language, so this is not a macOS quirk to shrug
at.

The picker prefers a small list of known-good narrators per platform, then any
plain voice, and only then a novelty one — because a cartoon voice is still
better than no story. `pickDeviceVoice` is a pure function with the real macOS
voice list as its test fixture, so this stays fixed.

## The reading-level rules are numeric on purpose

"Suitable for a 5-year-old" is not testable. "Average sentence of at most 14
words" and "90 to 140 words in this scene" are.

That is what [scripts/eval.ts](../scripts/eval.ts) measures on every prompt
change. A rule that cannot be measured does not go into
[lib/prompts/v1.ts](../lib/prompts/v1.ts).

### What the first run found

`v2` scores **4/10**, and the failures are not random — they say the prompt and
its own rules disagree:

- **`ouvir` sentences come out shorter than the rule allows.** Four of the six
  `ouvir` cases land between 5.8 and 7.7 mean words per sentence, against a floor
  of 8. The same prompt that sets that floor also says *"Uma ideia por frase"*,
  and one idea in Portuguese, for a five-year-old, is usually under eight words.
  The instruction is pulling against itself.
- **Choice labels occasionally run to 5 words** where `ouvir` allows 2–4.
- Word counts are inside range in all ten, the refrain appears in all ten, and
  **no case needed a second attempt** — the structural contract is solid; it is
  the prose targets that are off.

Both turned out to be the rule's fault, not the narrator's, and both for the same
reason: a word count calibrated on English intuition, applied to Portuguese. `v3`
fixes the two numbers and scores **8/10**. The two that still fail are labels that
genuinely ran away — *"Levar o óculos pra rua e seguir o barulho"* is two actions
joined by an *e* — which is the ceiling doing its job rather than firing on
well-formed prose.

### Why `v3` removed the floor instead of lowering it

Reading the scenes that failed settles it, and settles it the other way from what
"the model is undershooting" suggests. The 5.8 came from this:

> *Tique, tique, tique.* … *— Meu! — disse a gralha.* … *Silêncio. Não latiu.*

That is not a narrator falling short of a target. That is the rhythm of reading
out loud — the pause, the one-word beat, the line of dialogue — and the floor was
scoring it as a defect. A floor on mean sentence length can only be satisfied by
padding, and padding is the opposite of what `ouvir` is for.

So `ouvir` keeps the ceiling and loses the minimum. **What tires a five-year-old's
ear is the long sentence, never the short one**, and there was never a product
reason to want the average pulled up. Put the floor back and you are asking the
narrator to write worse.

This also closes the wording gap that was open here: the document said "average
sentence", the prompt said *"Frases de 8 a 14 palavras"* — every sentence. The
prompt now asks for a per-sentence ceiling and the evaluation scores the mean,
with `longest-sentence` as a warning for the outlier the mean hides. Failing a
whole scene over one 15-word sentence would make the evaluation flaky without
making a single story better.

### Why the choice-label ceiling went from 4 words to 5

Same disease, and it needed the labels to diagnose — the violation used to report
the count alone, which cannot tell a rule the model broke from a rule that is
wrong. It reports the label now. These are what broke a 2–4 word ceiling:

> *"Seguir o faro do Farelo"* · *"Abrir a gaveta da luva"* ·
> *"Colocar no banco da praça"* · *"Levar o chinelo na mão"*

Every one is verb-first, concrete and drawable — the thing the rule is actually
protecting. They run to five words because **Portuguese spends a word on the
article and the preposition where English spends none**: *"Abrir a gaveta **da**
luva"* is structurally the same label as the approved *"Abrir a porta azul"*, one
word longer only because the noun is qualified by another noun instead of an
adjective.

The proof that the count was never the real criterion is that the bible's own
rejected example, *"Investigar a origem do som"*, is **also five words**. Same
length, and it fails for the reason that matters: *origem do som* cannot be drawn.
So the prose now names the criterion — can the child draw it? — and uses the two
five-word examples to show that length does not separate them. The ceiling stays
as a cheap guard against a label that runs away, not as the test.

The visualisable half stays a human judgment. It is not automatable, and a check
that guesses at it would cry wolf; see the note on precision in
[lib/eval/rules.ts](../lib/eval/rules.ts).

### The rules are a transcription, not an opinion

[lib/eval/rules.ts](../lib/eval/rules.ts) restates the numbers from
[lib/prompts/v1.ts](../lib/prompts/v1.ts). Change one without the other and the
evaluation is measuring a rule the model was never given — which is the one
failure mode that makes an evaluation actively harmful. Same reason the ten cases
are fixed: **never edit a case to make a run pass.**

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
