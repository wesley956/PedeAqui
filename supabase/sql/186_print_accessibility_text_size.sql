-- Acessibilidade de impressão: permite aumentar as letras do comprovante.
-- O padrão atual permanece "normal" para todas as lojas existentes.

alter table public.store_print_preferences
  add column if not exists text_size text not null default 'normal';

alter table public.store_print_preferences
  drop constraint if exists store_print_preferences_text_size_check;

alter table public.store_print_preferences
  add constraint store_print_preferences_text_size_check
  check (text_size in ('normal', 'large', 'extra_large'));
