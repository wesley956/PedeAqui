-- PedeAqui — Financeiro [211]–[224]
-- Prazo financeiro do fornecedor por unidade, usado como snapshot no pedido de compra.

create or replace function public.financial_update_supplier_term_internal(
  p_store_id uuid,p_supplier_id uuid,p_payment_term_days integer,p_actor_user_id uuid
) returns public.supplier_stores
language plpgsql security invoker set search_path='' as $$
declare v_before public.supplier_stores%rowtype; v_after public.supplier_stores%rowtype;
begin
  if p_actor_user_id is null then raise exception 'finance actor is required'; end if;
  if p_payment_term_days is null or p_payment_term_days<0 or p_payment_term_days>3650 then raise exception 'invalid supplier payment term'; end if;
  select * into v_before from public.supplier_stores where store_id=p_store_id and supplier_id=p_supplier_id for update;
  if v_before.supplier_id is null then raise exception 'supplier is not configured in store'; end if;
  update public.supplier_stores set payment_term_days=p_payment_term_days,updated_by=p_actor_user_id,updated_at=now()
  where organization_id=v_before.organization_id and store_id=v_before.store_id and supplier_id=v_before.supplier_id returning * into v_after;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_after.organization_id,v_after.store_id,p_actor_user_id,'finance.supplier_payment_term_updated','supplier',v_after.supplier_id,
    jsonb_build_object('payment_term_days',v_before.payment_term_days),jsonb_build_object('payment_term_days',v_after.payment_term_days));
  return v_after;
end; $$;
revoke all on function public.financial_update_supplier_term_internal(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.financial_update_supplier_term_internal(uuid,uuid,integer,uuid) to service_role;
