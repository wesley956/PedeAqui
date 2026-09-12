-- Deduplicate transactional WhatsApp notices by the visible order checkpoint.
-- Internal domain events remain untouched; only customer communication is folded.

alter table public.order_whatsapp_notifications
  add column if not exists workflow_checkpoint text;

alter table public.order_whatsapp_notifications
  drop constraint if exists order_whatsapp_notifications_workflow_checkpoint_check;

alter table public.order_whatsapp_notifications
  add constraint order_whatsapp_notifications_workflow_checkpoint_check
  check (workflow_checkpoint is null or workflow_checkpoint in (
    'new',
    'preparing',
    'ready',
    'delivering',
    'awaiting_pickup',
    'finished',
    'payment',
    'canceled'
  ));

create unique index if not exists order_whatsapp_notifications_visible_checkpoint_uniq
  on public.order_whatsapp_notifications (organization_id, order_id, workflow_checkpoint)
  where workflow_checkpoint is not null;

comment on column public.order_whatsapp_notifications.workflow_checkpoint is
  'Visible workflow checkpoint claimed atomically before dispatch. Prevents multiple canonical events from announcing the same customer-visible stage.';

create or replace function public.order_notification_claim_workflow_checkpoint_internal(
  p_notification_id uuid,
  p_worker_id text,
  p_checkpoint text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_checkpoint not in ('new','preparing','ready','delivering','awaiting_pickup','finished','payment','canceled') then
    raise exception 'invalid workflow checkpoint';
  end if;

  update public.order_whatsapp_notifications
     set workflow_checkpoint = p_checkpoint,
         updated_at = now()
   where id = p_notification_id
     and status = 'processing'
     and locked_by = trim(p_worker_id)
     and (workflow_checkpoint is null or workflow_checkpoint = p_checkpoint);

  get diagnostics v_updated = row_count;
  return v_updated = 1;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.order_notification_claim_workflow_checkpoint_internal(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.order_notification_claim_workflow_checkpoint_internal(uuid,text,text)
  to service_role;

