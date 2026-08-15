-- PedeAqui — hotfix de confirmação de pedidos + impressão.
--
-- A confirmação do pedido é executada server-side como service_role. O trigger de
-- impressão é SECURITY INVOKER e chama estes helpers privados; portanto eles
-- precisam de EXECUTE para service_role, mantendo browser roles bloqueados.

grant usage on schema private to service_role;

grant execute on function private.print_order_items_payload(uuid,uuid,boolean) to service_role;
grant execute on function private.enqueue_order_print_jobs(uuid) to service_role;

revoke execute on function private.print_order_items_payload(uuid,uuid,boolean) from public, anon, authenticated;
revoke execute on function private.enqueue_order_print_jobs(uuid) from public, anon, authenticated;
