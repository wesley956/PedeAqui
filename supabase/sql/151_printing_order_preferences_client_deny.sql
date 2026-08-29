-- PedeAqui — negação explícita de acesso client-side às preferências de impressão.
-- A tabela é configurada somente pelos serviços autoritativos do backend.

drop policy if exists store_print_preferences_no_client_access on public.store_print_preferences;
create policy store_print_preferences_no_client_access
  on public.store_print_preferences
  for all
  to anon, authenticated
  using (false)
  with check (false);
