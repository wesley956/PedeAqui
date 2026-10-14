"""Exercise exact checked-in checkout RPC in disposable PostgreSQL, not a rewritten model."""
import concurrent.futures
import os
import pathlib
import time
import uuid
import psycopg

dsn=os.getenv("ISOLATED_PG_DSN","")
if not dsn == "postgresql://sandbox:sandbox@127.0.0.1:5432/original_rpc":
    raise SystemExit("DISALLOWED_DATABASE: refusing non-local fixture")
original=pathlib.Path("supabase/sql/21_order_access_token.sql").read_text()
assert original.count("create or replace function public.create_order_from_checkout_internal(")>=1
header="create or replace function public.create_order_from_checkout_internal("
body=original[original.index(header):]
real_rpc=body[:body.index("$$;")+3]
assert "for update" in real_rpc and "on conflict (store_id)" in real_rpc
STORES, CARTS, REPEATS, WORKERS=8,25,3,24
org=uuid.uuid4()
stores=[uuid.uuid4() for i in range(STORES)]
carts=[]
with psycopg.connect(dsn,autocommit=True) as c:
    c.execute(real_rpc)
    for s in stores:
        for n in range(CARTS):
            cart=uuid.uuid4()
            token=uuid.uuid4().hex
            with c.transaction():
                c.execute("insert into public.carts (id,organization_id,store_id,token_hash) values (%s,%s,%s,%s)",(cart,org,s,token))
                c.execute("""insert into public.checkout_sessions
                   (organization_id,store_id,cart_id,customer_name,customer_phone_normalized,
                    customer_phone,fulfillment_type,delivery_quote_status,payment_method)
                   values (%s,%s,%s,'Cliente Ficticio','19999990000','19999990000','pickup','not_required','cash')""",(org,s,cart))
                c.execute("""insert into public.cart_items (cart_id,product_id,product_name_snapshot,quantity,
                    unit_base_price_cents,unit_modifiers_price_cents,unit_total_price_cents,line_total_cents)
                    values (%s,%s,'Produto de teste',1,5000,0,5000,5000)""",(cart,uuid.uuid4()))
            carts.append((s,cart,token))
def attempt(item):
    s,cart,token=item
    started=time.perf_counter()
    with psycopg.connect(dsn,autocommit=True,connect_timeout=5) as c:
        out=c.execute("select public.create_order_from_checkout_internal(%s,%s,%s)",
                      (s,token,"a"*64)).fetchone()[0]
    return cart,out["order_id"],out["created"],(time.perf_counter()-started)*1000
jobs=[item for item in carts for _ in range(REPEATS)]
start=time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as workers:
    results=list(workers.map(attempt,jobs))
elapsed=time.perf_counter()-start
seen={}
new=0
for cart,order,created,latency in results:
    seen.setdefault(cart,set()).add(order)
    new+=int(created)
assert len(seen)==STORES*CARTS
assert all(len(ids)==1 for ids in seen.values()),"DUPLICATE_ORDER"
assert new==STORES*CARTS,("INCORRECT_CREATED_COUNT",new)
durations=sorted(r[3] for r in results)
p95=durations[int(len(durations)*0.95)-1]
with psycopg.connect(dsn,autocommit=True) as c:
    total,distinct_cart,distinct_display=c.execute(
       "select count(*),count(distinct source_cart_id),count(distinct (store_id,display_number)) from public.orders").fetchone()
    assert (total,distinct_cart,distinct_display)==(STORES*CARTS,)*3
    seq=c.execute("select count(*),sum(last_number) from public.order_sequences").fetchone()
    assert seq==(STORES,STORES*CARTS),seq
    events=c.execute("select count(*) from public.domain_events").fetchone()[0]
    assert events==STORES*CARTS,events
    before=c.execute("select count(*) from public.orders").fetchone()[0]
    try:
        c.execute("select public.create_order_from_checkout_internal(%s,%s,%s)",
          (stores[1],carts[0][2],"b"*64))
    except psycopg.Error:
        print("ACTUAL_RPC_CROSS_STORE_DENIED")
    else:
        raise AssertionError("cross-store token accepted")
    assert c.execute("select count(*) from public.orders").fetchone()[0]==before
print("ACTUAL_CHECKOUT_RPC_OK",{"calls":len(results),"stores":STORES,"orders":total,
    "created":new,"retries":len(results)-new,"p95_ms":round(p95,1),"elapsed_s":round(elapsed,2),
    "events":events,"errors":0})
