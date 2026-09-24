-- SAAS-06: the promotion schedule is an internal/server-side input.
-- The public menu/product projection is assembled by PublicMenuService after
-- evaluating timezone, weekday, date and overnight windows canonically.

revoke all on function public.get_public_product_promotions(uuid) from public;
revoke all on function public.get_public_product_promotions(uuid) from anon;
revoke all on function public.get_public_product_promotions(uuid) from authenticated;
grant execute on function public.get_public_product_promotions(uuid) to service_role;
