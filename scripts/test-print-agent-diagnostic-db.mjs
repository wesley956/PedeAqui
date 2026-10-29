// Isolated PostgreSQL engine; no Supabase project, credentials or restaurant data.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PEDEAQUI_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const org = "00000000-0000-4000-8000-000000000001";
const store = "00000000-0000-4000-8000-000000000002";
const agent = "00000000-0000-4000-8000-000000000003";
const other = "00000000-0000-4000-8000-000000000004";
const actor = "00000000-0000-4000-8000-000000000005";
const key = "00000000-0000-4000-8000-000000000006";
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.organizations(id uuid primary key);
    create table public.stores(id uuid primary key);
    create table public.print_agents(id uuid primary key, organization_id uuid, store_id uuid, active boolean default true);
    insert into public.organizations values('${org}'); insert into public.stores values('${store}');
    insert into public.print_agents values('${agent}','${org}','${store}',true),('${other}','${org}','${store}',true);
    create function public.print_agent_heartbeat_internal(uuid,text,jsonb,jsonb) returns boolean language sql as 'select true';
    grant select, update on public.print_agents to service_role;
  `);
  const sql = await readFile(new URL("../supabase/sql/234_print_agent_on_demand_diagnostics.sql", import.meta.url), "utf8");
  await db.exec(sql);
  // Repeatability matters for restoring deployments and local application.
  await db.exec(sql);
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
  await db.exec("set role service_role");
  const request = () => scalar("select public.print_agent_request_diagnostic_internal($1,$2,$3,$4,$5) as value", [agent, org, store, actor, key]);
  const id = await request();
  assert.equal(await request(), id, "same intent must be idempotent");
  assert.equal(await scalar("select public.print_agent_request_diagnostic_internal($1,$2,$3,$4,gen_random_uuid()) as value", [agent, org, store, actor]), id, "two clicks must share one pending request");
  await assert.rejects(() => scalar("select public.print_agent_request_diagnostic_internal($1,$2,$3,$4,gen_random_uuid()) as value", [agent, other, store, actor]), /agent unavailable/);
  const idle = await scalar("select public.print_agent_heartbeat_diagnostic_internal($1,'0.8.0','{}','[]') as value", [agent]);
  assert.equal(idle.diagnostic, null, "legacy agents must not receive commands");
  const command = await scalar("select public.print_agent_heartbeat_diagnostic_internal($1,'0.8.0','{\"onDemandDiagnostics\":true}','[]') as value", [agent]);
  assert.equal(command.diagnostic.id, id);
  assert.equal((await scalar("select public.print_agent_heartbeat_diagnostic_internal($1,'0.8.0','{\"onDemandDiagnostics\":true}','[]') as value", [other])).diagnostic, null);
  assert.equal(await scalar("select public.print_agent_complete_diagnostic_internal($1,$2,'{}') as value", [other, id]), "unavailable");
  assert.equal(await scalar("select public.print_agent_complete_diagnostic_internal($1,$2,'{\"first\":true}') as value", [agent, id]), "completed");
  assert.equal(await scalar("select public.print_agent_complete_diagnostic_internal($1,$2,'{\"second\":true}') as value", [agent, id]), "completed");
  assert.deepEqual(await scalar("select report as value from public.print_agent_diagnostics where id=$1", [id]), { first: true });
  await assert.rejects(() => scalar("select public.print_agent_request_diagnostic_internal($1,$2,$3,$4,gen_random_uuid()) as value", [agent, org, store, actor]), /rate limit/);
  await db.query("update public.print_agent_diagnostics set requested_at=now()-interval '2 minutes' where id=$1", [id]);
  const next = await scalar("select public.print_agent_request_diagnostic_internal($1,$2,$3,$4,gen_random_uuid()) as value", [agent, org, store, actor]);
  await db.query("update public.print_agent_diagnostics set requested_at=now()-interval '8 days', expires_at=now()-interval '1 day' where id=$1", [next]);
  assert.equal(await scalar("select public.print_agent_complete_diagnostic_internal($1,$2,'{}') as value", [agent, next]), "expired");
  const cancelled = await scalar("select public.print_agent_request_diagnostic_internal($1,$2,$3,$4,gen_random_uuid()) as value", [agent, org, store, actor]);
  await db.query("update public.print_agent_diagnostics set status='cancelled' where id=$1", [cancelled]);
  assert.equal(await scalar("select public.print_agent_complete_diagnostic_internal($1,$2,'{}') as value", [agent, cancelled]), "cancelled");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(() => db.query("select * from public.print_agent_diagnostics"), /permission denied/);
    await assert.rejects(() => request(), /permission denied/);
    await assert.rejects(() => db.query("select public.print_agent_heartbeat_diagnostic_internal($1,'0.8.0','{}','[]')", [agent]), /permission denied/);
  }
  await db.exec("reset role");
  const safety = await db.query("select p.proname,p.prosecdef,p.proconfig from pg_proc p where p.proname like 'print_agent_%diagnostic%internal'");
  assert.equal(safety.rows.length, 3);
  assert.ok(safety.rows.every(row => row.prosecdef === false));
  assert.ok((await db.query("select relrowsecurity from pg_class where relname='print_agent_diagnostics'")).rows[0].relrowsecurity);
  console.log("PASS: diagnostic PostgreSQL requests, expiry, replay, scope, rate limit, RLS and execution grants.");
} finally { await db.close(); }
