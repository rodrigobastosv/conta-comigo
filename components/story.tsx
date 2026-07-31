"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  branchTo,
  isForbiddenName,
  type ChildProfile,
  type StoryRead,
} from "@/lib/archive";
import { unlockAudio } from "@/lib/audio";
import { readSSE } from "@/lib/sse";
import { supabase } from "@/lib/supabase/browser";
import { Pisca } from "./pisca";
import { sentenceRange } from "@/lib/tts/highlight";
import { PlaybackQueue } from "@/lib/tts/queue";
import { BIBLES, DEFAULT_BIBLE_ID, bibleById } from "@/lib/story-bibles";
import { SEEDS } from "@/lib/story-bibles/original";
import { deviceSpeechAvailable, speakerFor } from "@/lib/tts/speaker";
import { kindOf, type Voice } from "@/lib/tts/types";
import {
  DEFAULT_VOICE_ID,
  VOICES,
  defaultVoice,
  preferredVoice,
} from "@/lib/tts/voices";
import {
  FINAL_BEAT,
  type Beat,
  type Scene,
  type ReadingLevel,
  type World,
} from "@/lib/types";

/**
 * A node of the path travelled.
 *
 * `sceneId` is what the server needs to place the next scene in the graph, and
 * it is null in two cases that both have to keep working: a deployment with no
 * archive, and a scene whose write failed. In either case the client falls back
 * to carrying the facts itself, which is what the in-memory path has always
 * done.
 */
type PathNode = {
  beat: Beat;
  scene: Scene;
  entryChoice: string | null;
  sceneId: string | null;
};

type Phase = "start" | "generating" | "reading" | "end" | "book";

/**
 * The signed-in adult's token, for the route to act on their behalf.
 *
 * Read fresh on every request rather than held in state: supabase-js refreshes
 * it in the background, and a token captured when the screen mounted is exactly
 * the one that has expired by the fourth beat of a bedtime story.
 */
