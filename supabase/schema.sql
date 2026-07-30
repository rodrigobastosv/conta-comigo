-- Conta Comigo — grafo de cenas.
--
-- A ideia central: nada é sobrescrito. Escolher outro caminho cria uma nova cena
-- filha do MESMO pai. O acervo cresce, e o caminho percorrido (subindo por
-- cena_pai_id) é o livrinho que a criança relê depois.

create extension if not exists "pgcrypto";

-- Uma conta por adulto. As crianças não têm login.
create table perfis (
  id             uuid primary key default gen_random_uuid(),
  responsavel_id uuid not null references auth.users (id) on delete cascade,
  apelido        text not null,
  idade          smallint not null check (idade between 2 and 14),
  nivel_leitura  text not null check (nivel_leitura in ('ouvir', 'ler')),
  voz_preferida  text,
  -- Modo dos pais: medos a evitar, nomes proibidos. Entra no prompt como
  -- restricoesExtra. Vazio hoje, a estrutura já existe.
  restricoes     jsonb not null default '[]'::jsonb,
  criado_em      timestamptz not null default now()
);

create table historias (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references perfis (id) on delete cascade,
  -- Qual bíblia (mundo) foi usada: 'loja-de-coisas-perdidas'.
  bible_id      text not null,
  titulo        text not null,
  -- Nome que a criança deu ao ajudante. Perguntado a cada história e apelido
  -- de ficção, não identidade — mas fica aqui porque a coerência entre cenas e
  -- o livrinho dependem dele (e o nome já está dentro do texto de toda forma).
  nome_ajudante text not null,
  criada_em     timestamptz not null default now(),
  encerrada_em  timestamptz
);

create table cenas (
  id            uuid primary key default gen_random_uuid(),
  historia_id   uuid not null references historias (id) on delete cascade,
  cena_pai_id   uuid references cenas (id) on delete cascade,
  batida        smallint not null check (batida between 1 and 5),
  texto         text not null,
  -- Camada 3 do story bible: os fatos que ESTA cena tornou verdade.
  fatos_novos   jsonb not null default '[]'::jsonb,
  -- [] na batida 5 — é o sinal de fim de história para a UI.
  escolhas      jsonb not null default '[]'::jsonb,
  -- Rótulo da escolha que levou até aqui. Null na cena raiz.
  escolha_entrada text,
  -- Áudio da narração, no Storage. Cache por hash de (texto + voz + modelo).
  audio_url     text,
  audio_hash    text,
  prompt_versao text not null,
  criada_em     timestamptz not null default now()
);

create index cenas_por_historia on cenas (historia_id);
create index cenas_por_pai on cenas (cena_pai_id);
-- Um pai não deve ter duas cenas geradas para a mesma escolha: reuse, não regere.
create unique index cenas_pai_escolha
  on cenas (cena_pai_id, escolha_entrada)
  where cena_pai_id is not null;

-- Caminho da raiz até uma cena. É isto que monta o livrinho e o conjunto de
-- fatos daquele ramo — ramos diferentes têm verdades diferentes sem se contaminar.
create or replace function caminho_da_cena(cena uuid)
returns table (
  id uuid,
  batida smallint,
  texto text,
  fatos_novos jsonb,
  escolha_entrada text,
  profundidade int
)
language sql stable as $$
  with recursive subida as (
    select c.id, c.cena_pai_id, c.batida, c.texto, c.fatos_novos,
           c.escolha_entrada, 0 as profundidade
      from cenas c where c.id = cena
    union all
    select p.id, p.cena_pai_id, p.batida, p.texto, p.fatos_novos,
           p.escolha_entrada, s.profundidade + 1
      from cenas p join subida s on p.id = s.cena_pai_id
  )
  select id, batida, texto, fatos_novos, escolha_entrada, profundidade
    from subida order by profundidade desc;
$$;

-- Zero dado de criança sai daqui. Cada responsável só vê o que é dele.
alter table perfis enable row level security;
alter table historias enable row level security;
alter table cenas enable row level security;

create policy "perfis do responsavel" on perfis
  for all using (responsavel_id = auth.uid());

create policy "historias do responsavel" on historias
  for all using (
    exists (
      select 1 from perfis p
       where p.id = historias.perfil_id and p.responsavel_id = auth.uid()
    )
  );

create policy "cenas do responsavel" on cenas
  for all using (
    exists (
      select 1 from historias h join perfis p on p.id = h.perfil_id
       where h.id = cenas.historia_id and p.responsavel_id = auth.uid()
    )
  );
