# Roadmap

O que ainda não existe, em ordem aproximada de importância. Cada item diz onde o
gancho já está, porque quase nada aqui começa do zero.

## Narração (TTS)

O maior buraco. No modo `ouvir` (~5 anos) a criança não lê a tela, então hoje o
produto só funciona de verdade no modo `ler`.

Pronto:

- Evento `frase` emitido por [lib/gerar-cena.ts](../lib/gerar-cena.ts) a cada
  frase que fecha, durante o streaming.
- `Frases` em [lib/stream-json.ts](../lib/stream-json.ts) quebrando o texto
  conforme ele chega.
- `AudioContext` já desbloqueado no gesto do usuário
  ([lib/audio.ts](../lib/audio.ts)), com `contextoDeAudio()` exportado para a
  fila usar.
- Colunas `cenas.audio_url` e `cenas.audio_hash` no schema, para cache por hash
  de (texto + voz + modelo).
- `perfis.voz_preferida`.

Falta: escolher o fornecedor de voz pt-BR, a rota que gera áudio por frase, e a
fila de reprodução no cliente — o handler do evento `frase` em
[components/historia.tsx](../components/historia.tsx) é um bloco vazio hoje.

A restrição de projeto: **primeiro som em 1–2s**, tocando a frase 1 enquanto a
frase 3 ainda está sendo gerada. Gerar o áudio da cena inteira depois de pronta é
a solução errada, e é por isso que o evento é por frase e não por cena.

## Persistência

[supabase/schema.sql](../supabase/schema.sql) está escrito e com RLS, e o app não
escreve nele. Hoje o caminho vive em `useState` e recarregar a página perde tudo.

Falta: gravar cena e ler o caminho de volta, e usar
`caminho_da_cena()` para montar os fatos em vez de acumular no cliente. Respeitar
`cenas_pai_escolha`: se a cena para aquele par (pai, escolha) já existe, reusar em
vez de regerar.

É o que transforma "uma sessão" em "o acervo cresce" — a premissa do produto.

## Pré-geração especulativa

Enquanto a criança lê a cena N, gerar as duas ramificações possíveis da cena N+1.
A escolha dela então revela conteúdo já pronto: latência percebida quase zero.

Custa duas gerações onde uma será usada. Faz sentido depois da persistência,
porque o ramo descartado não é desperdício — fica no acervo para quando ela voltar
e escolher o outro caminho.

## Modo dos pais

Histórico do que foi lido, e restrições por perfil (medos a evitar, nomes
proibidos).

Pronto: coluna `perfis.restricoes`, o campo `restricoesExtra` em `PedidoDeCena`, e
o trecho de `montarPedido` que injeta essas restrições no prompt com a instrução
de obedecer sem mencionar. Falta só a UI e a autenticação.

## Conjunto de avaliação

Dez aberturas fixas, rodadas a cada mudança de prompt, medindo as regras
numéricas do nível de leitura: palavras por cena, palavras por frase, e presença
do refrão. Mais uma checagem dos limites da constituição.

É o que permite mudar o prompt sem descobrir a regressão pela boca de uma criança.
Também é o que decide se `EFFORT` deve subir de `low` para `medium`.

## Mais mundos

Só existe uma bíblia: [a loja de coisas
perdidas](../lib/story-bibles/loja-de-coisas-perdidas.ts). A camada 2 já é um
arquivo por mundo e `historias.bible_id` já guarda qual foi usado, então adicionar
mundo é adicionar arquivo — falta a UI de escolher e a validação de que toda
bíblia tem as 5 batidas.

## Ilustrações

Os ícones das escolhas são emoji, e `Escolha.icone` está limitado a 8 caracteres
por isso. Uma criança de 5 anos escolhe pelo desenho, não pelo texto, então isto
vale mais do que parece.

## Dívidas técnicas conhecidas

- **Teto de gerações em memória.** Só correto com uma instância. Ver
  [decisoes.md](decisoes.md#o-teto-de-gerações-é-no-servidor).
- **Sem linter.** Nem eslint nem prettier configurados; o CI roda `typecheck`,
  `test` e `build`.
- **Testes só do parser.** [lib/stream-json.test.ts](../lib/stream-json.test.ts)
  cobre `LeitorDeCampo` e `Frases`. `validarCena` e a rota não têm teste.
