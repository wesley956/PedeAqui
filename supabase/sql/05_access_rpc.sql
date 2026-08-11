-- Safe public wrapper around the private permission evaluator.
-- It does not bypass RLS itself and returns only a boolean bound to auth.uid().

create or replace function public.has_permission(
  organization_id uuid,
  store_id uuid,
  permission_key text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_permission(organization_id, store_id, permission_key);
$$;

revoke all on function public.has_permission(uuid, uuid, text) from public;
grant execute on function public.has_permission(uuid, uuid, text) to authenticated;
