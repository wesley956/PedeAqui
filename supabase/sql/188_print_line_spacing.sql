-- Controle de espaçamento entre linhas na impressão térmica.
-- Mantém "normal" como padrão para preservar o comportamento atual.

alter table public.store_print_preferences
  add column if not exists line_spacing text not null default 'normal';

alter table public.store_print_preferences
  drop constraint if exists store_print_preferences_line_spacing_check;

alter table public.store_print_preferences
  add constraint store_print_preferences_line_spacing_check
  check (line_spacing in ('compact', 'normal', 'comfortable', 'wide'));

-- Cada job recebe um snapshot do espaçamento. Retry mantém o próprio job e
-- reimpressões preservam o estilo do job original.
alter table public.print_jobs
  add column if not exists line_spacing text not null default 'normal';

alter table public.print_jobs
  drop constraint if exists print_jobs_line_spacing_check;

alter table public.print_jobs
  add constraint print_jobs_line_spacing_check
  check (line_spacing in ('compact', 'normal', 'comfortable', 'wide'));

create or replace function public.print_jobs_snapshot_line_spacing_internal()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_line_spacing text;
begin
  if new.is_reprint = true and new.original_job_id is not null then
    select j.line_spacing into v_line_spacing
    from public.print_jobs j
    where j.id = new.original_job_id
      and j.organization_id = new.organization_id
      and j.store_id = new.store_id;
  else
    select p.line_spacing into v_line_spacing
    from public.store_print_preferences p
    where p.organization_id = new.organization_id
      and p.store_id = new.store_id;
  end if;

  new.line_spacing := coalesce(v_line_spacing, 'normal');
  return new;
end;
$function$;

drop trigger if exists print_jobs_snapshot_line_spacing on public.print_jobs;
create trigger print_jobs_snapshot_line_spacing
before insert on public.print_jobs
for each row execute function public.print_jobs_snapshot_line_spacing_internal();

revoke all on function public.print_jobs_snapshot_line_spacing_internal() from public, anon, authenticated;
