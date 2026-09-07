-- #938 security-advisor hardening.
-- This trigger only validates merchant/account scope during service-role writes.
-- It does not require definer privileges and must never be callable by browser roles.

alter function public.integration_guard_merchant_account_scope() security invoker;
revoke all on function public.integration_guard_merchant_account_scope() from public, anon, authenticated;
grant execute on function public.integration_guard_merchant_account_scope() to service_role;

comment on function public.integration_guard_merchant_account_scope() is
  'Service-role trigger guard that enforces merchant provider/environment/account scope without SECURITY DEFINER privileges.';
