#!/usr/bin/env python3
"""Production Next build, real SSR cookies, real private media. Local IPC only."""
import hashlib
import hmac
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

data = json.load(sys.stdin)
api = data["apiUrl"]
if urllib.parse.urlparse(api).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit("TENANT_NEXT_REFUSED_NONLOCAL")
db = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def require(condition, label):
    if not condition:
        raise SystemExit("TENANT_NEXT_FAILED=" + label)
    print("TENANT_NEXT_PASS=" + label, flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def app_request(path, cookie="", method="GET", body=None, headers=None, forbidden_fragment=None):
    request = urllib.request.Request("http://127.0.0.1:3000" + path, method=method, data=body, headers={"Cookie": cookie, **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
            content = response.read()
            require(not forbidden_fragment or forbidden_fragment.encode() not in content, "private_message_not_in_response")
            return response.status, response.headers.get("Location")
    except urllib.error.HTTPError as error:
        content = error.read()
        require(not forbidden_fragment or forbidden_fragment.encode() not in content, "private_message_not_in_error")
        return error.code, error.headers.get("Location")


statements = ["begin;"]
media_ids = ["11740000-0000-4000-8000-000000000071", "11740000-0000-4000-8000-000000000072"]
for i in range(2):
    org, store, conversation, contact = (data[key][i] for key in ("orgs", "stores", "conversations", "contacts"))
    message = f"11740000-0000-4000-8000-00000000006{i+1}"
    path = f"{org}/{store}/{conversation}/{message}/proof.pdf"
    content = b"%PDF-1.4\n% synthetic local tenant proof\n%%EOF\n"
    req = urllib.request.Request(api + "/storage/v1/object/conversation-media/" + path, method="POST", data=content,
        headers={"apikey": data["serviceKey"], "Authorization": "Bearer " + data["serviceKey"], "Content-Type": "application/pdf"})
    with urllib.request.urlopen(req, timeout=15) as response:
        require(response.status in (200, 201), f"{i}_media_object_created")
    statements.extend([
        f"update public.store_conversation_settings set provider='meta_cloud',whatsapp_enabled=true,whatsapp_phone_number_id='11740000{i+1}' where store_id='{store}';",
        f"insert into public.messages(organization_id,store_id,conversation_id,contact_id,provider,direction,sender_type,delivery_status,body,external_message_id) values ('{org}','{store}','{conversation}','{contact}','meta_cloud','outbound','system','sent','Synthetic receipt','tenant-status-{i}');",
        f"insert into public.messages(id,organization_id,store_id,conversation_id,contact_id,direction,sender_type,delivery_status,body) values ('{message}','{org}','{store}','{conversation}','{contact}','inbound','contact','received','Private tenant {i} sentinel');",
        f"insert into public.message_media(id,organization_id,store_id,conversation_id,message_id,media_kind,mime_type,storage_path,size_bytes,sha256,status) values ('{media_ids[i]}','{org}','{store}','{conversation}','{message}','document','application/pdf','{path}',{len(content)},'{hashlib.sha256(content).hexdigest()}','ready');",
    ])
statements.append("commit;")
fixture = subprocess.run(["psql", db, "-X", "-v", "ON_ERROR_STOP=1"], input="\n".join(statements), capture_output=True, text=True)
require(fixture.returncode == 0, "media_db_fixture")
env = {**os.environ, "NEXT_PUBLIC_SUPABASE_URL": api, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": data["anonKey"],
       "SUPABASE_SERVICE_ROLE_KEY": data["serviceKey"], "APP_URL": "http://127.0.0.1:3000", "LOG_LEVEL": "error",
       "PEDEAQUI_BILLING_WHATSAPP_ENABLED": "false", "CRON_SECRET": "local-isolation-cron-only", "WHATSAPP_APP_SECRET": "local-isolation-app-only"}
build = subprocess.run(["npm", "run", "build"], env=env, capture_output=True, timeout=600)
require(build.returncode == 0, "production_next_build")
with tempfile.TemporaryFile() as log:
    server = subprocess.Popen(["node_modules/.bin/next", "start", "-H", "127.0.0.1", "-p", "3000"], env=env, stdout=log, stderr=log)
    try:
        ready = False
        for _ in range(80):
            try:
                ready = app_request("/login")[0] == 200
            except (OSError, urllib.error.URLError):
                pass
            if ready or server.poll() is not None:
                break
            time.sleep(0.5)
        require(ready, "next_ready")
        for i in range(2):
            bridge = subprocess.run(["node", "scripts/tenant-ssr-session.mjs"], input=json.dumps({"apiUrl": api, "anonKey": data["anonKey"], "session": data["sessions"][i]}), capture_output=True, text=True, timeout=30)
            require(bridge.returncode == 0, f"{i}_real_ssr_session")
            auth_cookie = "; ".join(cookie["name"] + "=" + cookie["value"] for cookie in json.loads(bridge.stdout))
            cookie = auth_cookie + f"; cruz_org_id={data['orgs'][i]}; cruz_store_id={data['stores'][i]}"
            other = 1 - i
            own = f"/api/conversations/{data['conversations'][i]}/media/{media_ids[i]}"
            foreign = f"/api/conversations/{data['conversations'][other]}/media/{media_ids[other]}"
            code, location = app_request(own, cookie)
            require(code == 307 and location and data["orgs"][i] in urllib.parse.unquote(location), f"{i}_own_signed_url_positive")
            for label, path, attack_cookie in (
                ("foreign_resource_ids", foreign, cookie),
                ("foreign_media_own_conversation", f"/api/conversations/{data['conversations'][i]}/media/{media_ids[other]}", cookie),
                ("foreign_store_cookie", own, auth_cookie + f"; cruz_org_id={data['orgs'][i]}; cruz_store_id={data['stores'][other]}"),
                ("foreign_org_and_store_cookies", foreign, auth_cookie + f"; cruz_org_id={data['orgs'][other]}; cruz_store_id={data['stores'][other]}"),
                ("foreign_query_scope", foreign + f"?download=1&organization_id={data['orgs'][other]}&store_id={data['stores'][other]}", cookie),
            ):
                code, location = app_request(path, attack_cookie)
                require(code == 404 and not location, f"{i}_{label}_denied")
            own_messages = f"/api/conversations/{data['conversations'][i]}/messages"
            code, _ = app_request(own_messages, cookie)
            require(code == 200, f"{i}_own_messages_positive")
            for label, target, attack_cookie in (
                ("foreign_messages", f"/api/conversations/{data['conversations'][other]}/messages", cookie),
                ("foreign_messages_forged_cookies", f"/api/conversations/{data['conversations'][other]}/messages", auth_cookie + f"; cruz_org_id={data['orgs'][other]}; cruz_store_id={data['stores'][other]}"),
            ):
                code, _ = app_request(target, attack_cookie, forbidden_fragment=f"Private tenant {other} sentinel")
                # These handlers throw on invalid scope; no private response is emitted.
                require(code in (401, 403, 404, 500), f"{i}_{label}_denied")
            for route in ("order-notifications", "conversation-auto-close", "subscription-renewals", "payment-reconciliation"):
                code, _ = app_request("/api/internal/" + route, cookie)
                require(code == 401, f"{i}_{route}_session_not_worker_authority")
        code, location = app_request(f"/api/conversations/{data['conversations'][1]}/media/{media_ids[1]}")
        require(code == 404 and not location, "anonymous_signed_url_denied")
        def delivery_state(index):
            result = subprocess.run(["psql", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", f"select delivery_status from public.messages where store_id='{data['stores'][index]}' and external_message_id='tenant-status-{index}'"], capture_output=True, text=True)
            require(result.returncode == 0, "webhook_truth_query")
            return result.stdout.strip()

        for i in range(2):
            other = 1 - i
            def status_event(message_index):
                return json.dumps({"object": "whatsapp_business_account", "organization_id": data["orgs"][other], "store_id": data["stores"][other], "entry": [{"id": "local-waba", "changes": [{"field": "messages", "value": {"metadata": {"phone_number_id": f"11740000{i+1}"}, "statuses": [{"id": f"tenant-status-{message_index}", "status": "delivered", "timestamp": "1790922000", "recipient_id": "5519999990000"}]}}]}]}).encode()
            target = "/api/webhooks/whatsapp?organization_id=" + data["orgs"][other] + "&store_id=" + data["stores"][other]
            payload = status_event(other)
            code, _ = app_request(target, method="POST", body=payload, headers={"Content-Type": "application/json", "x-hub-signature-256": "sha256=invalid"})
            require(code == 401, f"{i}_webhook_invalid_signature_denied")
            before = delivery_state(other)
            signature = "sha256=" + hmac.new(b"local-isolation-app-only", payload, hashlib.sha256).hexdigest()
            code, _ = app_request(target, method="POST", body=payload, headers={"Content-Type": "application/json", "x-hub-signature-256": signature})
            require(code == 200 and delivery_state(other) == before, f"{i}_signed_webhook_foreign_message_no_mutation")
            payload = status_event(i)
            signature = "sha256=" + hmac.new(b"local-isolation-app-only", payload, hashlib.sha256).hexdigest()
            code, _ = app_request(target, method="POST", body=payload, headers={"Content-Type": "application/json", "x-hub-signature-256": signature})
            require(code == 200 and delivery_state(i) == "delivered", f"{i}_signed_webhook_own_status_positive")
        print("TENANT_NEXT_RESULT=passed", flush=True)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()
