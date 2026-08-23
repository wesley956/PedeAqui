-- PedeAqui — PA-PUBLIC-UX-003 / #752
-- Hardening append-only: a configuração de merchandising é manipulada apenas
-- por serviços server-side autorizados. Nenhum cliente público/autenticado acessa
-- a tabela diretamente; o service_role continua usando os contratos internos.

drop policy if exists store_complement_categories_deny_direct on public.store_complement_categories;
create policy store_complement_categories_deny_direct
on public.store_complement_categories
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
