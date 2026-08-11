-- PedeAqui — Salão: a ação web informa explicitamente a comanda autorizada.
-- A RPC valida que item e participante pertencem à mesma comanda antes de delegar ao núcleo.

create or replace function public.dining_allocate_item_internal(
  p_tab_id uuid,
  p_order_item_id uuid,
  p_tab_member_id uuid,
  p_quantity integer,
  p_actor_user_id uuid default null
) returns public.tab_item_allocations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_member public.tab_members%rowtype;
begin
  select * into v_item from public.order_items where id = p_order_item_id;
  if v_item.id is null then raise exception 'order item not found'; end if;
  select * into v_order from public.orders where id = v_item.order_id;
  if v_order.id is null or v_order.tab_id is distinct from p_tab_id then raise exception 'item is not part of authorized tab'; end if;
  select * into v_member from public.tab_members where id = p_tab_member_id;
  if v_member.id is null or v_member.tab_id is distinct from p_tab_id then raise exception 'member is not part of authorized tab'; end if;
  return public.dining_allocate_item_internal(p_order_item_id, p_tab_member_id, p_quantity, p_actor_user_id);
end;
$$;

revoke all on function public.dining_allocate_item_internal(uuid,uuid,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.dining_allocate_item_internal(uuid,uuid,uuid,integer,uuid) to service_role;
