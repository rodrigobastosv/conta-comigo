# Contribuindo

Obrigado pelo interesse. Este projeto é uma ferramenta que crianças usam, então
duas coisas pesam mais aqui do que no projeto médio: **a segurança do conteúdo
gerado** e **a latência até o primeiro som na tela**. Quase toda decisão de
arquitetura sai de uma dessas duas.

## Antes de escrever código

Leia [docs/story-bible.md](docs/story-bible.md). É a fonte de verdade em prosa do
que a narradora pode e não pode fazer, e boa parte do código só faz sentido
depois dele. Depois, [docs/arquitetura.md](docs/arquitetura.md) e
[docs/decisoes.md](docs/decisoes.md) — o segundo explica escolhas que parecem
erradas até você saber o motivo.

## Ambiente

Requer Node 22.6+ (o `npm test` usa `--experimental-strip-types` para rodar
TypeScript direto, sem passo de build).

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Só a `ANTHROPIC_API_KEY` é obrigatória para rodar. Sem as variáveis do Supabase o
app funciona inteiro em memória — a história vai de ponta a ponta, mas recarregar
a página perde o caminho percorrido. Para mexer em prompt, streaming ou UI isso
basta.

Antes de abrir PR:

```bash
npm test          # testes do leitor de JSON em streaming
npm run typecheck
npm run build
```

Os três rodam no CI. O `build` não precisa de chave de API.

## A regra que mais importa

**Mudança de comportamento da narradora começa em [docs/story-bible.md](docs/story-bible.md), não no código.**

O prompt em [lib/prompts/v1.ts](lib/prompts/v1.ts) é a tradução daquele documento
para o que vai no `system`. Se você editar o prompt sem editar a prosa, o
documento vira ficção e a próxima pessoa não tem como saber qual dos dois está
certo. Ordem: prosa primeiro, prompt depois, `PROMPT_VERSAO` no fim.

Ao mudar a constituição ou as regras de nível de leitura, **suba
`PROMPT_VERSAO`** em [lib/prompts/v1.ts](lib/prompts/v1.ts). Cada cena guarda
essa versão, então é o que permite saber com que regras cada pedaço do acervo foi
gerado.

## O que faz um PR ser aceito rápido

- **Um assunto por PR.** Prompt e streaming em PRs separados.
- **Teste para lógica de parsing.** [lib/stream-json.ts](lib/stream-json.ts) tem
  testes porque é onde bug é silencioso: emitir meia sequência de escape não
  quebra nada, só mostra `ç` na tela de uma criança. Mudou o parser? Teste.
- **Nada que aumente a latência do primeiro token.** A criança de 5 anos abandona
  em 3 segundos de tela parada. Se sua mudança faz o servidor esperar o JSON
  fechar para mandar algo, ela vai ser recusada mesmo que o código esteja bom.
- **Não interpole nada volátil no `system`.** Ver
  [docs/decisoes.md](docs/decisoes.md#o-cache-está-no-lugar-certo) — isso
  invalida o cache do prefixo inteiro e multiplica o custo por chamada.
- **Erro para o cliente é código, não detalhe.** O `console.error` fica no
  servidor; para o browser vai `falha-na-geracao`. Não vaze stack trace nem
  mensagem do provedor.

## Estilo

Nomes de identificadores, comentários e documentação em **português**. O código
existente é consistente nisso (`gerarCena`, `LeitorDeCampo`, `batida`); um
`generateScene` no meio faz o leitor trocar de idioma a cada arquivo.

Comentário explica **por que**, não o que. O padrão do repositório é comentário
que registra a decisão e o que acontece se você desfizer ela — copie esse tom.

Sem prettier/eslint configurado no momento. Siga a formatação dos arquivos
vizinhos: 2 espaços, aspas duplas, ponto e vírgula.

## Conteúdo gerado

Se você encontrar uma cena que viola os limites da constituição (morte, vilão de
verdade, moral explícita, abandono), abra issue com o **caminho de escolhas que
levou até ela** e o texto que saiu. É o relatório mais útil que existe para este
projeto, e não precisa vir com correção.

Se a violação for provocável de propósito por entrada do usuário, é falha de
segurança: siga [SECURITY.md](SECURITY.md) em vez de abrir issue pública.

## Código de conduta

Participando você concorda com o [código de conduta](CODE_OF_CONDUCT.md).

## Licença

Contribuições entram sob a [licença MIT](LICENSE) do projeto.
