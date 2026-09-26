-- 20260926120000_adiciona_trial_e_pagante_em_empresas_rollback.sql
-- VOLTA da migration 20260926120000_adiciona_trial_e_pagante_em_empresas.sql.
-- NAO fica em migrations/ de proposito: so rodar se for preciso desfazer a trava de trial.
-- Remove SO o que aquela migration criou (RPC, trigger + funcao do trigger, colunas pagante/teste_ate).
-- Nao toca em nenhum outro dado. Atencao: os valores de pagante/teste_ate somem junto com as colunas.
-- Idempotente (if exists): seguro rodar mais de uma vez.
-- ANTES de rodar: o app nao pode estar chamando minha_assinatura_ativa() (senao o boot quebra).

begin;

drop function if exists public.minha_assinatura_ativa();

drop trigger if exists empresas_protege_colunas_assinatura on public.empresas;
drop function if exists public.protege_colunas_assinatura();

alter table public.empresas drop column if exists teste_ate;
alter table public.empresas drop column if exists pagante;

commit;

-- Conferencia (so leitura): empresas deve voltar a ter so id, nome, dono_id, criado_em.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'empresas'
 order by ordinal_position;
