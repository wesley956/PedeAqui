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

create or replace function public.print_jobs_snapshot_text_size_internal()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_text_size text;
begin
  select p.text_size into v_text_size
  from public.store_print_preferences p
  where p.organization_id = new.organization_id
    and p.store_id = new.store_id;

  new.text_size := coalesce(v_text_size, 'normal');
  return new;
end;
$function$;

drop trigger if exists print_jobs_snapshot_text_size on public.print_jobs;
create trigger print_jobs_snapshot_text_size
before insert on public.print_jobs
for each row execute function public.print_jobs_snapshot_text_size_internal();

revoke all on function public.print_jobs_snapshot_text_size_internal() from public, anon, authenticated;
