-- Catalog media bucket specification. Apply only in the future Supabase project for this restaurant platform.
-- Uploads are server-only through the service role after app-level authorization.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-media',
  'catalog-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Intentionally no authenticated INSERT/UPDATE/DELETE policy on storage.objects.
-- Browser clients must not upload directly in the first implementation.
-- Public read is provided by the public bucket URL; mutation remains server-only.
