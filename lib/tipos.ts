/** Modo de leitura do perfil ativo. Um texto só é gerado por cena; o áudio nivela o resto. */
export type NivelLeitura = "ouvir" | "ler";

/** 1..5 — ver a estrutura de batidas na bíblia da história. A batida 5 encerra a partida. */
export type Batida = 1 | 2 | 3 | 4 | 5;

export const BATIDA_FINAL: Batida = 5;

export type Escolha = {
  rotulo: string;
  /** Um emoji. Vira ilustração de verdade depois do MVP. */
  icone: string;
};

export type Cena = {
  texto: string;
  fatos_novos: string[];
  /** Exatamente 2, exceto na batida final, onde é vazia. */
  escolhas: Escolha[];
};

/** Uma cena já situada no grafo — o que vai para o banco. */
export type CenaNoGrafo = Cena & {
  id: string;
  cenaPaiId: string | null;
  batida: Batida;
  promptVersao: string;
  /** Rótulo da escolha que levou até aqui. Null na primeira cena. */
  escolhaDeEntrada: string | null;
};

export type PedidoDeCena = {
  batida: Batida;
  nivelLeitura: NivelLeitura;
  nomeAjudante: string;
  /** Fatos acumulados no caminho, do pai até a raiz. Camada 3 do story bible. */
  fatos: string[];
  /** Rótulo da escolha que a criança acabou de fazer. Null na batida 1. */
  escolhaFeita: string | null;
  /**
   * Restrições extra da família (medos a evitar, nomes proibidos).
   * Vazio hoje; o modo dos pais preenche isto depois sem tocar no prompt.
   */
  restricoesExtra?: string[];
};
