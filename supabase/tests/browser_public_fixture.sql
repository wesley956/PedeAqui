-- Synthetic public menus for the disposable Browser Homologation database only.
begin;
insert into auth.users(id,email) values ('bc000000-0000-4000-8000-000000000001','browser@example.invalid');
insert into public.organizations(id,name,created_by) values ('bc000000-0000-4000-8000-000000000002','Browser Fixture','bc000000-0000-4000-8000-000000000001');
insert into public.stores(id,organization_id,name,slug,status,timezone) values
 ('bc000000-0000-4000-8000-000000000011','bc000000-0000-4000-8000-000000000002','Cardápio de demonstração','browser-demo','active','UTC'),
 ('bc000000-0000-4000-8000-000000000012','bc000000-0000-4000-8000-000000000002','Evento de demonstração','browser-event-closed','active','UTC');
insert into public.store_menu_settings(organization_id,store_id,accepting_orders,active)
 select organization_id,id,true,true from public.stores where slug in ('browser-demo','browser-event-closed')
 on conflict(store_id) do update set accepting_orders=true,active=true,paused_at=null;
insert into public.store_hours(organization_id,store_id,weekday,opens_at,closes_at,closes_next_day)
 select s.organization_id,s.id,d.weekday,h.opens_at,h.closes_at,h.closes_next_day
 from public.stores s cross join generate_series(0,6) as d(weekday)
 cross join (values ('00:00'::time,'12:00'::time,false),('12:00'::time,'00:00'::time,true)) h(opens_at,closes_at,closes_next_day)
 where s.slug in ('browser-demo','browser-event-closed');
insert into public.products(id,organization_id,store_id,name,description,price_cents,active,availability) values
 ('bc000000-0000-4000-8000-000000000021','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000011','Lanche de demonstração','Produto fictício usado exclusivamente em homologação.',2500,true,'available'),
 ('bc000000-0000-4000-8000-000000000022','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000012','Lanche do evento','Produto fictício para conferir o fechamento temporário.',2500,true,'available');
insert into public.pdv_events(id,organization_id,store_id,name,starts_at,ends_at,status,close_store,closure_reason,closure_starts_at,closure_ends_at,created_by) values
 ('bc000000-0000-4000-8000-000000000031','bc000000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000012','Feira de demonstração',now()-interval '1 day',now()+interval '1 day','active',true,'Equipe em evento de demonstração',now()-interval '1 hour',now()+interval '1 hour','bc000000-0000-4000-8000-000000000001');
commit;
