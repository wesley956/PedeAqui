revoke all on function private.store_module_enabled(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.store_module_enabled(uuid, uuid, text) to service_role;
