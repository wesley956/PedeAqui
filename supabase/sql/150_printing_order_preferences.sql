-- PedeAqui — preferências de conteúdo para impressão de pedidos.
-- Aditivo e retrocompatível: sem linha cadastrada, o aplicativo usa exatamente
-- o comportamento de impressão anterior. Documentos fiscais não usam esta tabela.

create table if not exists public.store_print_preferences (
  store_id uuid primary key,
  organization_id uuid not null,
  show_customer_name boolean not null default true,
  show_customer_phone boolean not null default true,
  show_delivery_address boolean not null default true,
  show_item_modifiers boolean not null default true,
  show_item_notes boolean not null default true,
  show_prices boolean not null default true,
  show_payment boolean not null default true,
  show_footer boolean not null default true,
  footer_text text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_print_preferences_store_scope_fkey
    foreign key (organization_id, store_id)
    references public.stores (organization_id, id)
    on delete cascade,
  constraint store_print_preferences_footer_text_check
    check (footer_text is null or char_length(footer_text) <= 120)
);

alter table public.store_print_preferences enable row level security;

-- Configuração compartilhada da unidade: somente serviços autoritativos do backend
-- acessam esta tabela. Não expor diretamente a usuários anon/authenticated.
revoke all on table public.store_print_preferences from anon, authenticated;
grant select, insert, update, delete on table public.store_print_preferences to service_role;

drop policy if exists store_print_preferences_no_client_access on public.store_print_preferences;
create policy store_print_preferences_no_client_access
  on public.store_print_preferences
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.store_print_preferences is
  'Preferências da unidade para conteúdo de comprovantes operacionais; não altera documentos fiscais.';
