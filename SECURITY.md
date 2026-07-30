# Política de segurança

## Reportar uma vulnerabilidade

**Não abra issue pública** para falha de segurança. Use um destes canais:

- [Security advisory privado](https://github.com/rodrigobastosv/conta-comigo/security/advisories/new) (preferido)
- E-mail: rodrigobastosv@gmail.com

Inclua o que der: passos para reproduzir, versão/commit, e o impacto que você
enxerga. Resposta em até 7 dias.

## O que é especialmente sensível aqui

Este projeto gera conteúdo para crianças e fala com um modelo de linguagem. Além
das falhas usuais de web, tratamos como vulnerabilidade:

- **Vazamento da `ANTHROPIC_API_KEY`.** A chave só é lida em código de servidor
  ([lib/anthropic.ts](lib/anthropic.ts)). Qualquer caminho que a exponha ao
  browser — variável `NEXT_PUBLIC_*`, log, mensagem de erro devolvida ao cliente
  — é falha, não bug de estilo.
- **Burlar o teto de gerações.** O limite vive no servidor, em
  [app/api/cena/route.ts](app/api/cena/route.ts). Qualquer forma de estourar
  custo de API contornando esse teto conta como vulnerabilidade.
- **Injeção de prompt que rompe os limites da narradora.** Se um campo
  controlado pelo cliente (`nomeAjudante`, `escolhaFeita`, `fatos`) fizer o
  modelo violar os LIMITES INVIOLÁVEIS da constituição — ver
  [docs/story-bible.md](docs/story-bible.md) — é falha de segurança do produto.
  Descreva o payload exato.
- **Furo de RLS.** As políticas em [supabase/schema.sql](supabase/schema.sql)
  existem para que nenhum dado de criança cruze de um responsável para outro.
  Qualquer consulta que atravesse isso é crítica.

## Fora de escopo

Relatório automatizado de scanner sem prova de exploração, e falta de
rate limit em rota que não custa dinheiro.
