import concurrent.futures, os, threading, time
import psycopg

dsn = os.getenv("ISOLATED_PG_DSN", "")
if not dsn or not any(h in dsn for h in ("localhost", "127.0.0.1")):
    raise SystemExit("ERROR: isolated DB must use localhost")
N_STORES, N_CARTS, N_RETRIES, N_WORKERS = 8, 40, 3, 32
tls=threading.local()
def db():
    if not hasattr(tls, "conn"):
        tls.conn=psycopg.connect(dsn, autocommit=True, connect_timeout=3)
    return tls.conn
with psycopg.connect(dsn,autocommit=True) as c:
    with c.cursor() as x:
        x.executemany("INSERT INTO fixture_carts(id,store_id) VALUES(%s,%s)",
            [(s*100000+i,s) for s in range(1,N_STORES+1) for i in range(N_CARTS)])
def checkout(item):
    s,i,a=item
    t=time.perf_counter()
    with db().cursor() as x:
        x.execute("SELECT fixture_pdv(%s,%s,%s)",(s,"k"+str(i),s*100000+i))
        return (s,i,x.fetchone()[0],(time.perf_counter()-t)*1000)
items=[(s,i,a) for s in range(1,N_STORES+1) for i in range(N_CARTS) for a in range(N_RETRIES)]
items.sort(key=lambda t: (t[1]+13*t[2])%N_CARTS)
start=time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=N_WORKERS) as pool:
    results=list(pool.map(checkout,items))
elapsed=time.perf_counter()-start
unique={}
for s,i,order,ms in results:
    unique.setdefault((s,i),set()).add(order)
assert len(unique)==320 and all(len(x)==1 for x in unique.values()),"duplicate checkout"
latencies=sorted(row[3] for row in results)
p95=latencies[int(.95*len(latencies))-1]
print("PG_CHECKOUT", {"requests":len(results),"orders":len(unique),"workers":N_WORKERS,
    "errors":0,"p95_ms":round(p95,1),"duration_s":round(elapsed,2)})
assert p95<5000,"excessive test-local contention"
def claim(worker):
    ids=[]
    with db().cursor() as x:
        while True:
            x.execute("""UPDATE fixture_print_jobs SET status='claimed',claimed_by=%s
                WHERE id=(SELECT id FROM fixture_print_jobs WHERE status='pending'
                ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id""",(worker,))
            row=x.fetchone()
            if row is None: return ids
            ids.append(row[0])
start=time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    claimed=[id for rows in pool.map(claim,range(16)) for id in rows]
assert len(claimed)==320 and len(set(claimed))==320,"lost or duplicate print jobs"
with psycopg.connect(dsn,autocommit=True) as c:
    with c.cursor() as x:
        x.execute("SELECT count(*),count(distinct source_cart_id),count(distinct (store_id,display_number)) FROM fixture_orders")
        assert x.fetchone()==(320,320,320),"sequence or source uniqueness broken"
        x.execute("SELECT store_id,count(*),max(display_number) FROM fixture_orders GROUP BY store_id")
        assert len(x.fetchall())==8
        try:
            x.execute("SELECT fixture_checkout(%s,%s)",(1,200001))
        except psycopg.Error:
            print("PG_CROSS_STORE_REJECTED")
        else:
            raise AssertionError("cross-store checkout permitted")
print("PG_PRINT_CLAIMS",{"unique":len(set(claimed)),"workers":16,"duration_s":round(time.perf_counter()-start,2)})
print("ISOLATED_PG_STRESS_OK: modeled transactional semantics, NOT PedeAqui production procedures")
