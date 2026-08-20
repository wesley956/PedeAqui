-- PedeAqui — hardening do segmento gás [362]–[366]
-- A view de saldos deve respeitar RLS do chamador; opções de carrinho permanecem server-only.

alter view public.gas_container_balances set (security_invoker = true);

drop policy if exists cart_item_gas_options_deny_direct on public.cart_item_gas_options;
create policy cart_item_gas_options_deny_direct
on public.cart_item_gas_options
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
