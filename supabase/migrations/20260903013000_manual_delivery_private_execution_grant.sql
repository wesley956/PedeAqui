-- Manual delivery dispatch is intentionally executed by the server-side service role.
-- The dispatch RPC remains SECURITY INVOKER, so it must be able to execute the
-- private module resolver used only to derive the legacy delivery operation mode.
-- Keep this helper unavailable to client roles.
revoke all on function private.store_module_enabled(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.store_module_enabled(uuid, uuid, text) to service_role;
