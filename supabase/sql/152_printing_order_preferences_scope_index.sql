-- PedeAqui — índice de escopo para a FK composta das preferências de impressão.

create index if not exists store_print_preferences_org_store_idx
  on public.store_print_preferences (organization_id, store_id);
