-- PedeAqui — PA-PUBLIC-UX-010 / #793
-- Informações públicas opcionais da unidade, sem duplicar endereço/telefone/horários.
-- E-mail administrativo e identificadores técnicos de integrações não fazem parte do payload público.

alter table public.stores
  add column if not exists public_whatsapp text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stores_public_whatsapp_format_check') then
    alter table public.stores add constraint stores_public_whatsapp_format_check check (
      public_whatsapp is null or (
        char_length(public_whatsapp) <= 40
        and public_whatsapp ~ '^[+()0-9 .-]+$'
        and char_length(regexp_replace(public_whatsapp, '[^0-9]', '', 'g')) >= 10
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_website_url_http_check') then
    alter table public.stores add constraint stores_website_url_http_check check (
      website_url is null or (char_length(website_url) <= 500 and website_url ~* '^https?://[^[:space:]]+$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_instagram_url_http_check') then
    alter table public.stores add constraint stores_instagram_url_http_check check (
      instagram_url is null or (char_length(instagram_url) <= 500 and instagram_url ~* '^https?://[^[:space:]]+$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_facebook_url_http_check') then
    alter table public.stores add constraint stores_facebook_url_http_check check (
      facebook_url is null or (char_length(facebook_url) <= 500 and facebook_url ~* '^https?://[^[:space:]]+$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_tiktok_url_http_check') then
    alter table public.stores add constraint stores_tiktok_url_http_check check (
      tiktok_url is null or (char_length(tiktok_url) <= 500 and tiktok_url ~* '^https?://[^[:space:]]+$')
    );
  end if;
end $$;

-- Isola exatamente os campos deliberadamente públicos da unidade.
create or replace function private.get_public_store_information(p_store_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'postal_code', s.postal_code,
    'street', s.street,
    'number', s.number,
    'complement', s.complement,
    'district', s.district,
    'public_whatsapp', s.public_whatsapp,
    'website_url', s.website_url,
    'instagram_url', s.instagram_url,
    'facebook_url', s.facebook_url,
    'tiktok_url', s.tiktok_url
  )
  from public.stores s
  where lower(s.slug) = lower(trim(p_store_slug))
    and s.status in ('active', 'temporarily_closed')
  limit 1;
$$;

revoke all on function private.get_public_store_information(text) from public;

-- Mantém o cardápio atual como baseline e apenas enriquece o objeto store.
create or replace function public.get_public_menu(p_store_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when menu is null then null
    else jsonb_set(
      menu,
      '{store}',
      coalesce(menu->'store', '{}'::jsonb) || coalesce(private.get_public_store_information(p_store_slug), '{}'::jsonb),
      true
    ) || jsonb_build_object('delivery', private.get_public_delivery_summary(p_store_slug))
  end
  from (select private.get_public_menu(p_store_slug) as menu) q;
$$;

revoke all on function public.get_public_menu(text) from public;
grant execute on function public.get_public_menu(text) to anon, authenticated, service_role;
