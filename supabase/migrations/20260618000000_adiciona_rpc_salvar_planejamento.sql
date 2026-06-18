-- 20260618000000_adiciona_rpc_salvar_planejamento.sql
-- Cria a RPC salvar_planejamento (transacional + idempotente), espelhando salvar_sacola.
-- Fecha o ultimo fluxo de escrita ainda nao-atomico (handleSalvarPlanejamento fazia N inserts em loop).
-- Escreve apenas na tabela producao. empresa_id/user_id vem do banco (get_my_empresa_id/auth.uid).
-- Idempotente: usa a tabela lancamentos_idempotencia ja existente. CREATE OR REPLACE: seguro rodar mais de uma vez.

CREATE OR REPLACE FUNCTION public.salvar_planejamento(p_client_uuid uuid, p_itens jsonb, p_data timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_user_id    uuid;
  v_item       jsonb;
begin
  v_user_id    := auth.uid();
  v_empresa_id := get_my_empresa_id();

  if v_empresa_id is null then
    raise exception 'Usuario sem empresa vinculada';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Planejamento vazio';
  end if;

  -- IDEMPOTENCIA: reserva o uuid deste clique de salvar planejamento.
  begin
    insert into lancamentos_idempotencia (client_uuid, empresa_id)
    values (p_client_uuid, v_empresa_id);
  exception when unique_violation then
    return 'duplicado';
  end;

  -- A PARTIR DAQUI, tudo numa transacao so: ou todos os itens entram, ou nenhum.
  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    insert into producao (empresa_id, user_id, produto_id, quantidade, data)
    values (
      v_empresa_id,
      v_user_id,
      (v_item->>'produto_id')::uuid,
      (v_item->>'quantidade')::numeric,
      p_data
    );
  end loop;

  return 'ok';
end;
$function$;
