-- Acessibilidade de impressão: permite aumentar as letras do comprovante.
-- O padrão atual permanece "normal" para todas as lojas e jobs existentes.

alter table public.store_print_preferences
  add column if not exists text_size text not null default 'normal';

alter table public.store_print_preferences
  drop constraint if exists store_print_preferences_text_size_check;

alter table public.store_print_preferences
  add constraint store_print_preferences_text_size_check
  check (text_size in ('normal', 'large', 'extra_large'));

-- O tamanho usado na renderização física fica gravado no job. Isso evita que
-- uma alteração posterior da preferência faça um comprovante já renderizado
-- usar largura física incompatível em retry/recovery.
alter table public.print_jobs
  add column if not exists text_size text not null default 'normal';

alter table public.print_jobs
  drop constraint if exists print_jobs_text_size_check;

alter table public.print_jobs
  add constraint print_jobs_text_size_check
  check (text_size in ('normal', 'large', 'extra_large'));
