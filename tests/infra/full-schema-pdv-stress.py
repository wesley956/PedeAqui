"""Real PDV/payment/print RPCs against disposable full-schema Supabase only."""
import concurrent.futures, json, os, pathlib, time, uuid
import psycopg
from psycopg.types.json import Jsonb
DSN = os.environ.get('ISOLATED_PG_DSN', '')
if DSN != 'postgresql://postgres:postgres@127.0.0.1:54322/postgres':
    raise SystemExit('DISALLOWED_DATABASE: exact disposable local DSN required')
STORES, SALES, REPEATS, WORKERS = 8, 40, 3, 32
source = pathlib.Path('supabase/tests/e2e_pdv_to_kitchen.sql').read_text()
setup = source[source.index('insert into auth.users'):source.index('\ndo $$')]
base = ['e5555555-5555-4555-8555-555555555555', 'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000031', 'e0000000-0000-4000-8000-000000000041', 'e0000000-0000-4000-8000-000000000042', 'e0000000-0000-4000-8000-000000000051', 'e0000000-0000-4000-8000-000000000052']
stores = []
with psycopg.connect(DSN, autocommit=True) as c:
    for n in range(STORES):
        ids = [str(uuid.uuid4()) for _ in base]
        sql = setup
        for old, new in zip(base, ids): sql = sql.replace(old, new)
        sql = sql.replace('quality-pdv@example.invalid', f'stress-{ids[0]}@example.invalid').replace("'quality-pdv'", f"'stress-{ids[2]}'")
        with c.transaction():
            c.execute(sql)
            for method in ('pix', 'credit_card', 'debit_card'):
                c.execute('insert into public.store_payment_methods (organization_id,store_id,method,enabled) values (%s,%s,%s,true)', (ids[1],ids[2],method))
        stores.append(ids)

def payments(index):
    mode = index % 5
    if mode == 0: return [{'method':'cash','amount_cents':1590,'cash_received_cents':2000}],410
    if mode == 4: return [{'method':'cash','amount_cents':590,'cash_received_cents':1000},{'method':'pix','amount_cents':1000}],410
    return [{'method':('pix','credit_card','debit_card')[mode-1],'amount_cents':1590}],0

def sale(job):
    n, index = job
    ids = stores[n]
    pay, change = payments(index)
    started = time.perf_counter()
    with psycopg.connect(DSN, autocommit=True, connect_timeout=5) as c:
        result = c.execute('select public.pdv_create_order_internal(%s,%s,%s,%s,%s,%s)', (ids[2],Jsonb([{'product_id':ids[3],'quantity':1,'modifier_ids':[]}]),Jsonb(pay),None,f'full-schema-{ids[2]}-{index}',ids[0])).fetchone()[0]
        assert result['total_cents'] == 1590 and result['change_due_cents'] == change, result
    return n,index,result['order_id'],(time.perf_counter()-started)*1000

jobs = [(n,i) for repeat in range(REPEATS) for i in range(SALES) for n in range(STORES)]
started = time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
    results = list(pool.map(sale,jobs))
seen = {}
for n,i,order,latency in results: seen.setdefault((n,i),set()).add(order)
assert len(seen) == STORES*SALES and all(len(v)==1 for v in seen.values()), 'duplicate sale'
latencies = sorted(r[3] for r in results)
print('FULL_SCHEMA_PDV_STRESS_OK',json.dumps({'calls':len(results),'stores':STORES,'unique_orders':len(seen),'retries':len(results)-len(seen),'workers':WORKERS,'p95_ms':round(latencies[int(len(latencies)*.95)-1],1),'elapsed_s':round(time.perf_counter()-started,2),'errors':0}),flush=True)

with psycopg.connect(DSN, autocommit=True) as c:
    for ids in stores:
        rows = c.execute('select count(*),count(distinct display_number),count(*) filter(where payment_status=\'paid\' and order_status=\'confirmed\' and production_status=\'preparing\') from public.orders where store_id=%s',(ids[2],)).fetchone()
        assert rows == (SALES,SALES,SALES), rows
        ledger = c.execute('select count(*),sum(amount_cents),sum(coalesce(change_due_cents,0)) from public.payments where store_id=%s and status=\'paid\'',(ids[2],)).fetchone()
        assert ledger == (SALES + SALES//5, SALES*1590, SALES//5*2*410), ledger
        for kind in ('bad_cash','bad_total','foreign_product'):
            item = ids[3] if kind != 'foreign_product' else stores[(stores.index(ids)+1)%STORES][3]
            pay = [{'method':'cash','amount_cents':1590,'cash_received_cents':1000}] if kind=='bad_cash' else [{'method':'cash','amount_cents':1000 if kind=='bad_total' else 1590}]
            try:
                c.execute('select public.pdv_create_order_internal(%s,%s,%s,null,%s,%s)',(ids[2],Jsonb([{'product_id':item,'quantity':1,'modifier_ids':[]}]),Jsonb(pay),f'invalid-{kind}-{ids[2]}',ids[0]))
            except psycopg.Error: pass
            else: raise AssertionError(f'accepted invalid sale: {kind}')
        assert c.execute('select count(*) from public.orders where store_id=%s',(ids[2],)).fetchone()[0] == SALES
        assert c.execute('select count(*) from public.idempotency_keys where store_id=%s and idempotency_key like \'invalid-%\'',(ids[2],)).fetchone()[0] == 0, 'failed transaction leaked key'
        assert c.execute('select count(*) from public.print_jobs where store_id=%s',(ids[2],)).fetchone()[0] == SALES
print('FULL_SCHEMA_INVALID_SALES_ROLLBACK_OK',flush=True)

def drain(ids):
    claimed = []
    with psycopg.connect(DSN, autocommit=True) as c:
        while True:
            rows = c.execute('select id,store_id from public.print_agent_claim_internal(%s,5)',(ids[5],)).fetchall()
            if not rows: return claimed
            for job,store in rows:
                assert str(store) == ids[2], 'foreign print claimed'
                try: c.execute('select public.print_agent_ack_internal(%s,%s)',(ids[6],job))
                except psycopg.Error: pass
                else: raise AssertionError('wrong agent acknowledged job')
                c.execute('select public.print_agent_ack_internal(%s,%s)',(ids[5],job))
                claimed.append(str(job))
with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
    claimed = [job for group in pool.map(drain,[ids for _ in range(4) for ids in stores]) for job in group]
assert len(claimed) == len(set(claimed)) == STORES*SALES, 'duplicate or missing print claim'
with psycopg.connect(DSN, autocommit=True) as c:
    for ids in stores:
        assert c.execute('select count(*) from public.print_jobs where store_id=%s and status=\'printed\'',(ids[2],)).fetchone()[0] == SALES
print('FULL_SCHEMA_PRINT_CONCURRENCY_OK',json.dumps({'unique_jobs':len(claimed),'consumers':32,'wrong_agent_rejected':len(claimed)}),flush=True)
# Fixtures intentionally remain in disposable DB until the existing cleanup destroys it.
