-- OMNI #936 — operational retention for durable integration-event payloads.
-- Keep event identity/history for dedupe and audit while allowing old terminal payloads
-- to be redacted after the retention window chosen by operations/provider policy.

alter table public.integration_events
  add column if not exists payload_redacted_at timestamptz;

comment on column public.integration_events.payload_redacted_at is
  'Timestamp when the provider payload body was redacted after safe terminal processing. Event identity/history remain intact.';

create or replace function public.integration_redact_event_payloads(
  p_before timestamptz,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redacted integer := 0;
begin
  if p_before is null then
    raise exception 'retention cutoff is required';
  end if;

  if p_before > now() then
    raise exception 'retention cutoff cannot be in the future';
  end if;

  with candidates as (
    select e.id
      from public.integration_events e
     where e.status in ('processed', 'ignored')
       and e.processed_at is not null
       and e.processed_at < p_before
       and e.payload_redacted_at is null
       and e.payload <> '{}'::jsonb
     order by e.processed_at asc, e.received_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
  ), redacted as (
    update public.integration_events e
       set payload = '{}'::jsonb,
           payload_redacted_at = now()
      from candidates c
     where e.id = c.id
    returning e.id
  )
  select count(*)::integer into v_redacted from redacted;

  return v_redacted;
end;
$$;

revoke all on function public.integration_redact_event_payloads(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.integration_redact_event_payloads(timestamptz, integer) to service_role;

comment on function public.integration_redact_event_payloads(timestamptz, integer) is
  'Redacts old processed/ignored provider payload bodies in bounded batches. Does not delete inbox rows and never touches pending, processing, retry or dead-letter events.';
