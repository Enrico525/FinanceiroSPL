-- Repasses represados: só os dados lidos do PDF (nunca o arquivo), apagados quando a conferência é concluída.
-- Rodar uma vez no SQL Editor do projeto Supabase.
create table if not exists public.represados (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('recibo', 'repasse')),
  dados jsonb not null,
  guardado_por text not null,
  guardado_em timestamptz not null default now()
);

-- RLS ligado e sem nenhuma política: anon/authenticated não leem nem gravam.
-- Só o Worker, com a chave secreta (SUPABASE_KEY), acessa a tabela.
alter table public.represados enable row level security;
revoke all on public.represados from anon, authenticated;

-- Proprietários que pedem para segurar o repasse. A conferência separa sozinha os extratos com esses nomes
-- (comparação sem acento e sem maiúscula, nome igual ao do extrato do NIDO). Editar pelo Table Editor do Supabase.
create table if not exists public.represados_nomes (
  nome text primary key
);
-- Proprietários partilhados: mesmo `grupo` = uma caixa só (e uma conferência só) na página Represados.
alter table public.represados_nomes add column if not exists grupo text;
alter table public.represados_nomes enable row level security;
revoke all on public.represados_nomes from anon, authenticated;

-- Projetos novos do Supabase não dão acesso automático às tabelas: o Worker (chave secreta = service_role) precisa disto.
grant select, insert, delete on public.represados to service_role;
grant usage on sequence public.represados_id_seq to service_role;
grant select on public.represados_nomes to service_role;
-- O Supabase dá estas por padrão; o Worker não usa (truncate apagaria tudo de uma vez).
revoke truncate, references, trigger on public.represados, public.represados_nomes from service_role;
-- Função criada pelo Supabase (liga o RLS em tabela nova): ninguém de fora precisa executá-la.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- Exemplo: insert into public.represados_nomes (nome) values ('NOME COMO VEM NO EXTRATO');
