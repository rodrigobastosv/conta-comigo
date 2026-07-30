import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente único. Só existe em código de servidor — a chave nunca vai para o browser.
 */
export const anthropic = new Anthropic();

export const MODELO = "claude-opus-5";

/**
 * Streaming, então max_tokens pode ser generoso sem risco de timeout de HTTP.
 * Uma cena no modo `ler` fica em ~350 tokens; o resto é folga para o thinking.
 */
export const MAX_TOKENS = 4000;

/**
 * `low` é o ponto de partida: em cena curta com formato rígido ele entrega bem e
 * o primeiro token chega rápido, que é o que importa aqui. Suba para `medium` se
 * a avaliação mostrar que as escolhas estão ficando desequilibradas.
 */
export const EFFORT = "low" as const;
