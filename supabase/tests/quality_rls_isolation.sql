-- PedeAqui quality [118] — isolamento multiempresa.
-- Rodar em conexão administrativa de TESTE. Tudo é revertido no final.
begin;

insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111','quality-a@example.invalid'),
  ('b2222222-2222-4222-8222-222222222222','quality-b@example.invalid');

insert into public.organizations (id,name,created_by) values
  ('a0000000-0000-4000-8000-000000000001','Quality Org A','a1111111-1111-4111-8111-111111111111'),
  ('b0000000-0000-4000-8000-000000000002','Quality Org B','b2222222-2222-4222-8222-222222222222');

insert into public.stores (id,organization_id,name,slug,status) values
  ('a0000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','Loja A','quality-a','active'),
  ('b0000000-0000-4000-8000-000000000022','b0000000-0000-4000-8000-000000000002','Loja B','quality-b','active');

insert into public.roles (id,organization_id,key,name) values
  ('a0000000-0000-4000-8000-000000000101','a0000000-0000-4000-8000-000000000001','quality_viewer','Quality Viewer A'),
  ('b0000000-0000-4000-8000-000000000102','b0000000-0000-4000-8000-000000000002','quality_viewer','Quality Viewer B');

insert into public.role_permissions (role_id,permission_id)
select 'a0000000-0000-4000-8000-000000000101', id from public.permissions where key='customers.view';
insert into public.role_permissions (role_id,permission_id)
select 'b0000000-0000-4000-8000-000000000102', id from public.permissions where key='customers.view';

insert into public.organization_members (organization_id,user_id,role_id,status) values
  ('a0000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-000000000101','active'),
  ('b0000000-0000-4000-8000-000000000002','b2222222-2222-4222-8222-222222222222','b0000000-0000-4000-8000-000000000102','active');

insert into public.customers (id,organization_id,name) values
  ('a0000000-0000-4000-8000-000000000201','a0000000-0000-4000-8000-000000000001','Cliente A'),
  ('b0000000-0000-4000-8000-000000000202','b0000000-0000-4000-8000-000000000002','Cliente B');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);

do $$
declare v_count integer; v_foreign integer;
begin
  select count(*) into v_count from public.customers;
  select count(*) into v_foreign from public.customers where organization_id='b0000000-0000-4000-8000-000000000002';
  if v_count <> 1 then raise exception 'RLS isolation failed: expected 1 visible customer, got %', v_count; end if;
  if v_foreign <> 0 then raise exception 'cross-tenant customer leaked'; end if;
end $$;

reset role;
rollback;
