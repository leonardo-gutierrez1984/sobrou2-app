-- Migration: versiona objetos criados manualmente no painel do Supabase.
-- A tabela lancamentos_idempotencia e as RPCs salvar_lancamento/salvar_sacola
-- ja existem e estao valendo no banco (Teste/Primor/Brioche compartilham o mesmo banco).
-- Este arquivo NAO precisa ser rodado no banco atual; ele existe para que o repo
-- consiga reconstruir esses objetos do zero. Por isso e escrito de forma idempotente
-- (if not exists / create or replace): roda sem quebrar tanto num banco vazio quanto no atual.

-- 1) Tabela de idempotencia (1 client_uuid por clique de salvar/confirmar sacola)
create table if not exists public.lancamentos_idempotencia (
  client_uuid uuid not null,
  empresa_id  uuid not null,
  criado_em   timestamptz not null default now(),
  constraint lancamentos_idempotencia_pkey primary key (client_uuid)
);

-- 2) RLS: cada empresa so enxerga/grava os proprios uuids
alter table public.lancamentos_idempotencia enable row level security;

drop policy if exists "idempotencia da propria empresa" on public.lancamentos_idempotencia;
create policy "idempotencia da propria empresa"
  on public.lancamentos_idempotencia
  for all
  using (empresa_id = get_my_empresa_id())
  with check (empresa_id = get_my_empresa_id());

-- 3) RPC transacional + idempotente do lancamento unitario (handleSave)
CREATE OR REPLACE FUNCTION public.salvar_lancamento(p_client_uuid uuid, p_tem_producao boolean, p_producao_qtd numeric, p_tem_lote boolean, p_lote_venc date, p_tem_sobra boolean, p_sobra_qtd numeric, p_unidade text, p_destino text, p_valor_cheio numeric, p_valor_recebido numeric, p_produto_id uuid, p_produto_nome text, p_data timestamp with time zone, p_data_ymd date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_user_id    uuid;
begin
  v_user_id    := auth.uid();
  v_empresa_id := get_my_empresa_id();

  if v_empresa_id is null then
    raise exception 'Usuario sem empresa vinculada';
  end if;

  -- IDEMPOTENCIA: tenta reservar o uuid deste clique.
  -- Se ja existe, este e um retry -> nao grava nada de novo.
  begin
    insert into lancamentos_idempotencia (client_uuid, empresa_id)
    values (p_client_uuid, v_empresa_id);
  exception when unique_violation then
    return 'duplicado';   -- ja processado antes; nao duplica
  end;

  -- A PARTIR DAQUI, tudo numa transacao so (a funcao inteira e atomica:
  -- qualquer erro daqui pra baixo desfaz ate a reserva do uuid acima).

  -- Escrita 1: producao
  if p_tem_producao then
    insert into producao (empresa_id, user_id, produto_id, quantidade, data)
    values (v_empresa_id, v_user_id, p_produto_id, p_producao_qtd, p_data);

    -- Escrita 2: lote (so se pediram lote junto com a producao)
    if p_tem_lote then
      insert into lotes (empresa_id, user_id, produto_id, quantidade,
                         data_producao, data_vencimento, status)
      values (v_empresa_id, v_user_id, p_produto_id, p_producao_qtd,
              p_data_ymd, p_lote_venc, 'aberto');
    end if;
  end if;

  -- Escrita 3: sobra
  if p_tem_sobra then
    insert into lancamentos_sobras (produto_id, produto_nome, quantidade,
                                    unidade, destino, user_id, empresa_id, data,
                                    valor_cheio, valor_recebido)
    values (p_produto_id, p_produto_nome, p_sobra_qtd,
            p_unidade, p_destino, v_user_id, v_empresa_id, p_data,
            case when p_destino = 'Venda Resgatada' then p_valor_cheio else null end,
            case when p_destino = 'Venda Resgatada' then p_valor_recebido else null end);

    -- Escrita 4: baixa de lote — BEST-EFFORT (preserva o comportamento de hoje:
    -- se falhar, NAO desfaz o lancamento, so registra e segue).
    begin
      update lotes set status = 'baixado'
       where empresa_id = v_empresa_id
         and produto_id = p_produto_id
         and status = 'aberto'
         and data_vencimento <= p_data_ymd;
    exception when others then
      raise warning 'baixa de lote falhou (best-effort): %', sqlerrm;
    end;
  end if;

  return 'ok';
end;
$function$;

-- 4) RPC transacional + idempotente da sacola (handleConfirmarSacola)
CREATE OR REPLACE FUNCTION public.salvar_sacola(p_client_uuid uuid, p_itens jsonb, p_valor_cheio numeric, p_valor_recebido numeric, p_data timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_empresa_id uuid;
  v_user_id    uuid;
  v_item       jsonb;
  v_idx        int := 0;
begin
  v_user_id    := auth.uid();
  v_empresa_id := get_my_empresa_id();

  if v_empresa_id is null then
    raise exception 'Usuario sem empresa vinculada';
  end if;

  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Sacola vazia';
  end if;

  -- IDEMPOTENCIA: reserva o uuid deste clique de confirmar a sacola.
  -- Se ja existe, este e um retry -> nao grava nada de novo.
  begin
    insert into lancamentos_idempotencia (client_uuid, empresa_id)
    values (p_client_uuid, v_empresa_id);
  exception when unique_violation then
    return 'duplicado';
  end;

  -- A PARTIR DAQUI, tudo numa transacao so: ou todos os itens entram,
  -- ou nenhum entra (a sacola inteira e atomica).
  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    insert into lancamentos_sobras (produto_id, produto_nome, quantidade,
                                    unidade, destino, user_id, empresa_id, data,
                                    valor_cheio, valor_recebido)
    values (
      (v_item->>'produto_id')::uuid,
      v_item->>'produto_nome',
      (v_item->>'quantidade')::numeric,
      v_item->>'unidade',
      'Venda Resgatada',
      v_user_id,
      v_empresa_id,
      p_data,
      case when v_idx = 0 then p_valor_cheio else null end,
      case when v_idx = 0 then p_valor_recebido else null end
    );
    v_idx := v_idx + 1;
  end loop;

  return 'ok';
end;
$function$;
