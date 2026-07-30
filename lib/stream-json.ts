/**
 * Saída estruturada + streaming têm um atrito real: o que chega no stream é JSON,
 * não prosa. Se você esperar o JSON fechar para mostrar algo, perde a latência que
 * o streaming existe para ganhar — e criança de 5 anos abandona em 3 segundos de
 * tela parada.
 *
 * Este leitor extrai UM campo string de um JSON que ainda está chegando, decodificando
 * escapes e sem nunca emitir meia sequência de escape. É o que permite exibir a cena
 * palavra por palavra e, junto com `Frases`, disparar o TTS por frase.
 */
export class LeitorDeCampo {
  private buffer = "";
  private cursor = -1; // posição da próxima coisa a decodificar; -1 = ainda não achamos o campo
  private fechado = false;
  private readonly marcador: string;

  constructor(campo: string) {
    this.marcador = `"${campo}"`;
  }

  get terminou(): boolean {
    return this.fechado;
  }

  /** Recebe um pedaço do JSON e devolve só o texto novo já decodificado. */
  empurrar(pedaco: string): string {
    if (this.fechado) return "";
    this.buffer += pedaco;

    if (this.cursor < 0) {
      const inicio = this.localizarAberturaDaString();
      if (inicio < 0) return "";
      this.cursor = inicio;
    }

    let saida = "";
    let i = this.cursor;

    while (i < this.buffer.length) {
      const c = this.buffer[i];

      if (c === '"') {
        this.fechado = true;
        i += 1;
        break;
      }

      if (c === "\\") {
        // Precisamos de pelo menos o caractere seguinte para saber o que é.
        if (i + 1 >= this.buffer.length) break;
        const escape = this.buffer[i + 1];

        if (escape === "u") {
          // \uXXXX precisa de 4 hex; se não chegaram todos, espere o próximo pedaço.
          if (i + 5 >= this.buffer.length) break;
          saida += String.fromCharCode(parseInt(this.buffer.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }

        saida += DESESCAPE[escape] ?? escape;
        i += 2;
        continue;
      }

      saida += c;
      i += 1;
    }

    this.cursor = i;
    return saida;
  }

  /** Acha `"campo"` seguido de `:` e da abertura da string; devolve o índice do 1º char do valor. */
  private localizarAberturaDaString(): number {
    const chave = this.buffer.indexOf(this.marcador);
    if (chave < 0) return -1;

    const doisPontos = this.buffer.indexOf(":", chave + this.marcador.length);
    if (doisPontos < 0) return -1;

    const abertura = this.buffer.indexOf('"', doisPontos + 1);
    if (abertura < 0) return -1;

    return abertura + 1;
  }
}

const DESESCAPE: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  '"': '"',
  "\\": "\\",
  "/": "/",
};

/**
 * Quebra texto em frases conforme ele chega. Cada frase completa é entregue uma
 * única vez — é a unidade que o TTS vai receber para tocar numa fila enquanto o
 * resto da cena ainda está sendo gerado.
 */
export class Frases {
  private pendente = "";

  empurrar(texto: string): string[] {
    this.pendente += texto;
    const prontas: string[] = [];

    // Fim de frase = pontuação final seguida de espaço/quebra de linha.
    const fimDeFrase = /[.!?…](?=[\s\n])/g;
    let corte = 0;
    let m: RegExpExecArray | null;

    while ((m = fimDeFrase.exec(this.pendente)) !== null) {
      const frase = this.pendente.slice(corte, m.index + 1).trim();
      if (frase) prontas.push(frase);
      corte = m.index + 1;
    }

    if (corte > 0) this.pendente = this.pendente.slice(corte);
    return prontas;
  }

  /** Chame no fim do stream: a última frase não tem espaço depois da pontuação. */
  drenar(): string[] {
    const resto = this.pendente.trim();
    this.pendente = "";
    return resto ? [resto] : [];
  }
}
