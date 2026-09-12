-- #1023 — índices de apoio das dimensões opcionais de observabilidade.

create index if not exists growth_operational_events_campaign_idx
  on public.growth_operational_events(organization_id,store_id,campaign_id)
  where campaign_id is not null;

create index if not exists growth_operational_events_rule_idx
  on public.growth_operational_events(organization_id,store_id,rule_id)
  where rule_id is not null;

create index if not exists growth_operational_events_conversation_idx
  on public.growth_operational_events(organization_id,store_id,conversation_id)
  where conversation_id is not null;
