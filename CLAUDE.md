# Contexto para agentes de código

Leia [docs/README.md](docs/README.md) antes de mudar qualquer coisa. Este arquivo
é só o resumo do que costuma ser esquecido.

## Hierarquia de verdade

**prosa → prompt → código.** [docs/story-bible.md](docs/story-bible.md) manda em
[lib/prompts/v1.ts](lib/prompts/v1.ts), que manda no resto.

Mudança de comportamento da narradora **começa no story bible**, não no prompt. Se
você editar só o prompt, o documento vira ficção e a próxima pessoa não tem como
saber qual dos dois está certo.

Ao mudar a constituição ou as regras de nível de leitura, suba `PROMPT_VERSAO`.

## Idioma

Identificadores, comentários, documentação, mensagens de commit: **português**.
`gerarCena`, `LeitorDeCampo`, `batida`, `fatos_novos`. Um `generateScene` no meio
faz o leitor trocar de idioma a cada arquivo.

Comentário explica **por que**, não o que — e registra o que acontece se alguém
desfizer a decisão. Esse é o tom do repositório; copie ele.

## Coisas que parecem bug e não são

Antes de "corrigir" qualquer um destes, leia
[docs/decisoes.md](docs/decisoes.md):

- `texto` é o primeiro campo de `cenaSchema` **de propósito** — o leitor de
  streaming extrai esse campo do JSON parcial.
- O handler do evento `frase` em [components/historia.tsx](components/historia.tsx)
  é um bloco vazio **de propósito** — é o gancho do TTS, que ainda não existe.
- [lib/audio.ts](lib/audio.ts) cria um `AudioContext` que ninguém consome **de
  propósito** — desbloqueio do iOS precisa acontecer num gesto do usuário.
- A batida 5 devolve `escolhas: []`. É o sinal de fim de história; não existe campo
  `terminou`.
- Não há eslint nem prettier. Siga a formatação dos arquivos vizinhos.

## Invariantes que não podem ser quebradas

- **Nada volátil no `system`.** Batida, nível, fatos e escolha vão na mensagem do
  usuário, depois do `cache_control`. Interpolar no `system` invalida o prefixo
  inteiro em toda chamada.
- **A chave da API nunca vai ao browser.** Só código de servidor importa
  [lib/anthropic.ts](lib/anthropic.ts). Nunca prefixe com `NEXT_PUBLIC_`.
- **Limites de custo e conteúdo ficam no servidor.** O front é inspecionável.
- **Erro para o cliente é código**, não stack trace nem mensagem do provedor.
- **Nada que atrase o primeiro token.** É o requisito de produto mais forte que
  existe aqui.

## Verificar antes de terminar

```bash
npm test && npm run typecheck && npm run build
```

Mudou parsing de streaming? Adicione teste em
[lib/stream-json.test.ts](lib/stream-json.test.ts) — bug ali é silencioso.
