-- Support custom payment settlements without classifying them as cash or native cards.
create or replace function private.seed_store_financial_accounts(p_organization_id uuid,p_store_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.financial_accounts(organization_id,store_id,name,account_type,system_key) values
    (p_organization_id,p_store_id,'Caixa físico','cash','cash_on_hand'),
    (p_organization_id,p_store_id,'Pix a liquidar','clearing','pix_clearing'),
    (p_organization_id,p_store_id,'Cartões a liquidar','clearing','card_clearing'),
    (p_organization_id,p_store_id,'Outras formas a liquidar','clearing','custom_clearing')
  on conflict (organization_id,store_id,system_key) where system_key is not null and deleted_at is null do nothing;

  insert into public.financial_account_balances(organization_id,account_id,balance_cents)
  select a.organization_id,a.id,0 from public.financial_accounts a
  where a.organization_id=p_organization_id and a.store_id=p_store_id and a.system_key in ('cash_on_hand','pix_clearing','card_clearing','custom_clearing')
  on conflict (organization_id,account_id) do nothing;
end; $$;
revoke all on function private.seed_store_financial_accounts(uuid,uuid) from public,anon,authenticated;
grant execute on function private.seed_store_financial_accounts(uuid,uuid) to service_role;

create or replace function private.finance_payment_account_id(p_organization_id uuid,p_store_id uuid,p_method text)
returns uuid language sql stable security invoker set search_path='' as $$
  select id from public.financial_accounts
  where organization_id=p_organization_id and store_id=p_store_id and active=true and deleted_at is null
    and system_key=case
      when p_method='cash' then 'cash_on_hand'
      when p_method='pix' then 'pix_clearing'
      when p_method in ('credit_card','debit_card') then 'card_clearing'
      when p_method='custom' then 'custom_clearing'
      else null
    end
  limit 1
$$;
revoke all on function private.finance_payment_account_id(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.finance_payment_account_id(uuid,uuid,text) to service_role;

select private.seed_store_financial_accounts(organization_id,id) from public.stores;
