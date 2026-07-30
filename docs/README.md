# Documentação

Quatro documentos, com papéis que não se sobrepõem. Se você for adicionar
documentação, encaixe em um destes em vez de criar um quinto arquivo — a razão de
serem poucos é que ninguém precise adivinhar onde uma informação vive.

| Documento | Responde |
| --- | --- |
| [story-bible.md](story-bible.md) | O que a narradora pode e não pode fazer. **Fonte de verdade.** |
| [arquitetura.md](arquitetura.md) | Como o código está montado e por onde uma cena passa. |
| [decisoes.md](decisoes.md) | Por que uma escolha estranha do código é a certa. |
| [roadmap.md](roadmap.md) | O que não existe ainda e onde o gancho já está. |

## Por onde começar

**Vai mexer em prompt, personagem ou limite de conteúdo?**
[story-bible.md](story-bible.md) primeiro, sempre. O prompt em
[lib/prompts/v1.ts](../lib/prompts/v1.ts) é a tradução desse documento para o que
vai no `system` — editar o código sem editar a prosa faz o documento virar ficção,
e a próxima pessoa não tem como saber qual dos dois está certo.

**Vai mexer em streaming, rota, cache ou banco?**
[arquitetura.md](arquitetura.md), depois [decisoes.md](decisoes.md).

**Achou algo no código que parece errado?**
Procure em [decisoes.md](decisoes.md) antes de corrigir. A ordem dos campos do
schema, o `AudioContext` que ninguém usa e o handler de evento vazio são todos
deliberados e todos têm motivo escrito.

**Quer contribuir?** [CONTRIBUTING.md](../CONTRIBUTING.md).

## A regra de ouro

A hierarquia é **prosa → prompt → código**.

`docs/story-bible.md` manda em `lib/prompts/v1.ts`, que manda no resto. Ao mudar a
constituição ou as regras de nível de leitura, suba `PROMPT_VERSAO` — cada cena
guarda essa versão, e é o que permite saber com que regras cada pedaço do acervo
foi gerado.
