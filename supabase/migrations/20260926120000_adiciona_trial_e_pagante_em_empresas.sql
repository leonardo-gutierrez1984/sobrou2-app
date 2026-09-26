-- 20260926120000_adiciona_trial_e_pagante_em_empresas.sql
-- Aplicada manualmente no painel do Supabase em 26/09/2026.
-- Etapa 1 do paywall (trava de trial de 30 dias). So banco; o app ainda nao usa nada disto.
-- Adiciona pagante/teste_ate em empresas, marca Primor (2fab314d) e Brioche (cdd47774) como pagantes,
-- protege as 2 colunas contra alteracao pelo app e cria a RPC minha_assinatura_ativa().
-- Nao altera criar_empresa: empresas novas ganham teste_ate pelo default da coluna.
-- Idempotente (if not exists / create or replace / drop if exists): seguro rodar mais de uma vez.
-- Volta: supabase/rollbacks/20260926120000_adiciona_trial_e_pagante_em_empresas_rollback.sql

begin;

-- A) Colunas novas. Empresas existentes recebem teste_ate = momento da aplicacao + 30 dias.
alter table public.empresas
  add column if not exists pagante boolean not null default false;

alter table public.empresas
  add column if not exists teste_ate timestamptz default (now() + interval '30 days');

-- B) Marca SOMENTE as 2 empresas reais como pagantes (por id, nunca por nome).
--    Se nao atualizar exatamente 2 linhas, aborta e desfaz a migration inteira.
do $$
declare
  v_linhas integer;
begin
  update public.empresas
     set pagante = true
   where id in (
     '2fab314d-dea2-495e-87cb-c560b5a649d6',  -- Panificadora Primor (REAL)
     'cdd47774-d76b-4109-90e7-9443302d8e79'   -- Brioche Crocante (REAL)
   );
  get diagnostics v_linhas = row_count;

  if v_linhas <> 2 then
    raise exception 'Esperava marcar 2 empresas como pagantes, mas marcou %. Nada foi aplicado.', v_linhas;
  end if;
end;
$$;

-- C) Protege pagante/teste_ate: o app (authenticated/anon) nao consegue mudar essas colunas,
--    nem sendo admin. O resto da linha (ex.: nome) continua editavel pela policy empresas_update.
--    Painel/SQL Editor (postgres) e service_role continuam podendo alterar.
--    SEM security definer de proposito: current_user precisa ser o papel de quem chamou.
create or replace function public.protege_colunas_assinatura()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if current_user in ('authenticated', 'anon')
     and (new.pagante   is distinct from old.pagante
       or new.teste_ate is distinct from old.teste_ate) then
    raise exception 'Nao e permitido alterar a assinatura da empresa pelo app.';
  end if;
  return new;
end;
$function$;

drop trigger if exists empresas_protege_colunas_assinatura on public.empresas;
create trigger empresas_protege_colunas_assinatura
  before update on public.empresas
  for each row
  execute function public.protege_colunas_assinatura();

-- D) RPC que o app vai chamar no boot: a assinatura da minha empresa esta ativa?
--    Usa o relogio do servidor. Sem empresa -> true (o Onboarding cuida desse caso).
create or replace function public.minha_assinatura_ativa()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    (select e.pagante or e.teste_ate is null or e.teste_ate > now()
       from empresas e
      where e.id = get_my_empresa_id()),
    true
  );
$function$;

revoke execute on function public.minha_assinatura_ativa() from public, anon;
grant execute on function public.minha_assinatura_ativa() to authenticated;

commit;

-- E) Conferencia (so leitura, depois do commit).
select id, nome, pagante, teste_ate
  from public.empresas
 order by pagante desc, nome;
