-- PedeAqui — hotfix de acesso anônimo ao cardápio público.
--
-- Os wrappers públicos chamam helpers SECURITY DEFINER no schema private. Como os
-- wrappers eram SECURITY INVOKER, visitantes anon precisavam de USAGE no schema
-- private e recebiam 401/permission denied. Mantemos private fechado e elevamos
-- apenas estes dois wrappers públicos, com search_path vazio e chamadas totalmente
-- qualificadas.

create or replace function public.get_public_menu(p_store_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when menu is null then null
    else menu || jsonb_build_object('delivery', private.get_public_delivery_summary(p_store_slug))
  end
  from (select private.get_public_menu(p_store_slug) as menu) q;
$$;

create or replace function public.get_public_product(p_store_slug text, p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_public_product(p_store_slug, p_product_id);
$$;

revoke all on function public.get_public_menu(text) from public;
revoke all on function public.get_public_product(text, uuid) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated, service_role;
grant execute on function public.get_public_product(text, uuid) to anon, authenticated, service_role;
