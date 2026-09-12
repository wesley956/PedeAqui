-- #1023 — métricas reais e isolamento multiempresa. Executado 3x pelo chaos runner.
begin;

insert into auth.users(id,email) values
  ('a0230000-0000-4000-8000-000000000001','growth-observability-a@example.invalid'),
  ('b0230000-0000-4000-8000-000000000002','growth-observability-b@example.invalid');
insert into public.organizations(id,name,created_by) values
  ('a0230000-0000-4000-8000-000000000011','Growth Metrics A','a0230000-0000-4000-8000-000000000001'),
  ('b0230000-0000-4000-8000-000000000022','Growth Metrics B','b0230000-0000-4000-8000-000000000002');
insert into public.stores(id,organization_id,name,slug,status) values
  ('a0230000-0000-4000-8000-000000000111','a0230000-0000-4000-8000-000000000011','Loja Métricas A','growth-metrics-a','active'),
  ('b0230000-0000-4000-8000-000000000222','b0230000-0000-4000-8000-000000000022','Loja Métricas B','growth-metrics-b','active');
insert into public.customers(id,organization_id,name,phone_normalized) values
  ('a0230000-0000-4000-8000-000000001111','a0230000-0000-4000-8000-000000000011','Cliente A','5511999990001'),
  ('b0230000-0000-4000-8000-000000002222','b0230000-0000-4000-8000-000000000022','Cliente B','5511999990001');
insert into public.campaigns(id,organization_id,store_id,name,channel,content,status) values
  ('a0230000-0000-4000-8000-000000011111','a0230000-0000-4000-8000-000000000011','a0230000-0000-4000-8000-000000000111','Campanha A','whatsapp','A','draft'),
  ('b0230000-0000-4000-8000-000000022222','b0230000-0000-4000-8000-000000000022','b0230000-0000-4000-8000-000000000222','Campanha B','whatsapp','B','draft');
insert into public.campaign_recipients(
  id,organization_id,store_id,campaign_id,customer_id,customer_name_snapshot,phone_snapshot,status,processed_at,sent_at,delivered_at,read_at,last_status_at
) values
  ('a0230000-0000-4000-8000-000000111111','a0230000-0000-4000-8000-000000000011','a0230000-0000-4000-8000-000000000111','a0230000-0000-4000-8000-000000011111','a0230000-0000-4000-8000-000000001111','Cliente A','5511999990001','read',now(),now(),now(),now(),now()),
  ('b0230000-0000-4000-8000-000000222222','b0230000-0000-4000-8000-000000000022','b0230000-0000-4000-8000-000000000222','b0230000-0000-4000-8000-000000022222','b0230000-0000-4000-8000-000000002222','Cliente B','5511999990001','delivered',now(),now(),now(),null,now());

select public.growth_record_operational_event_internal(
  'a0230000-0000-4000-8000-000000000011','a0230000-0000-4000-8000-000000000111',
  'campaign.worker','success',null,'isolated_test',null,null,null,'{"claimed":1,"sent":1}'::jsonb,5
);

do $$
declare v_a jsonb; v_b jsonb;
begin
  v_a:=public.growth_campaign_metrics_internal('a0230000-0000-4000-8000-000000000011','a0230000-0000-4000-8000-000000000111',30,7);
  v_b:=public.growth_campaign_metrics_internal('b0230000-0000-4000-8000-000000000022','b0230000-0000-4000-8000-000000000222',30,7);
  if jsonb_array_length(v_a->'campaigns')<>1 or (v_a#>>'{campaigns,0,campaign_id}')::uuid<>'a0230000-0000-4000-8000-000000011111' then raise exception 'organization A campaign metrics leaked or disappeared'; end if;
  if (v_a#>>'{campaigns,0,sent}')::integer<>1 or (v_a#>>'{campaigns,0,delivered}')::integer<>1 or (v_a#>>'{campaigns,0,read}')::integer<>1 then raise exception 'provider milestones were not preserved'; end if;
  if jsonb_array_length(v_b->'campaigns')<>1 or (v_b#>>'{campaigns,0,campaign_id}')::uuid<>'b0230000-0000-4000-8000-000000022222' then raise exception 'organization B campaign metrics leaked or disappeared'; end if;
  if jsonb_array_length(v_a->'operations')<>1 or jsonb_array_length(v_b->'operations')<>0 then raise exception 'operational event crossed store scope'; end if;
  if v_a->>'methodology' not like '%não representam causalidade garantida%' then raise exception 'attribution methodology missing'; end if;
end $$;

rollback;
