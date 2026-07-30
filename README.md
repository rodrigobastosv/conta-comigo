# Conta Comigo

Histórias infantis interativas: as crianças não só ouvem, elas constroem. Cada
escolha ramifica a narrativa, e nada é sobrescrito — o acervo cresce e dá para
voltar e ver o outro caminho.

[![CI](https://github.com/rodrigobastosv/conta-comigo/actions/workflows/ci.yml/badge.svg)](https://github.com/rodrigobastosv/conta-comigo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Cinco batidas por história, duas escolhas por batida. A criança dá um nome ao
ajudante, escolhe pelo desenho, e a história se ramifica num grafo: escolher outro
caminho cria uma cena nova em vez de apagar a anterior.

## Rodar

Requer Node 22.6+ (o `npm test` roda TypeScript direto, sem build).

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

```bash
npm test        # testes do leitor de JSON em streaming
npm run typecheck
npm run build   # não precisa de chave de API
```

Só a `ANTHROPIC_API_KEY` é obrigatória. Sem as variáveis do Supabase o app roda
inteiro em memória: a história funciona de ponta a ponta, mas recarregar a página
perde o caminho percorrido.

## Documentação

| Documento | Responde |
| --- | --- |
| [docs/story-bible.md](docs/story-bible.md) | O que a narradora pode e não pode fazer. **Fonte de verdade — altere aqui primeiro, código depois.** |
| [docs/arquitetura.md](docs/arquitetura.md) | Como o código está montado e por onde uma cena passa. |
| [docs/decisoes.md](docs/decisoes.md) | Por que uma escolha estranha do código é a certa. |
| [docs/roadmap.md](docs/roadmap.md) | O que não existe ainda e onde o gancho já está. |

Índice e ordem de leitura em [docs/](docs/README.md).

## Como funciona, em resumo

Um endpoint de verdade: `POST /api/cena`, que devolve SSE.

O modelo escreve JSON validado por schema, mas a tela não pode esperar o JSON
fechar — criança de 5 anos abandona em 3 segundos de tela parada. Então
[lib/stream-json.ts](lib/stream-json.ts) extrai o campo `texto` do JSON **enquanto
ele ainda está chegando** e quebra em frases, que é a unidade que a narração vai
receber para tocar numa fila enquanto o resto da cena é gerado.

O story bible tem três camadas, e o corte entre elas é de cache, não de
organização:

| Camada | Escopo | Onde vive | No prompt |
| --- | --- | --- | --- |
| 1. Constituição | Todas as histórias, para sempre | [lib/prompts/v1.ts](lib/prompts/v1.ts) | `system`, íntegra, **em cache** |
| 2. Bíblia da história | Um mundo | [lib/story-bibles/](lib/story-bibles/) | `system`, íntegra, **em cache** |
| 3. Fatos estabelecidos | Um caminho no grafo | `cenas.fatos_novos` | mensagem do usuário, acumulada |

A camada 3 é o que evita o dragão que era azul na cena 2 virar verde na cena 4.
Cada cena devolve os fatos que criou; o caminho inteiro volta na chamada seguinte.
Subir por `cena_pai_id` já dá exatamente os fatos daquele ramo — ramos diferentes
têm verdades diferentes sem se contaminar.

Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Estado atual

Funciona de ponta a ponta: gera as cinco cenas, ramifica, volta uma cena e segue o
outro caminho.

Não existe ainda: **narração (TTS)** — o gancho está pronto, falta a voz pt-BR;
**persistência** — o schema está escrito, o app não escreve nele; modo dos pais;
ilustrações no lugar dos emoji; conjunto de avaliação. Ver
[docs/roadmap.md](docs/roadmap.md).

## Contribuindo

[CONTRIBUTING.md](CONTRIBUTING.md) — e leia
[docs/story-bible.md](docs/story-bible.md) antes de mexer em prompt.

Encontrou uma cena que viola os limites da constituição? Abra issue com o caminho
de escolhas que levou até ela. É o relatório mais útil que existe para este
projeto.

Falha de segurança: [SECURITY.md](SECURITY.md), não issue pública.

## Licença

[MIT](LICENSE).