async function authorization(): Promise<Record<string, string>> {
  const db = supabase();
  if (!db) return {};

  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function Story({
  profile,
  resumeEntry = null,
  onHome,
}: {
  profile: ChildProfile | null;
  /** A story to pick up immediately, chosen on the home screen. */
  resumeEntry?: StoryRead | null;
  onHome?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("start");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<ReadingLevel>(
    profile?.readingLevel ?? "ouvir",
  );
  const [bibleId, setBibleId] = useState(DEFAULT_BIBLE_ID);
  const [seedId, setSeedId] = useState<string | null>(null);
  /**
   * The world beat 1 invented, kept for the rest of the run. It is layer 2 of
   * this story: it goes back up on every later beat, alongside the facts, and
   * losing it would leave beats 2–5 with no world at all.
   */
  const [world, setWorld] = useState<World | null>(null);
  const [path, setPath] = useState<PathNode[]>([]);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const [narrating, setNarrating] = useState(false);
  const [paused, setPaused] = useState(false);
  /** Index of the sentence being read aloud, for the highlight. */
  const [spoken, setSpoken] = useState<number | null>(null);
  /** Sentences of the current scene, in order, as the server closes them. */
  const [sentences, setSentences] = useState<string[]>([]);

  /**
   * The voices this deployment can actually speak. Starts as the device voice
   * alone — the one that needs no account — and the effect below replaces it
   * with what the server says it has credentials for.
   *
   * Not a build-time value and not a guess: offering a voice we cannot
   * synthesize is worse than offering fewer, because the parent picks it and the
   * story goes silent.
   */
  const [voices, setVoices] = useState<Voice[]>([defaultVoice()]);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);

  const queue = useRef<PlaybackQueue | null>(null);
  /**
   * Whether the child wants to be read to — the same value as `narrating`, kept
   * in a ref because the SSE loop below runs for the whole scene and would
   * otherwise be deciding with whatever the state was when it started.
   *
   * Intent and playback are separate on purpose: stopping the voice must not
   * turn narration off, or every choice would silently switch it off for good.
   */
  const wantsNarration = useRef(false);

  const current = path[path.length - 1] ?? null;
  const voice = voices.find((v) => v.id === voiceId) ?? voices[0] ?? null;

  /**
   * Ask the server which voices it has keys for, once.
   *
   * A failure here is not an error the child should see: the list simply stays
   * at the device voice, which always works. Narration is an enhancement to a
   * working product, never a dependency of it.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/voices");
        if (!response.ok) return;
        const { voices: ids } = (await response.json()) as { voices: string[] };
        if (cancelled) return;

        // Resolved against the catalogue rather than trusted as a list of
        // objects: labels and tiers have one home, and an id this build does not
        // know is simply dropped.
        const offered = VOICES.filter(
          (v) =>
            ids.includes(v.id) &&
            (kindOf(v) !== "device" || deviceSpeechAvailable()),
        );

        /**
         * Set even when it comes back empty — that is a browser with no
         * `speechSynthesis` on a deployment with no key, and there the honest
         * answer is no "ler pra mim" button at all. Keeping the device voice
         * here would offer a narrator that cannot speak.
         *
         * Different from the `catch` below, which is a fetch that never
         * answered: there the device voice stands, because nothing was learned.
         */
        setVoices(offered);
        if (offered.length > 0) setVoiceId(preferredVoice(offered).id);
      } catch {
        // Offline, or the route is not there. The device voice stands.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Stop the voice now. Says nothing about whether narration stays on. */
  const silence = useCallback(() => {
    queue.current?.stop();
    queue.current = null;
    setSpoken(null);
    setPaused(false);
  }, []);

  /** A queue is single-use: every scene gets a fresh one, so nothing leaks across. */
  const startQueue = useCallback(() => {
    queue.current?.stop();
    // `speakerFor` is the one branch between a voice that costs nothing and one
    // that costs money. Everything below it is the same code for both.
    queue.current = new PlaybackQueue(
      speakerFor(voice ?? defaultVoice()),
      setSpoken,
    );
    setPaused(false);
    return queue.current;
  }, [voice]);

  const setNarration = useCallback((on: boolean) => {
    wantsNarration.current = on;
    setNarrating(on);
  }, []);

  // Leaving the page mid-sentence must not keep talking.
  useEffect(() => silence, [silence]);

  const generate = useCallback(
    async (
      beat: Beat,
      choiceMade: string | null,
      base: PathNode[],
      // Passed in rather than read from state on beat 1: `begin` clears the world
      // of the previous run, and the clear has not landed yet when it calls this.
      knownWorld: World | null,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setError(null);
      setPartial("");
      setSentences([]);
      setPhase("generating");

      // Whatever was being read belongs to the scene we are leaving.
      silence();
      if (wantsNarration.current) startQueue();

      try {
        /**
         * The two dialects. With an archive the server owns the story's history
         * — it climbs the graph from the parent's id for the facts and the world
         * — and sending them from here as well would be a 400, on purpose. See
         * the note at the top of lib/scene-route.ts.
         */
        const parent = base[base.length - 1]?.sceneId ?? null;
        const archived = profile !== null && (beat === 1 || parent !== null);

        const response = await fetch("/api/scene", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authorization()),
          },
          body: JSON.stringify({
            bibleId,
            beat,
            readingLevel: level,
            helperName: name.trim() || "Ajudante",
            seedId: beat === 1 ? seedId : null,
            choiceMade,
            ...(archived
              ? {
                  profileId: beat === 1 ? profile.id : null,
                  parentSceneId: parent,
                }
              : {
                  world: knownWorld,
                  facts: base.flatMap((node) => node.scene.new_facts),
                }),
          }),
        });

        if (!response.ok) {
          setError("A história não começou. Tente de novo.");
          setPhase(base.length ? "reading" : "start");
          return;
        }

        for await (const { event, data } of readSSE(response)) {
          if (event === "text") {
            setPartial((t) => t + (data as { delta: string }).delta);
            setPhase("reading");
          } else if (event === "sentence") {
            // The narration hook. The sentence is spoken while the rest of the
            // scene is still being generated — that is the whole design, and it
            // is why the server emits per sentence instead of per scene.
            const { index, text } = data as { index: number; text: string };
            setSentences((s) => [...s, text]);
            if (wantsNarration.current) queue.current?.push(index, text);
          } else if (event === "scene") {
            const { scene, sceneId } = data as {
              scene: Scene;
              sceneId?: string | null;
            };
            // Only beat 1 of an invented world carries one, and it has to
            // survive every later beat of this run.
            if (scene.world) setWorld(scene.world);
            setPath([
              ...base,
              {
                beat,
                scene,
                entryChoice: choiceMade,
                sceneId: sceneId ?? null,
              },
            ]);
            setPartial("");
            setPhase(beat === FINAL_BEAT ? "end" : "reading");
          } else if (event === "error") {
            setError("Algo se perdeu no caminho. Tente de novo.");
            setPhase(base.length ? "reading" : "start");
          }
        }
      } catch {
        setError("Sem conexão.");
        setPhase(base.length ? "reading" : "start");
      } finally {
        inFlight.current = false;
      }
    },
    [bibleId, level, name, profile, seedId, silence, startQueue],
  );

  /**
   * Picks a story back up where it stopped.
   *
   * The path is rebuilt from the graph, not from anything the browser kept: the
   * text, the choices and the beat come back exactly as they were, and so does
   * the world, which is what an invented run would otherwise lose on a reload.
   */
  async function resume(entry: StoryRead) {
    const db = supabase();
    if (!db || !entry.tip) return;

    unlockAudio();
    const branch = await branchTo(db, entry.tip.id);
    if (branch.length === 0) return;

    setBibleId(entry.story.bibleId);
    setName(entry.story.helperName);
    setWorld(entry.story.world);
    setNarration(level === "ouvir" && voice !== null);
    setPath(
      branch.map((scene) => ({
        beat: scene.beat,
        scene: {
          text: scene.text,
          world: null,
          new_facts: scene.newFacts,
          choices: scene.choices,
        },
        entryChoice: scene.entryChoice,
        sceneId: scene.id,
      })),
    );
    setSentences([]);
    setPartial("");
    setPhase(branch[branch.length - 1].beat === FINAL_BEAT ? "end" : "reading");
  }

  /**
   * A story chosen on the home screen, picked up once.
   *
   * Keyed on the entry's id rather than run on mount: the same component stays
   * mounted while the family moves between stories, and re-running this on
   * every render would restart the story under the child's finger.
   */
  const resumed = useRef<string | null>(null);
  useEffect(() => {
    if (!resumeEntry || resumed.current === resumeEntry.story.id) return;
    resumed.current = resumeEntry.story.id;
    void resume(resumeEntry);
    // `resume` is redefined every render and is not a dependency worth chasing;
    // the ref above is what makes this run exactly once per story.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeEntry]);

  function begin() {
    /**
     * The same rule as the server's, said nicely.
     *
     * The route refuses this too, and that is the one that counts — this check
     * exists so the child hears "escolhe outro" instead of watching a story fail
     * to start for a reason nobody explained.
     */
    if (
      profile &&
      isForbiddenName(name.trim() || "Ajudante", profile.forbiddenNames)
    ) {
      setError("Esse nome a gente não usa aqui. Escolhe outro?");
      return;
    }

    unlockAudio();
    // In `ouvir` mode the child is not reading the screen, so narration is the
    // product; in `ler` mode it is an offer.
    setNarration(level === "ouvir" && voice !== null);
    setPath([]);
    setWorld(null);
    void generate(1, null, [], null);
  }

  function choose(label: string) {
    const next = ((current?.beat ?? 0) + 1) as Beat;
    void generate(next, label, path, world);
  }

  /**
   * The whole point of the graph: go back one scene and take the other choice.
   * Nothing is overwritten — the parent stays there, it just gains another child.
   */
  function goBackOne() {
    silence();
    const base = path.slice(0, -1);
    setPath(base);
    setPartial("");
    setSentences([]);
    setPhase(base.length ? "reading" : "start");
    // Backing out past beat 1 leaves no scene that world belongs to, and the
    // start screen would otherwise still be titled with the story just left.
    if (base.length === 0) setWorld(null);
  }

  /** Turning it on mid-scene reads from the top: "me lê essa parte de novo". */
  function toggleNarration() {
    if (narrating) {
      setNarration(false);
      silence();
      return;
    }

    setNarration(true);
    const fresh = startQueue();
    sentences.forEach((text, index) => fresh.push(index, text));
  }

  function togglePause() {
    if (paused) {
      queue.current?.resume();
      setPaused(false);
    } else {
      queue.current?.pause();
      setPaused(true);
    }
  }

  const generating = phase === "generating";
  const textOnScreen = partial || current?.scene.text || "";
  // A device with no `speechSynthesis` and a deployment with no key leave the
  // list empty, and then there is nothing to offer to read aloud.
  const canNarrate = voice !== null;

  const bible = bibleById(bibleId);
  /**
   * An invented world ships a promise as its title ("uma história nova") and
   * beat 1 replaces it with the real one. Watching the title arrive is the
   * moment the child sees the story became hers.
   */
  const headerTitle = world?.title ?? bible?.title ?? "";

  // Highlight only while a sentence is actually being read.
  const range =
    narrating && spoken !== null
      ? sentenceRange(textOnScreen, sentences, spoken)
      : null;

  return (
    <>
      {headerTitle && (
        <header className="mb-6">
          <h1 className="text-2xl font-normal">{headerTitle}</h1>
        </header>
      )}

      {phase === "start" && (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-lg">
              Como você quer se chamar nessa história?
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="pode ser um nome inventado"
              maxLength={40}
              className="rounded-xl border-2 border-ink/15 bg-white/60 px-4 py-3 text-xl outline-none focus:border-shop"
            />
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg">Qual história?</legend>
            {BIBLES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setBibleId(option.id)}
                className={`rounded-xl border-2 px-4 py-3 text-left text-lg transition ${
                  bibleId === option.id
                    ? "border-shop bg-shop/10"
                    : "border-ink/15 bg-white/40"
                }`}
              >
                {option.title}
                {option.invented && (
                  <span className="block text-sm text-shop/70">
                    ninguém leu essa ainda
                  </span>
                )}
              </button>
            ))}
          </fieldset>

          {/* The seed is only the first sentence — the choices are what grow the
              story. That is why it is one tap from a closed list and not a
              question a five-year-old has to answer in writing. */}
          {bible?.invented && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-lg">De onde a gente começa?</legend>
              <div className="grid grid-cols-2 gap-2">
                {SEEDS.map((seed) => (
                  <button
                    key={seed.id}
                    type="button"
                    onClick={() =>
                      setSeedId(seedId === seed.id ? null : seed.id)
                    }
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-4 text-center text-base transition ${
                      seedId === seed.id
                        ? "border-shop bg-shop/10"
                        : "border-ink/15 bg-white/40"
                    }`}
                  >
                    <span aria-hidden className="text-3xl">
                      {seed.icon}
                    </span>
                    <span>{seed.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSeedId(null)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-4 text-center text-base transition ${
                    seedId === null
                      ? "border-shop bg-shop/10"
                      : "border-ink/15 bg-white/40"
                  }`}
                >
                  <span aria-hidden className="text-3xl">
                    🎲
                  </span>
                  <span>Me surpreenda</span>
                </button>
              </div>
            </fieldset>
          )}

          <fieldset className="flex gap-3">
            {(["ouvir", "ler"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLevel(option)}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-lg transition ${
                  level === option
                    ? "border-shop bg-shop/10"
                    : "border-ink/15 bg-white/40"
                }`}
              >
                {option === "ouvir" ? "Quero ouvir" : "Quero ler"}
              </button>
            ))}
          </fieldset>

          {/* Only when there is a real choice. On a deployment with no key the
              device voice is the whole list, and a picker with one option is a
              question with one answer. */}
          {voices.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-lg">Quem vai ler pra você?</legend>
              {voices.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setVoiceId(option.id)}
                  aria-pressed={voiceId === option.id}
                  className={`rounded-xl border-2 px-4 py-3 text-left text-lg transition ${
                    voiceId === option.id
                      ? "border-shop bg-shop/10"
                      : "border-ink/15 bg-white/40"
                  }`}
                >
                  {option.label}
                  <span className="block text-sm text-shop/70">
                    {option.description}
                  </span>
                </button>
              ))}
            </fieldset>
          )}

          <button
            type="button"
            onClick={begin}
            disabled={generating}
            className="rounded-2xl bg-shop px-6 py-5 text-2xl text-paper disabled:opacity-50"
          >
            Começar a história
          </button>

          {onHome && (
            <button
              type="button"
              onClick={onHome}
              className="self-center text-lg text-shop underline"
            >
              Voltar
            </button>
          )}

          {error && <p className="text-center text-shop">{error}</p>}
        </section>
      )}

      {/* The little book: the path travelled, start to finish. A plain scroll of
          the scenes in order, which is most of the value of an archive — she
          reads back the story she made, including the parts she chose. */}
      {phase === "book" && (
        <section className="flex flex-1 flex-col gap-8">
          {path.map((node) => (
            <article
              key={node.sceneId ?? node.beat}
              className="flex flex-col gap-2"
            >
              {node.entryChoice && (
                <p className="text-base text-shop/70">
                  Você escolheu: {node.entryChoice}
                </p>
              )}
              <p className="whitespace-pre-wrap text-xl leading-relaxed md:text-2xl">
                {node.scene.text}
              </p>
            </article>
          ))}

          <button
            type="button"
            onClick={() => setPhase("end")}
            className="rounded-2xl border-2 border-shop bg-white/60 px-5 py-4 text-xl"
          >
            Voltar
          </button>
        </section>
      )}

      {(phase === "generating" || phase === "reading" || phase === "end") && (
        <section className="flex flex-1 flex-col gap-8">
          {/* The one empty moment in the story view: the model is thinking and
              there is no prose yet, so there is no narrator for Pisca to be
              confused with. It goes the instant the first token lands — a
              mascot beside a scene would make the narrator a character, which
              the constitution forbids. See components/pisca.tsx. */}
          {generating && !textOnScreen && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Pisca size={112} mood="glowing" />
              <p className="text-lg text-muted">Começando a história…</p>
            </div>
          )}

          <p className="whitespace-pre-wrap text-xl leading-relaxed md:text-2xl">
            {range ? (
              <>
                {textOnScreen.slice(0, range[0])}
                <mark className="rounded bg-farelo/40 text-ink">
                  {textOnScreen.slice(range[0], range[1])}
                </mark>
                {textOnScreen.slice(range[1])}
              </>
            ) : (
              textOnScreen
            )}
            {generating && <span className="animate-pulse text-shop">▌</span>}
          </p>

          {canNarrate && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleNarration}
                aria-pressed={narrating}
                className={`rounded-xl border-2 px-4 py-3 text-base ${
                  narrating
                    ? "border-shop bg-shop/10"
                    : "border-ink/15 bg-white/40"
                }`}
              >
                {narrating ? "🔊 Lendo pra você" : "🔈 Ler pra mim"}
              </button>

              {narrating && (
                <>
                  <button
                    type="button"
                    onClick={togglePause}
                    className="rounded-xl border-2 border-ink/15 bg-white/40 px-4 py-3 text-base"
                  >
                    {paused ? "▶︎ Continuar" : "⏸ Pausar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => queue.current?.replay()}
                    className="rounded-xl border-2 border-ink/15 bg-white/40 px-4 py-3 text-base"
                  >
                    ↺ De novo
                  </button>
                </>
              )}
            </div>
          )}

          {phase === "reading" &&
            current &&
            current.scene.choices.length > 0 && (
              <div className="grid gap-3 pb-4">
                {current.scene.choices.map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    onClick={() => choose(choice.label)}
                    className="flex items-center gap-4 rounded-2xl border-2 border-ink/15 bg-white/60 px-5 py-5 text-left text-xl active:border-shop active:bg-shop/10"
                  >
                    <span aria-hidden className="text-4xl">
                      {choice.icon}
                    </span>
                    <span>{choice.label}</span>
                  </button>
                ))}
              </div>
            )}

          {phase === "end" && (
            <div className="grid gap-3 pb-4">
              <p className="text-center text-lg text-shop">Fim.</p>
              <button
                type="button"
                onClick={goBackOne}
                className="rounded-2xl border-2 border-shop bg-white/60 px-5 py-4 text-xl"
              >
                E se a gente tivesse escolhido diferente?
              </button>
              <button
                type="button"
                onClick={() => {
                  silence();
                  setPhase("book");
                }}
                className="rounded-2xl border-2 border-ink/15 bg-white/60 px-5 py-4 text-xl"
              >
                Ler a história inteira
              </button>
              <button
                type="button"
                onClick={begin}
                className="rounded-2xl bg-shop px-5 py-4 text-xl text-paper"
              >
                {bible?.invented ? "Outra história" : "Outra coisa perdida"}
              </button>
            </div>
          )}

          {error && <p className="text-center text-shop">{error}</p>}
        </section>
      )}
    </>
  );
}
