-- Issue #888 — exceções operacionais de checkout e política de pagamento.
-- Fixture descartável: a transação inteira é revertida.
begin;

insert into auth.users (id,email)
values ('f8899999-9999-4999-8999-999999999999','quality-fluid-exceptions@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f8890000-0000-4000-8000-000000000001','Issue 888 Exceptions','f8899999-9999-4999-8999-999999999999');
insert into public.stores (id,organization_id,name,slug,status)
values ('f8890000-0000-4000-8000-000000000011','f8890000-0000-4000-8000-000000000001','Exceptions Store','issue-888-exceptions','active');
insert into public.products (id,organization_id,store_id,name,price_cents,active,availability)
values ('f8890000-0000-4000-8000-000000000021','f8890000-0000-4000-8000-000000000001','f8890000-0000-4000-8000-000000000011','Produto que esgota',1990,true,'available');
insert into public.store_operational_settings (organization_id,store_id,payment_completion_policy)
values ('f8890000-0000-4000-8000-000000000001','f8890000-0000-4000-8000-000000000011',null);

insert into public.carts (
  id,organization_id,store_id,token_hash,status,subtotal_cents,discount_cents,
  delivery_fee_cents,total_cents,expires_at
) values (
  'f8890000-0000-4000-8000-000000000031','f8890000-0000-4000-8000-000000000001',
  'f8890000-0000-4000-8000-000000000011',repeat('a',64),'active',1990,0,0,1990,now()+interval '1 day'
);
insert into public.cart_items (
  id,organization_id,store_id,cart_id,product_id,product_name_snapshot,quantity,
  unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,
  line_total_cents,validation_status
) values (
  'f8890000-0000-4000-8000-000000000041','f8890000-0000-4000-8000-000000000001',
  'f8890000-0000-4000-8000-000000000011','f8890000-0000-4000-8000-000000000031',
  'f8890000-0000-4000-8000-000000000021','Produto que esgota',1,1990,0,1990,1990,'valid'
);
insert into public.checkout_sessions (
  id,organization_id,store_id,cart_id,customer_name,customer_phone,
  customer_phone_normalized,fulfillment_type,delivery_quote_status,
  delivery_fee_cents,payment_method,reviewed_at
) values (
  'f8890000-0000-4000-8000-000000000051','f8890000-0000-4000-8000-000000000001',
  'f8890000-0000-4000-8000-000000000011','f8890000-0000-4000-8000-000000000031',
  'Cliente Exceção','(19) 99999-0000','19999990000','pickup','not_required',0,'cash',now()
);

do $$
declare
  v_reprice jsonb;
  v_checkout_rejected boolean := false;
  v_policy text;
begin
  -- O item acaba depois de entrar no carrinho. A revisão precisa invalidá-lo.
  update public.products set availability='sold_out'
  where id='f8890000-0000-4000-8000-000000000021';
  v_reprice := public.cart_apply_reprice_internal(
    'f8890000-0000-4000-8000-000000000011',repeat('a',64),
    '[{"item_id":"f8890000-0000-4000-8000-000000000041","validation_status":"unavailable"}]'::jsonb
  );
  if (v_reprice->>'invalid_items')::integer <> 1 then
    raise exception 'produto esgotado não foi invalidado';
  end if;
  if (select total_cents from public.carts where id='f8890000-0000-4000-8000-000000000031') <> 0 then
    raise exception 'total do carrinho esgotado não foi recalculado';
  end if;

  begin
    perform public.create_order_from_checkout_internal(
      'f8890000-0000-4000-8000-000000000011',repeat('a',64),repeat('b',64)
    );
  exception when others then
    if sqlerrm not like '%cart contains invalid items%' then raise; end if;
    v_checkout_rejected := true;
  end;
  if not v_checkout_rejected then raise exception 'checkout aceitou produto esgotado'; end if;
  if exists(select 1 from public.orders where organization_id='f8890000-0000-4000-8000-000000000001') then
    raise exception 'pedido inválido deixou resíduo';
  end if;

  -- As três escolhas e o legado nulo devem persistir sem coerção silenciosa.
  foreach v_policy in array array['strict','flexible','quick_confirmation'] loop
    update public.store_operational_settings set payment_completion_policy=v_policy
    where store_id='f8890000-0000-4000-8000-000000000011';
    if (select payment_completion_policy from public.store_operational_settings
        where store_id='f8890000-0000-4000-8000-000000000011') <> v_policy then
      raise exception 'política % não persistiu',v_policy;
    end if;
  end loop;
  update public.store_operational_settings set payment_completion_policy=null
  where store_id='f8890000-0000-4000-8000-000000000011';
  if (select payment_completion_policy is not null from public.store_operational_settings
      where store_id='f8890000-0000-4000-8000-000000000011') then
    raise exception 'legado nulo não foi preservado';
  end if;

  begin
    update public.store_operational_settings set payment_completion_policy='automatic_unsafe'
    where store_id='f8890000-0000-4000-8000-000000000011';
    raise exception 'política inválida foi aceita';
  exception when check_violation then null;
  end;
end $$;

select
  1 as sold_out_item_invalidated,
  1 as invalid_checkout_rejected,
  3 as payment_policies_validated,
  1 as unsafe_policy_rejected;
rollback;
