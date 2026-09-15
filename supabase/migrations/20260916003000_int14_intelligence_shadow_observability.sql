-- INT-14: production-safe, store-scoped shadow observability for Intelligence Core.
-- The legacy WhatsApp path remains authoritative. This schema stores no message body or PII.

alter table public.store_conversation_settings
  add column if not exists intelligence_shadow_mode boolean not null default false;

comment on column public.store_conversation_settings.intelligence_shadow_mode is
  'Opt-in per-store observation flag. Never makes Intelligence authoritative.';

create table if not exists public.intelligence_shadow_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  request_id text not null check (char_length(request_id) between 1 and 128),
  correlation_id text not null check (char_length(correlation_id) between 1 and 128),
  channel text not null check (channel in ('whatsapp')),
  legacy_handler text not null check (legacy_handler in ('whatsapp_order','greeting','none')),
  legacy_intent text,
  legacy_tool text,
  legacy_outcome text not null check (legacy_outcome in ('outbound_recorded','waiting_agent','human','closed','escalated_no_reply')),
  next_intent text,
  next_tool text,
  next_would_handle boolean,
  capability_key text,
  capability_allowed boolean,
  capability_reason text,
  authority_operation text,
  authority_allowed boolean,
  authority_reason text,
  canonical_result_class text not null,
  audience_projection text not null default 'customer',
  fallback_observed boolean not null default false,
  handoff_observed boolean not null default false,
  comparisons jsonb not null default '{}'::jsonb check (
    jsonb_typeof(comparisons) = 'object' and pg_column_size(comparisons) <= 4096
  ),
  divergence_codes text[] not null default '{}',
  critical_mismatch boolean not null default false,
  next_error_type text,
  next_error_code text,
  legacy_duration_ms integer not null check (legacy_duration_ms between 0 and 86400000),
  next_duration_ms integer not null check (next_duration_ms between 0 and 86400000),
  duplicate_side_effect_prevented boolean not null default false,
  cross_tenant_violation boolean not null default false check (cross_tenant_violation = false),
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  constraint intelligence_shadow_observations_store_fk foreign key (organization_id, store_id)
    references public.stores(organization_id, id) on delete cascade,
  constraint intelligence_shadow_observations_conversation_fk foreign key (organization_id, store_id, conversation_id)
    references public.conversations(organization_id, store_id, id) on delete cascade,
  constraint intelligence_shadow_observations_message_fk foreign key (message_id)
    references public.messages(id) on delete cascade,
  constraint intelligence_shadow_observations_message_unique unique (organization_id, store_id, message_id),
  check (expires_at > occurred_at)
);

create index if not exists intelligence_shadow_observations_store_time_idx
  on public.intelligence_shadow_observations(organization_id, store_id, occurred_at desc);
create index if not exists intelligence_shadow_observations_divergence_idx
  on public.intelligence_shadow_observations(organization_id, store_id, critical_mismatch, occurred_at desc)
  where cardinality(divergence_codes) > 0;
create index if not exists intelligence_shadow_observations_expiry_idx
  on public.intelligence_shadow_observations(expires_at);

alter table public.intelligence_shadow_observations enable row level security;
revoke all on table public.intelligence_shadow_observations from public, anon, authenticated;
grant select on table public.intelligence_shadow_observations to authenticated;
grant select, insert, delete on table public.intelligence_shadow_observations to service_role;

drop policy if exists intelligence_shadow_observations_view on public.intelligence_shadow_observations;
create policy intelligence_shadow_observations_view
  on public.intelligence_shadow_observations for select to authenticated
  using (private.has_permission(organization_id, store_id, 'conversations.view'));

create or replace function public.intelligence_record_shadow_observation_internal(p_observation jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_organization_id uuid := (p_observation->>'organization_id')::uuid;
  v_store_id uuid := (p_observation->>'store_id')::uuid;
  v_conversation_id uuid := (p_observation->>'conversation_id')::uuid;
  v_message_id uuid := (p_observation->>'message_id')::uuid;
begin
  if jsonb_typeof(p_observation) <> 'object' or pg_column_size(p_observation) > 16384 then
    raise exception 'invalid shadow observation';
  end if;
  if not exists (
    select 1 from public.conversations
    where organization_id = v_organization_id and store_id = v_store_id and id = v_conversation_id
  ) then
    raise exception 'shadow observation scope mismatch';
  end if;
  if not exists (
    select 1 from public.messages
    where organization_id = v_organization_id and store_id = v_store_id
      and conversation_id = v_conversation_id and id = v_message_id
  ) then
    raise exception 'shadow observation message scope mismatch';
  end if;

  insert into public.intelligence_shadow_observations (
    organization_id, store_id, conversation_id, message_id, request_id, correlation_id, channel,
    legacy_handler, legacy_intent, legacy_tool, legacy_outcome, next_intent, next_tool, next_would_handle,
    capability_key, capability_allowed, capability_reason,
    authority_operation, authority_allowed, authority_reason,
    canonical_result_class, audience_projection, fallback_observed, handoff_observed,
    comparisons, divergence_codes, critical_mismatch, next_error_type, next_error_code,
    legacy_duration_ms, next_duration_ms, duplicate_side_effect_prevented, cross_tenant_violation
  ) values (
    v_organization_id, v_store_id, v_conversation_id, v_message_id,
    left(p_observation->>'request_id', 128), left(p_observation->>'correlation_id', 128), 'whatsapp',
    p_observation->>'legacy_handler', nullif(left(p_observation->>'legacy_intent', 80), ''),
    nullif(left(p_observation->>'legacy_tool', 80), ''), p_observation->>'legacy_outcome',
    nullif(left(p_observation->>'next_intent', 80), ''), nullif(left(p_observation->>'next_tool', 80), ''),
    case when p_observation ? 'next_would_handle' then (p_observation->>'next_would_handle')::boolean else null end,
    nullif(left(p_observation->>'capability_key', 100), ''),
    case when p_observation ? 'capability_allowed' then (p_observation->>'capability_allowed')::boolean else null end,
    nullif(left(p_observation->>'capability_reason', 120), ''),
    nullif(left(p_observation->>'authority_operation', 100), ''),
    case when p_observation ? 'authority_allowed' then (p_observation->>'authority_allowed')::boolean else null end,
    nullif(left(p_observation->>'authority_reason', 120), ''),
    left(p_observation->>'canonical_result_class', 120), 'customer',
    coalesce((p_observation->>'fallback_observed')::boolean, false),
    coalesce((p_observation->>'handoff_observed')::boolean, false),
    coalesce(p_observation->'comparisons', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_observation->'divergence_codes', '[]'::jsonb))), '{}'),
    coalesce((p_observation->>'critical_mismatch')::boolean, false),
    nullif(left(p_observation->>'next_error_type', 120), ''), nullif(left(p_observation->>'next_error_code', 120), ''),
    greatest(0, least(coalesce((p_observation->>'legacy_duration_ms')::integer, 0), 86400000)),
    greatest(0, least(coalesce((p_observation->>'next_duration_ms')::integer, 0), 86400000)),
    coalesce((p_observation->>'duplicate_side_effect_prevented')::boolean, false), false
  )
  on conflict (organization_id, store_id, message_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.intelligence_shadow_observations
    where organization_id = v_organization_id and store_id = v_store_id and message_id = v_message_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.intelligence_record_shadow_observation_internal(jsonb) from public, anon, authenticated;
grant execute on function public.intelligence_record_shadow_observation_internal(jsonb) to service_role;

comment on table public.intelligence_shadow_observations is
  'Non-authoritative, privacy-minimized INT-14 comparisons. Never contains message bodies or domain secrets.';
