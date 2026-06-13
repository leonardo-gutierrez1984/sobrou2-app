-- Migration: endurecimento de seguranca de papeis e protecao da empresa
-- Aplicada manualmente no painel do Supabase em 13/06/2026.
-- Versiona no repo o que foi aplicado (item 3.5 da auditoria 17/06).
-- Statements idempotentes: seguro re-rodar.

-- A) Funcao is_admin(): o usuario logado e admin da empresa dele?
create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from membros
    where user_id = auth.uid()
      and papel = 'admin'
  );
$$;

-- B) MEMBROS: escritas exigem admin (SELECT inalterado)
drop policy if exists "inserir membro na propria empresa" on membros;
create policy "inserir membro na propria empresa"
  on membros for insert
  with check (empresa_id = get_my_empresa_id() and is_admin());

drop policy if exists "atualizar membro da propria empresa" on membros;
create policy "atualizar membro da propria empresa"
  on membros for update
  using (empresa_id = get_my_empresa_id() and is_admin())
  with check (empresa_id = get_my_empresa_id());

drop policy if exists "remover membro da propria empresa" on membros;
create policy "remover membro da propria empresa"
  on membros for delete
  using (empresa_id = get_my_empresa_id() and is_admin());

-- C) EMPRESAS: UPDATE exige admin; DELETE e INSERT removidos do cliente
drop policy if exists "empresas_update" on empresas;
create policy "empresas_update"
  on empresas for update
  using (id = get_my_empresa_id() and is_admin())
  with check (id = get_my_empresa_id());

drop policy if exists "empresas_delete" on empresas;
drop policy if exists "empresas_insert" on empresas;

-- D) Guarda na criar_empresa: quem ja tem empresa nao cria outra
create or replace function public.criar_empresa(nome_empresa text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  nova_empresa_id uuid;
begin
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Voce ja faz parte de uma empresa. Feche o app e abra de novo.';
  end if;

  insert into empresas (nome, dono_id)
  values (nome_empresa, auth.uid())
  returning id into nova_empresa_id;

  insert into membros (empresa_id, user_id, email, papel)
  values (
    nova_empresa_id,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'admin'
  );

  return nova_empresa_id;
end;
$function$;

-- E) 1 usuario -> 1 empresa (so para linhas com user_id)
create unique index if not exists membros_um_vinculo_por_usuario
  on membros (user_id)
  where user_id is not null;
