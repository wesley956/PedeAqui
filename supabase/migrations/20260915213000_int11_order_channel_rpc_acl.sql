-- INT-11 hardening: restrict canonical order creation RPCs to service_role only.
-- The 4-argument overload was introduced during INT-11 and must not be executable
-- by anon/authenticated. Keep the legacy 3-argument overload aligned as well.

revoke all on function public.create_order_from_checkout_internal(uuid,text,text,text) from public;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text,text) from anon;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text,text) from authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text,text) to service_role;

revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from public;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from anon;
revoke all on function public.create_order_from_checkout_internal(uuid,text,text) from authenticated;
grant execute on function public.create_order_from_checkout_internal(uuid,text,text) to service_role;
