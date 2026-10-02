#!/usr/bin/env python3
"""Real Auth JWT + PostgREST/Storage A/B attacks. Disposable localhost only."""
import json
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

status = subprocess.run(["supabase", "status", "-o", "json"], check=True, capture_output=True, text=True)
config = json.loads(status.stdout)
api_url = config["API_URL"].rstrip("/")
parsed = urllib.parse.urlparse(api_url)
if parsed.hostname not in ("127.0.0.1", "localhost") or parsed.scheme != "http":
    raise SystemExit("TENANT_HTTP_REFUSED_NONLOCAL")
anon = config["ANON_KEY"]
service = config["SERVICE_ROLE_KEY"]
local_db = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def request(method, path, token, body=None, raw=False, prefer=None):
    payload = body if raw else json.dumps(body).encode() if body is not None else None
    headers = {"apikey": anon if token != service else service, "Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/octet-stream" if raw else "application/json"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(api_url + path, method=method, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            code, data = response.status, response.read()
    except urllib.error.HTTPError as error:
        code, data = error.code, error.read()
    try:
        result = json.loads(data) if data else None
    except (ValueError, UnicodeDecodeError):
        result = None
    return code, result


def require(condition, label):
    if not condition:
        # Never expose response bodies, credentials, password, JWT, or signed URL.
        raise SystemExit("TENANT_HTTP_FAILED=" + label)
    print("TENANT_HTTP_PASS=" + label, flush=True)


def sql(source):
    result = subprocess.run(["psql", local_db, "-X", "-v", "ON_ERROR_STOP=1"], input=source, capture_output=True, text=True)
    require(result.returncode == 0, "fixture_sql")


identities = []
sessions = []
for tenant in ("a", "b"):
    email = "tenant-http-" + tenant + "-" + secrets.token_hex(6) + "@example.invalid"
    password = secrets.token_urlsafe(32)
    code, user = request("POST", "/auth/v1/admin/users", service, {"email": email, "password": password, "email_confirm": True})
    require(code in (200, 201) and isinstance(user, dict) and bool(user.get("id")), "auth_create_" + tenant)
    user_id = str(uuid.UUID(user["id"]))
    code, login = request("POST", "/auth/v1/token?grant_type=password", anon, {"email": email, "password": password})
    require(code == 200 and bool(login.get("access_token")), "auth_login_" + tenant)
    identities.append((user_id, login["access_token"]))
    sessions.append(login)

orgs = ["11740000-0000-4000-8000-000000000001", "11740000-0000-4000-8000-000000000002"]
stores = ["11740000-0000-4000-8000-000000000011", "11740000-0000-4000-8000-000000000012"]
roles = ["11740000-0000-4000-8000-000000000021", "11740000-0000-4000-8000-000000000022"]
customers = ["11740000-0000-4000-8000-000000000031", "11740000-0000-4000-8000-000000000032"]
contacts = ["11740000-0000-4000-8000-000000000041", "11740000-0000-4000-8000-000000000042"]
conversations = ["11740000-0000-4000-8000-000000000051", "11740000-0000-4000-8000-000000000052"]
orders = ["11740000-0000-4000-8000-000000000081", "11740000-0000-4000-8000-000000000082"]
items = ["11740000-0000-4000-8000-000000000091", "11740000-0000-4000-8000-000000000092"]
statements = ["begin;"]
for index, (user_id, _) in enumerate(identities):
    org, store, role, customer, contact, conversation = (values[index] for values in (orgs, stores, roles, customers, contacts, conversations))
    statements.extend([
        f"insert into public.organizations(id,name,created_by) values ('{org}','HTTP Tenant {index}','{user_id}');",
        f"insert into public.stores(id,organization_id,name,slug,status) values ('{store}','{org}','HTTP Store {index}','tenant-http-{index}','active');",
        f"insert into public.roles(id,organization_id,key,name) values ('{role}','{org}','http_test','HTTP Test');",
        f"insert into public.role_permissions(role_id,permission_id) select '{role}',id from public.permissions where key in ('customers.view','customers.manage','conversations.view','stores.view','stores.manage','orders.view');",
        f"insert into public.organization_members(organization_id,user_id,role_id,status) values ('{org}','{user_id}','{role}','active');",
        f"insert into public.customers(id,organization_id,name) values ('{customer}','{org}','Customer {index}');",
        f"insert into public.contacts(id,organization_id,store_id,channel,name) values ('{contact}','{org}','{store}','manual','Contact {index}');",
        f"insert into public.conversations(id,organization_id,store_id,contact_id,channel,unread_count) values ('{conversation}','{org}','{store}','{contact}','manual',3);",
        f"insert into public.store_conversation_settings(organization_id,store_id) values ('{org}','{store}');",
    ])
    cart = f"11740000-0000-4000-8000-00000000010{index+1}"
    checkout = f"11740000-0000-4000-8000-00000000011{index+1}"
    statements.extend([
        f"insert into public.carts(id,organization_id,store_id,token_hash,status,subtotal_cents,total_cents,expires_at) values ('{cart}','{org}','{store}',repeat('{index+1}',64),'active',1000,1000,now()+interval '1 day');",
        f"insert into public.checkout_sessions(id,organization_id,store_id,cart_id,customer_name,customer_phone,fulfillment_type,payment_method) values ('{checkout}','{org}','{store}','{cart}','Synthetic buyer','19999990000','pickup','cash');",
        f"insert into public.orders(id,organization_id,store_id,source_cart_id,checkout_session_id,public_access_token_hash,display_number,fulfillment_type,customer_name_snapshot,customer_phone_snapshot,subtotal_cents,total_cents,payment_method_snapshot) values ('{orders[index]}','{org}','{store}','{cart}','{checkout}',repeat('{index+3}',64),1,'pickup','Synthetic buyer','19999990000',1000,1000,'cash');",
        f"insert into public.order_items(id,organization_id,store_id,order_id,product_name_snapshot,quantity,unit_base_price_cents,unit_total_price_cents,line_total_cents) values ('{items[index]}','{org}','{store}','{orders[index]}','Synthetic item',1,1000,1000,1000);",
    ])
statements.append("commit;")
sql("\n".join(statements))

for index, (_, token) in enumerate(identities):
    other = 1 - index
    for table, ids in (("customers", customers), ("conversations", conversations), ("contacts", contacts), ("stores", stores), ("orders", orders), ("order_items", items)):
        code, own = request("GET", f"/rest/v1/{table}?id=eq.{ids[index]}&select=id", token)
        require(code == 200 and own == [{"id": ids[index]}], f"{index}_{table}_own_read")
        code, foreign = request("GET", f"/rest/v1/{table}?id=eq.{ids[other]}&organization_id=eq.{orgs[other]}&select=id", token)
        require(code == 200 and foreign == [], f"{index}_{table}_known_foreign_id")
    for table, ids, change in (("orders", orders, {"order_status": "confirmed"}), ("order_items", items, {"quantity": 2})):
        code, result = request("PATCH", f"/rest/v1/{table}?id=eq.{ids[other]}", token, change, prefer="return=representation")
        require(code in (401, 403) or (code == 200 and result == []), f"{index}_{table}_foreign_mutation_denied")
    code, result = request("POST", "/rest/v1/rpc/order_transition_internal", token, {"p_order_id": orders[other], "p_domain": "order", "p_to_state": "confirmed"})
    require(code in (401, 403), f"{index}_foreign_order_transition_rpc_denied")
    code, own_write = request("PATCH", f"/rest/v1/customers?id=eq.{customers[index]}", token, {"name": "Own allowed"}, prefer="return=representation")
    require(code == 200 and len(own_write) == 1, f"{index}_customer_own_write")
    code, foreign_write = request("PATCH", f"/rest/v1/customers?id=eq.{customers[other]}", token, {"name": "Unauthorized"}, prefer="return=representation")
    require(code == 200 and foreign_write == [], f"{index}_customer_foreign_update")
    code, result = request("PATCH", f"/rest/v1/customers?id=eq.{customers[index]}", token, {"organization_id": orgs[other]}, prefer="return=representation")
    require(code in (401, 403), f"{index}_customer_move_to_foreign_org")
    code, result = request("POST", "/rest/v1/customers", token, {"organization_id": orgs[other], "name": "Unauthorized insert"})
    require(code in (401, 403), f"{index}_customer_foreign_insert")
    code, result = request("DELETE", f"/rest/v1/customers?id=eq.{customers[other]}", token, prefer="return=representation")
    require(code == 200 and result == [], f"{index}_customer_foreign_delete")
    code, result = request("PATCH", f"/rest/v1/conversations?id=eq.{conversations[other]}", token, {"unread_count": 0}, prefer="return=representation")
    require(code in (401, 403), f"{index}_conversation_foreign_mutation")
    code, result = request("GET", f"/rest/v1/store_conversation_settings?store_id=eq.{stores[other]}", token)
    require(code in (401, 403), f"{index}_server_only_configuration")
    for rpc, body in (
        ("conversation_mark_read_internal", {"p_conversation_id": conversations[other]}),
        ("order_notification_claim_for_order_internal", {"p_order_id": orders[other], "p_worker_id": "tenant-http-attacker", "p_limit": 1}),
    ):
        code, result = request("POST", "/rest/v1/rpc/" + rpc, token, body)
        require(code in (401, 403, 404), f"{index}_internal_rpc_{rpc}_denied")

code, result = request("GET", "/rest/v1/customers?select=id", anon)
require(code in (401, 403) or (code == 200 and result == []), "anonymous_customer_denied")
code, result = request("POST", "/storage/v1/bucket", service, {"id": "conversation-media", "name": "conversation-media", "public": False})
require(code in (200, 201, 400, 409), "private_bucket_setup")
path = orgs[1] + "/" + stores[1] + "/tenant-b-proof.bin"
code, result = request("POST", "/storage/v1/object/conversation-media/" + path, service, b"private-tenant-b-fixture", raw=True)
require(code in (200, 201), "private_object_exists")
code, result = request("POST", "/storage/v1/object/sign/conversation-media/" + path, service, {"expiresIn": 60})
require(code == 200 and isinstance(result, dict) and bool(result.get("signedURL")), "private_object_service_control")
code, result = request("POST", "/storage/v1/object/sign/conversation-media/" + path, identities[0][1], {"expiresIn": 60})
require(code in (400, 401, 403, 404) and not (isinstance(result, dict) and result.get("signedURL")), "tenant_a_cannot_sign_b_media")
code, result = request("GET", "/storage/v1/object/conversation-media/" + path, identities[0][1])
require(code in (400, 401, 403, 404), "tenant_a_cannot_read_b_media")
code, result = request("GET", "/storage/v1/object/public/conversation-media/" + path, anon)
require(code in (400, 401, 403, 404), "private_object_not_public")

# Assert blocked requests left B's private resource intact using admin truth.
code, result = request("GET", f"/rest/v1/conversations?id=eq.{conversations[1]}&select=unread_count", service)
require(code == 200 and result == [{"unread_count": 3}], "foreign_rpc_and_mutation_no_side_effect")
for order_id in orders:
    code, result = request("GET", f"/rest/v1/orders?id=eq.{order_id}&select=order_status,total_cents", service)
    require(code == 200 and result == [{"order_status": "pending_confirmation", "total_cents": 1000}], "order_unchanged_after_attacks")
print("TENANT_HTTP_RESULT=passed", flush=True)

# Private local IPC carries disposable keys/session to the real Next HTTP proof.
next_matrix = subprocess.run(["python3", "scripts/run-tenant-next-isolation.py"], input=json.dumps({
    "apiUrl": api_url, "anonKey": anon, "serviceKey": service, "sessions": sessions,
    "orgs": orgs, "stores": stores, "contacts": contacts, "conversations": conversations,
}), text=True)
require(next_matrix.returncode == 0, "next_http_matrix")
