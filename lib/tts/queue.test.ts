import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlaybackQueue } from "./queue.ts";
import type { Speaker } from "./speaker.ts";

/**
 * A speaker that records what it was asked to say and lets the test decide when
 * each sentence "finishes" — which is the only way to exercise the window where
 * a child taps a choice mid-sentence.
 */
function fakeSpeaker() {
  const spoken: string[] = [];
  let finish: (() => void) | null = null;
  const calls = { cancel: 0, pause: 0, resume: 0 };

  const speaker: Speaker = {
    speak(text) {
      spoken.push(text);
      return new Promise<void>((resolve) => {
        finish = () => {
          finish = null;
          resolve();
        };
      });
    },
    cancel: () => {
      calls.cancel += 1;
      finish?.();
    },
    pause: () => {
      calls.pause += 1;
    },
    resume: () => {
      calls.resume += 1;
    },
  };

  return {
    speaker,
    spoken,
    calls,
    /** Let the sentence currently being spoken finish, and let the queue advance. */
    async finishOne() {
      finish?.();
      // Two turns: one for the speak() promise, one for the pump loop.
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("PlaybackQueue", () => {
  it("speaks sentences in order", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(0, "Um.");
    queue.push(1, "Dois.");
    await Promise.resolve();
    assert.deepEqual(f.spoken, ["Um."]);

    await f.finishOne();
    assert.deepEqual(f.spoken, ["Um.", "Dois."]);
  });

  // This is the case the server tier will produce constantly: audio for sentence
  // 3 comes back before sentence 2's. The story must not reorder itself.
  it("holds a sentence that arrives before its predecessor", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(2, "Três.");
    queue.push(0, "Um.");
    await Promise.resolve();
    assert.deepEqual(f.spoken, ["Um."], "must not jump to sentence 2");

    await f.finishOne();
    assert.deepEqual(f.spoken, ["Um."], "still waiting on sentence 1");

    queue.push(1, "Dois.");
    await Promise.resolve();
    assert.deepEqual(f.spoken, ["Um.", "Dois."]);

    await f.finishOne();
    assert.deepEqual(f.spoken, ["Um.", "Dois.", "Três."]);
  });

  it("starts speaking before the rest of the scene has arrived", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(0, "A loja apareceu.");
    await Promise.resolve();

    // The whole point: sound while the scene is still being generated.
    assert.deepEqual(f.spoken, ["A loja apareceu."]);
  });

  it("reports which sentence is being spoken, and when it goes quiet", async () => {
    const f = fakeSpeaker();
    const seen: (number | null)[] = [];
    const queue = new PlaybackQueue(f.speaker, (i) => seen.push(i));

    queue.push(0, "Um.");
    await Promise.resolve();
    await f.finishOne();

    assert.deepEqual(seen, [0, null]);
  });

  // A leftover sentence narrating over the next scene is the worst bug here.
  it("goes silent on stop and never speaks what was queued", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(0, "Um.");
    queue.push(1, "Dois.");
    await Promise.resolve();

    queue.stop();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(f.calls.cancel, 1);
    assert.deepEqual(f.spoken, ["Um."], "sentence 2 must never be spoken");
  });

  it("ignores anything pushed after stop", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.stop();
    queue.push(0, "Tarde demais.");
    await Promise.resolve();

    assert.deepEqual(f.spoken, []);
  });

  it("does not advance past a sentence that was cut off", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(0, "Um.");
    await Promise.resolve();
    queue.stop(); // resolves the in-flight speak, as a real cancel does
    await Promise.resolve();
    await Promise.resolve();

    queue.push(1, "Dois.");
    await Promise.resolve();
    assert.deepEqual(f.spoken, ["Um."]);
  });

  it("replays the current sentence", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(0, "Um.");
    await Promise.resolve();
    queue.replay();

    assert.deepEqual(f.spoken, ["Um.", "Um."]);
  });

  it("has nothing to replay once the scene is done", async () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.push(0, "Um.");
    await Promise.resolve();
    await f.finishOne();

    queue.replay();
    assert.deepEqual(f.spoken, ["Um."]);
  });

  it("passes pause and resume through", () => {
    const f = fakeSpeaker();
    const queue = new PlaybackQueue(f.speaker);

    queue.pause();
    queue.resume();

    assert.equal(f.calls.pause, 1);
    assert.equal(f.calls.resume, 1);
  });
});
