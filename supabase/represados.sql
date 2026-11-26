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
-- Vários grupos separados por vírgula: o nome aparece em cada caixa.
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

-- Log do que sobe e do que é apagado dos represados, para conferir no Table Editor (represados_log).
-- Sem nome nem valor: só quando, ação, tipo, contrato, nº do extrato, quem guardou e quem fez (no "apagou", quem
-- concluiu: o Worker manda no header X-Usuario). Guarda 30 dias:
-- cada gravação apaga o que tiver mais que isso.
create table if not exists public.represados_log (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  acao text not null check (acao in ('guardou', 'apagou')),
  represado_id bigint not null,
  tipo text not null,
  contrato text,
  extrato text,
  guardado_por text,
  feito_por text
);
alter table public.represados_log enable row level security;
revoke all on public.represados_log from anon, authenticated, service_role;

create or replace function public.represados_registrar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.represados := coalesce(new, old);
  -- Quem apagou vem do Worker no header X-Usuario (o PostgREST expõe os headers em minúsculas).
  quem text := current_setting('request.headers', true)::json->>'x-usuario';
begin
  delete from public.represados_log where quando < now() - interval '30 days';
  insert into public.represados_log (acao, represado_id, tipo, contrato, extrato, guardado_por, feito_por)
  values (case tg_op when 'INSERT' then 'guardou' else 'apagou' end, r.id, r.tipo,
          r.dados->>'contrato', r.dados->>'numero', r.guardado_por,
          case tg_op when 'INSERT' then r.guardado_por else quem end);
  return null;
end $$;
revoke execute on function public.represados_registrar() from public, anon, authenticated, service_role;

drop trigger if exists represados_log on public.represados;
create trigger represados_log after insert or delete on public.represados
  for each row execute function public.represados_registrar();
