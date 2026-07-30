# Decisões que não são óbvias no código

Cada item aqui é uma escolha que parece errada ou arbitrária até você saber o
motivo. Se você for desfazer alguma, desfaça sabendo o que volta a doer.

## A batida 5 devolve `escolhas: []`

É o sinal de fim de história para a UI — não há um campo `terminou`. `validarCena`
em [lib/schema.ts](../lib/schema.ts) rejeita qualquer outra combinação: batida 5
exige 0 escolhas, toda outra exige exatamente 2. Veio diferente, o certo é
**regerar, não renderizar**.

Modelo devolve 3 escolhas quando você pediu 2. Isso não é hipótese.

## A ordem dos campos no schema importa

`texto` vem primeiro em `cenaSchema` porque `LeitorDeCampo` extrai esse campo do
JSON **parcial**, enquanto ele ainda está chegando. Se `fatos_novos` vier antes, o
texto só começa a aparecer depois que os fatos terminarem de ser escritos, e a
tela fica parada nesse tempo.

Saída estruturada e streaming brigam: o que chega no fio é JSON, não prosa.

## O cache está no lugar certo

Constituição e bíblia vão em blocos `system` estáveis, com o `cache_control` no
**último**. Tudo que varia — batida, nível de leitura, fatos acumulados, escolha
feita — fica na mensagem do usuário, depois do breakpoint.

Interpolar qualquer coisa volátil no `system` invalidaria o prefixo inteiro em
toda chamada, e o prefixo é a maior parte do prompt. É a diferença entre pagar o
texto da bíblia uma vez por história e pagar cinco.

Isto é o motivo real do corte entre as camadas 1/2 e a camada 3. Não é
organização de arquivo, é economia de cache.

## Os eventos `frase` já existem, a narração não

Cada frase completa é emitida assim que fecha, em
[lib/gerar-cena.ts](../lib/gerar-cena.ts). É a unidade que o TTS vai receber para
tocar numa fila enquanto o resto da cena ainda está sendo gerado: primeiro som em
1–2s em vez de 8.

O handler do evento no cliente é um bloco vazio hoje, de propósito. A alternativa
era gerar áudio da cena inteira depois de pronta, e aí a criança encara oito
segundos de silêncio.

## O `AudioContext` é desbloqueado antes de existir áudio

[lib/audio.ts](../lib/audio.ts) cria e dá `resume()` no `AudioContext` no clique
de "Começar a história", e hoje ninguém consome esse contexto.

No iOS o áudio só toca depois de um gesto do usuário. Se você descobrir isso
quando a narração entrar, o sintoma é a primeira cena sair muda no iPad e em
nenhum outro lugar — o pior tipo de bug para diagnosticar depois. O gesto certo
existe uma vez só na sessão e é esse botão; gastar 20 linhas agora é mais barato
que reencontrar isso depois.

## As regras de nível de leitura são numéricas de propósito

"Adequado para 5 anos" não é testável. "Frase média de 8 a 14 palavras" e "90 a
140 palavras nesta cena" são.

É isso que o conjunto de avaliação vai medir a cada mudança de prompt. Regra que
não dá para medir não entra em [lib/prompts/v1.ts](../lib/prompts/v1.ts).

## O teto de gerações é no servidor

O front é inspecionável por qualquer criança de 8 anos com o dedo curioso. O
limite vive em [app/api/cena/route.ts](../app/api/cena/route.ts), antes de
qualquer chamada ao modelo, e devolve 429.

Ele está num `Map` na memória do processo, o que só é correto com uma instância.
É dívida consciente, com `TODO` no código: em duas instâncias cada uma conta o
seu teto e o total dobra.

## O corpo da requisição é `strictObject`

Campo a mais no POST é 400, não campo ignorado. Numa rota que custa dinheiro por
chamada, aceitar em silêncio o que você não entende é como o cliente e o servidor
passam a discordar sem ninguém notar.

## Um pai não tem duas cenas para a mesma escolha

O índice único `cenas_pai_escolha` em
[supabase/schema.sql](../supabase/schema.sql). Voltar uma cena e escolher a mesma
opção de novo deve **reusar** a cena que já existe, não gerar outra: a criança
espera reencontrar a mesma história, e regerar cobra da API por algo que já foi
pago.

## O prompt é versionado e a versão fica na cena

`PROMPT_VERSAO` em [lib/prompts/v1.ts](../lib/prompts/v1.ts), gravado em
`cenas.prompt_versao`. Sem isso, depois de três mudanças de constituição você tem
um acervo onde cenas foram geradas com regras diferentes e nenhuma forma de saber
quais.

## Erro para o cliente é código, não mensagem

`console.error` fica no log do servidor; para o browser vai `falha-na-geracao`,
`cena-truncada`, `recusa-do-modelo`. A UI traduz para uma frase que caiba no
mundo da história ("A loja não apareceu. Tente de novo.").

Duas razões: mensagem de erro do provedor pode conter detalhe de infra, e "erro
500: unexpected token" não é texto para uma criança de 5 anos ler.

## A narradora não é personagem

Ela nunca se refere a si mesma, nunca pergunta sobre a vida real da criança,
nunca diz que sente algo. A criança é a autora; a narradora é só a voz que lê o
que ela escolheu.

Isso está nos LIMITES INVIOLÁVEIS por decisão de produto, não por segurança de
modelo: um assistente que puxa conversa com criança é um produto diferente, com
outras responsabilidades. Ver [story-bible.md](story-bible.md).

## Nenhum antagonista é mau

Antagonistas são mal-entendido, teimosia, medo ou pressa — e todos terminam
compreendidos, não derrotados. Tensão máxima permitida: "será que vai dar tempo?".
Nunca "será que ele vai se machucar?".

A consequência prática é que o modelo precisa de instrução explícita, porque a
estrutura narrativa que ele aprendeu tende a produzir vilão.
