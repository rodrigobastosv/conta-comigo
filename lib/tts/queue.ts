// Relative, with the extension, and not the `@/` alias on purpose: `npm test`
// runs this file through `node --experimental-strip-types`, which does not
// resolve tsconfig paths.
import type { Speaker } from "./speaker.ts";

/**
 * Plays sentences in order, as they arrive, while the rest of the scene is still
 * being generated. This is the client half of the narration design: the model
 * emits a `sentence` event the moment a sentence closes, and this queue turns
 * that into sound without waiting for the scene to finish.
 *
 * Two things it exists to guarantee, both of which are bugs a child would notice
 * before we would:
 *
 * 1. **Order.** Sentence 3 can be ready before sentence 2 — it will be, once the
 *    server tier fetches audio in parallel (issue #12). The story must never be
 *    read out of order, so a sentence waits for its predecessor even if its own
 *    audio is ready first.
 * 2. **Silence on demand.** Choosing an option, going back, or starting over must
 *    stop the voice immediately. A leftover sentence narrating over the next
 *    scene is the most jarring thing this feature can do.
 *
 * Playback is serialised — speak one, wait, speak the next — rather than handed
 * to the platform's own queue. It costs a small pause between sentences, which
 * for a bedtime story reads as breathing, and it buys one code path that works
 * for both the device voice and a future streaming provider.
 */
export class PlaybackQueue {
  private readonly waiting = new Map<number, string>();
  private next = 0;
  private pumping = false;
  private stopped = false;
  /** Kept so `replay()` can repeat the sentence a child missed. */
  private current: string | null = null;

  private readonly speaker: Speaker;
  /** Called with the index being spoken, and with null when the queue drains. */
  private readonly onSpeaking: (index: number | null) => void;

  // Assigned in the body rather than declared as constructor parameter
  // properties: `npm test` runs this through node's strip-only type stripping,
  // which rejects `constructor(private x: T)` outright.
  constructor(
    speaker: Speaker,
    onSpeaking: (index: number | null) => void = () => {},
  ) {
    this.speaker = speaker;
    this.onSpeaking = onSpeaking;
  }

  /** Hand over a sentence. Safe to call out of order and before playback starts. */
  push(index: number, text: string): void {
    if (this.stopped) return;
    this.waiting.set(index, text);
    /**
     * On arrival, not on its turn. A server voice fetches its audio here, so by
     * the time this sentence is reached its sound is already decoded — which is
     * what keeps the gap between two sentences a breath rather than a round
     * trip. Order is still this queue's to decide; only the fetching is early.
     */
    this.speaker.prime?.(text);
    void this.pump();
  }

  /**
   * Stop now and forget everything pending. The queue is single-use after this:
   * a new scene gets a new queue, so a cancelled sentence can never resurface.
   */
  stop(): void {
    this.stopped = true;
    this.waiting.clear();
    this.current = null;
    this.speaker.cancel();
    this.onSpeaking(null);
  }

  pause(): void {
    this.speaker.pause();
  }

  resume(): void {
    this.speaker.resume();
  }

  /**
   * Say the current sentence again. The one control a small child actually uses —
   * they miss a word and want that bit repeated, not the whole scene.
   */
  replay(): void {
    if (this.stopped || !this.current) return;
    this.speaker.cancel();
    void this.speaker.speak(this.current);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;

    try {
      while (!this.stopped && this.waiting.has(this.next)) {
        const text = this.waiting.get(this.next)!;
        this.waiting.delete(this.next);
        this.current = text;
        this.onSpeaking(this.next);

        await this.speaker.speak(text);

        // stop() may have landed while we were speaking. Advancing here would
        // start the next sentence over a scene the child has already left.
        if (this.stopped) return;
        this.next += 1;
      }

      if (!this.stopped) {
        this.current = null;
        this.onSpeaking(null);
      }
    } finally {
      this.pumping = false;
    }
  }
}
