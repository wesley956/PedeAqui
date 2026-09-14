-- Restore the server-only execution chain used by platform backoffice RPCs.
-- Public mutation RPCs remain denied to anon/authenticated and callable only by service_role.
revoke all on function private.require_platform_super_admin(uuid) from public, anon, authenticated;
grant execute on function private.require_platform_super_admin(uuid) to service_role;
