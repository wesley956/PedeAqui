-- PedeAqui FLOW-02 — claim determinístico das notificações WhatsApp por pedido.
-- Mantém as mesmas regras de lease/retry do claim genérico; o worker sem order_id
-- continua sendo a rede de recuperação para backlog e retries.

create or replace function public.order_notification_claim_for_order_internal(
  p_order_id uuid,
  p_worker_id text,
  p_limit integer default 20
)
returns setof public.order_whatsapp_notifications
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_order_id is null then
    raise exception 'invalid order id';
  end if;
  if char_length(trim(coalesce(p_worker_id,''))) not between 3 and 120 then
    raise exception 'invalid worker id';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'invalid claim limit';
  end if;

  return query
  with candidates as (
    select q.id
      from public.order_whatsapp_notifications q
     where q.order_id = p_order_id
       and (
         (q.status in ('pending','failed') and q.available_at <= now())
         or (q.status = 'processing' and q.locked_until < now())
       )
     order by q.available_at, q.created_at, q.id
     for update skip locked
     limit p_limit
  )
  update public.order_whatsapp_notifications q
     set status = 'processing',
         attempts = q.attempts + 1,
         locked_by = trim(p_worker_id),
         locked_until = now() + interval '2 minutes',
         updated_at = now()
    from candidates c
   where q.id = c.id
  returning q.*;
end;
$$;

revoke all on function public.order_notification_claim_for_order_internal(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.order_notification_claim_for_order_internal(uuid,text,integer)
  to service_role;
