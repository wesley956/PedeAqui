-- PedeAqui — category duplication
-- Cria uma cópia pausada da categoria e, opcionalmente, de seus produtos.
-- A duplicação preserva vínculos de grupos de adicionais, mas não replica
-- promoções, histórico ou regras de merchandising/cross-sell.

create or replace function public.duplicate_catalog_category_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_category_id uuid,
  p_include_products boolean,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_category public.categories%rowtype;
  v_source_product public.products%rowtype;
  v_category_id uuid;
  v_product_id uuid;
  v_product_count integer := 0;
begin
  if not exists (
    select 1
      from public.stores s
     where s.id = p_store_id
       and s.organization_id = p_organization_id
  ) then
    raise exception 'store unavailable';
  end if;

  select c.*
    into v_source_category
    from public.categories c
   where c.id = p_category_id
     and c.organization_id = p_organization_id
     and c.store_id = p_store_id
     and c.deleted_at is null;

  if not found then
    raise exception 'category unavailable';
  end if;

  insert into public.categories (
    organization_id,
    store_id,
    name,
    description,
    image_url,
    sort_order,
    active,
    created_by,
    updated_by
  ) values (
    p_organization_id,
    p_store_id,
    left(v_source_category.name, 70) || ' — Cópia',
    v_source_category.description,
    v_source_category.image_url,
    least(coalesce(v_source_category.sort_order, 0) + 1, 10000),
    false,
    p_actor_user_id,
    p_actor_user_id
  ) returning id into v_category_id;

  if coalesce(p_include_products, false) then
    for v_source_product in
      select p.*
        from public.products p
       where p.organization_id = p_organization_id
         and p.store_id = p_store_id
         and p.category_id = p_category_id
         and p.deleted_at is null
       order by p.sort_order, p.created_at, p.id
    loop
      insert into public.products (
        organization_id,
        store_id,
        category_id,
        name,
        description,
        image_url,
        price_cents,
        promotional_price_cents,
        cost_cents,
        sku,
        barcode,
        preparation_time_minutes,
        sort_order,
        active,
        availability,
        created_by,
        updated_by
      ) values (
        p_organization_id,
        p_store_id,
        v_category_id,
        v_source_product.name,
        v_source_product.description,
        v_source_product.image_url,
        v_source_product.price_cents,
        v_source_product.promotional_price_cents,
        v_source_product.cost_cents,
        null,
        null,
        v_source_product.preparation_time_minutes,
        v_source_product.sort_order,
        false,
        'inactive',
        p_actor_user_id,
        p_actor_user_id
      ) returning id into v_product_id;

      insert into public.product_modifier_groups (
        organization_id,
        store_id,
        product_id,
        modifier_group_id,
        sort_order
      )
      select
        p_organization_id,
        p_store_id,
        v_product_id,
        pmg.modifier_group_id,
        pmg.sort_order
      from public.product_modifier_groups pmg
      where pmg.organization_id = p_organization_id
        and pmg.store_id = p_store_id
        and pmg.product_id = v_source_product.id;

      v_product_count := v_product_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'category_id', v_category_id,
    'product_count', v_product_count
  );
end;
$$;

revoke all on function public.duplicate_catalog_category_internal(uuid,uuid,uuid,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.duplicate_catalog_category_internal(uuid,uuid,uuid,boolean,uuid)
  to service_role;
