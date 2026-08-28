-- PedeAqui — estabilização #815
-- Postgres Changes usa a publicação gerenciada pelo Supabase. RLS continua
-- autorizando cada registro entregue ao usuário autenticado.

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is unavailable; skipping hosted Realtime registration';
    return;
  end if;

  foreach v_table in array array['deliveries', 'drivers']
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
