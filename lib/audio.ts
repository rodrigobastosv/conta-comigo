/**
 * On iOS, audio only plays after a user gesture. If you find that out only when
 * narration lands, the first scene comes out silent on the iPad and nowhere else.
 * The "Começar a história" button calls this and the problem stops existing.
 */
let context: AudioContext | null = null;

export function unlockAudio(): void {
  unlockSpeech();

  if (context) return;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;

  context = new Ctor();
  void context.resume();
}

export function audioContext(): AudioContext | null {
  return context;
}

/**
 * `speechSynthesis` needs the same permission as the `AudioContext` above, and
 * asks for it separately: on iOS the first `speak()` must happen inside a user
 * gesture, or every later call is silently ignored. Not thrown — ignored, which
 * is why this is easy to miss until an iPad is the only device that never talks.
 *
 * Speaking an empty utterance at zero volume is the cheapest way to spend the
 * gesture we already have. The child hears nothing; the browser records that
 * permission was granted.
 *
 * The queue itself is in lib/tts/queue.ts. This is only the unlock, and it has to
 * live on the gesture — which happens exactly once per session, on that button.
 */
function unlockSpeech(): void {
  if (typeof window.speechSynthesis === "undefined") return;

  const silence = new SpeechSynthesisUtterance("");
  silence.volume = 0;
  window.speechSynthesis.speak(silence);
  window.speechSynthesis.cancel();
}
