/**
 * On iOS, audio only plays after a user gesture. If you find that out only when
 * narration lands, the first scene comes out silent on the iPad and nowhere else.
 * The "Começar a história" button calls this and the problem stops existing.
 */
let context: AudioContext | null = null;

export function unlockAudio(): void {
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
