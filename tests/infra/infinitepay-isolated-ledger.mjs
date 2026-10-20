// Optional isolated PostgreSQL runtime; never connects to production.
const { PGlite } = await import(process.argv[2] ?? '@electric-sql/pglite');
import { readFileSync as read } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url).pathname;
const sql=(name)=>read(root+'supabase/sql/'+name,'utf8');
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema vault;
create table auth.users(id uuid primary key);
create table organizations(id uuid primary key);
create table stores(id uuid primary key, organization_id uuid not null references organizations(id), unique(organization_id,id));
create table orders(id uuid primary key,organization_id uuid not null, store_id uuid not null, total_cents bigint not null,
 order_status text not null default 'pending',payment_status text not null default 'pending',payment_method_snapshot text not null default 'pix', updated_at timestamptz default now(),
 unique(organization_id,store_id,id));
create table domain_events(id uuid default gen_random_uuid(),organization_id uuid,store_id uuid,event_type text,entity_type text,entity_id uuid,payload jsonb,status text,attempts integer,occurred_at timestamptz);
-- Test-only substitute for the Vault extension (encryption is supplied by Supabase in production).
create table vault.test_secrets(id uuid primary key default gen_random_uuid(),secret text,name text,description text);
create function vault.create_secret(secret text,name text,description text) returns uuid language sql as $$ insert into vault.test_secrets(secret,name,description) values($1,$2,$3) returning id $$;
create function vault.update_secret(id uuid,secret text,name text,description text) returns void language sql as $$ update vault.test_secrets set secret=$2,name=$3,description=$4 where id=$1 $$;
create function public.order_transition_internal(p_id uuid,p_axis text,p_next text,p_reason text,p_actor uuid,p_source text) returns void language sql as $$ update public.orders set payment_status=$3 where id=$1 $$;
`);
const pay=sql('28_payments.sql');
await db.exec(pay.slice(pay.indexOf('create table if not exists public.payments'),pay.indexOf('create policy payments_view')));
await db.exec(pay.slice(pay.indexOf('create or replace function public.payment_confirm_internal'),pay.indexOf('create or replace function public.payment_fail_internal')));
const conf=sql('97_order_payment_providers.sql');
await db.exec(conf.slice(0,conf.indexOf('create or replace function')));
const oauth=sql('153_mercado_pago_oauth_connection.sql');
await db.exec(oauth.slice(0,oauth.indexOf('create or replace function')));
await db.exec(sql('227_pagbank_order_payments.sql'));
await db.exec(sql('29_payment_paid_guard.sql'));
await db.exec(sql('232_infinitepay_order_checkout.sql'));
await db.exec(sql('232_infinitepay_order_checkout.sql')); // rerun safe
const org='10000000-0000-4000-8000-000000000001',store='20000000-0000-4000-8000-000000000001';
await db.exec(`insert into organizations values('${org}'); insert into stores values('${store}','${org}');`);
const q=async(query,params=[]) => (await db.query(query,params)).rows;
const reject=async(query,params,pattern) => { await assert.rejects(q(query,params),pattern); };
await q('select order_payment_provider_infinitepay_configure_internal($1,$2,$3,$4)',[store,'dona-maria','inchk_test_api_secret','a'.repeat(64)]);
let config=(await q("select * from order_payment_provider_configs where provider='infinitepay'"))[0];
assert.equal(config.enabled,false); assert.equal(config.environment,'production');
assert.ok(config.access_token_secret_id); assert.ok(config.webhook_secret_id);
assert.equal((await q('select secret from vault.test_secrets where id=$1',[config.access_token_secret_id]))[0].secret,'inchk_test_api_secret');
await q('select order_payment_provider_set_enabled_internal($1,$2,true)',[store,'infinitepay']);
const order='30000000-0000-4000-8000-000000000001', payment='40000000-0000-4000-8000-000000000001';
await q('insert into orders(id,organization_id,store_id,total_cents) values($1,$2,$3,3790)',[order,org,store]);
await q("insert into payments(id,organization_id,store_id,order_id,method,amount_cents,idempotency_key) values($1,$2,$3,$4,'pix',3790,'test-intent-1')",[payment,org,store,order]);
const reserved=(await q('select (order_payment_provider_reserve_charge_internal($1,$2)).*',[payment,'infinitepay']))[0];
assert.equal(reserved.provider,'infinitepay');
const repeated=(await q('select (order_payment_provider_reserve_charge_internal($1,$2)).*',[payment,'infinitepay']))[0];
assert.equal(repeated.id,reserved.id);
await reject('select order_payment_provider_infinitepay_configure_internal($1,$2,$3,$4)',[store,'other-account','inchk_another_api_key','a'.repeat(64)],/pending InfinitePay charges/);
const confirm='select order_payment_provider_infinitepay_confirm_internal($1,$2,$3,$4,$5,$6)';
const args=[reserved.id,store,3790,'credit_card','tx-123','invoice-456'];
await reject(confirm,[reserved.id,store,1,'credit_card','tx-123','invoice-456'],/amount mismatch/);
await reject(confirm,[reserved.id,'20000000-0000-4000-8000-000000000099',3790,'pix','tx-123','invoice-456'],/not found/);
await reject(confirm,[reserved.id,store,3790,'cash','tx-123','invoice-456'],/invalid InfinitePay payment method/);
assert.equal((await q('select status from payments where id=$1',[payment]))[0].status,'pending');
await q(confirm,args); await q(confirm,args);
assert.deepEqual((await q('select status,method,reference from payments where id=$1',[payment]))[0],{status:'paid',method:'credit_card',reference:'infinitepay:tx-123'});
assert.deepEqual((await q('select payment_status,payment_method_snapshot from orders where id=$1',[order]))[0],{payment_status:'paid',payment_method_snapshot:'credit_card'});
assert.equal((await q("select count(*)::int as count from domain_events where event_type='payment.paid'"))[0].count,1);
assert.equal((await q('select status from order_payment_provider_charges where id=$1',[reserved.id]))[0].status,'paid');
await reject(confirm,[reserved.id,store,3790,'credit_card','other-tx','invoice-456'],/transaction mismatch/);
// Provider switching is atomic and leaves issued charges intact.
await q("insert into order_payment_provider_configs(organization_id,store_id,provider,enabled,access_token_secret_id,webhook_secret_id) values($1,$2,'pagbank',false,$3,$4)",[org,store,config.access_token_secret_id,config.webhook_secret_id]);
await q('select order_payment_provider_set_enabled_internal($1,$2,true)',[store,'pagbank']);
assert.deepEqual(await q('select provider from order_payment_provider_configs where enabled'),[{provider:'pagbank'}]);
await q('select order_payment_provider_set_enabled_internal($1,$2,true)',[store,'infinitepay']);
// Canceled orders roll back ledger/method changes.
const order2='30000000-0000-4000-8000-000000000002',payment2='40000000-0000-4000-8000-000000000002';
await q("insert into orders(id,organization_id,store_id,total_cents,order_status) values($1,$2,$3,3790,'canceled')",[order2,org,store]);
await q("insert into payments(id,organization_id,store_id,order_id,method,amount_cents,idempotency_key) values($1,$2,$3,$4,'pix',3790,'test-intent-2')",[payment2,org,store,order2]);
const charge2=(await q('select (order_payment_provider_reserve_charge_internal($1,$2)).*',[payment2,'infinitepay']))[0];
await reject(confirm,[charge2.id,store,3790,'credit_card','tx-2','inv-2'],/canceled order/);
assert.deepEqual((await q('select status,method from payments where id=$1',[payment2]))[0],{status:'pending',method:'pix'});
// SQL entry points and data remain unavailable to public clients.
for (const role of ['anon','authenticated']) {
 for(const signature of ['order_payment_provider_infinitepay_configure_internal(uuid,text,text,text)','order_payment_provider_infinitepay_confirm_internal(uuid,uuid,bigint,text,text,text)','order_payment_provider_set_enabled_internal(uuid,text,boolean)']) {
  assert.equal((await q('select has_function_privilege($1,$2,\'execute\') as allowed',[role,signature]))[0].allowed,false);
 }
 assert.equal((await q('select has_table_privilege($1,\'order_payment_provider_configs\',\'select\') as allowed',[role]))[0].allowed,false);
}
assert.equal((await q("select bool_and(relrowsecurity) as protected from pg_class where relname in ('order_payment_provider_configs','order_payment_provider_charges','order_payment_provider_events')"))[0].protected,true);
console.log('PASS: SQL migration replay, Vault references, disabled setup, atomic provider switching, reservation reuse, amount/store/method validation, pending-account protection, credit settlement, idempotent ledger/events, canceled rollback, RLS and function/table grants.');
await db.close();
