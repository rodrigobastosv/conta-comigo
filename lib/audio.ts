/**
 * No iOS o áudio só toca depois de um gesto do usuário. Se você só descobrir isso
 * quando a narração entrar, a primeira cena vai sair muda no iPad e em nenhum outro
 * lugar. O botão "Começar a história" chama isto e o problema deixa de existir.
 */
let contexto: AudioContext | null = null;

export function desbloquearAudio(): void {
  if (contexto) return;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;

  contexto = new Ctor();
  void contexto.resume();
}

export function contextoDeAudio(): AudioContext | null {
  return contexto;
}
