#!/usr/bin/env python3
"""Production Next build, real SSR cookies, real private media. Local IPC only."""
import hashlib
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


def app_request(path, cookie=""):
    request = urllib.request.Request("http://127.0.0.1:3000" + path, headers={"Cookie": cookie})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
            return response.status, response.headers.get("Location")
    except urllib.error.HTTPError as error:
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
        f"insert into public.messages(id,organization_id,store_id,conversation_id,contact_id,direction,sender_type,delivery_status,body) values ('{message}','{org}','{store}','{conversation}','{contact}','inbound','contact','received','Local fixture');",
        f"insert into public.message_media(id,organization_id,store_id,conversation_id,message_id,media_kind,mime_type,storage_path,size_bytes,sha256,status) values ('{media_ids[i]}','{org}','{store}','{conversation}','{message}','document','application/pdf','{path}',{len(content)},'{hashlib.sha256(content).hexdigest()}','ready');",
    ])
statements.append("commit;")
fixture = subprocess.run(["psql", db, "-X", "-v", "ON_ERROR_STOP=1"], input="\n".join(statements), capture_output=True, text=True)
require(fixture.returncode == 0, "media_db_fixture")
env = {**os.environ, "NEXT_PUBLIC_SUPABASE_URL": api, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": data["anonKey"],
       "SUPABASE_SERVICE_ROLE_KEY": data["serviceKey"], "APP_URL": "http://127.0.0.1:3000", "LOG_LEVEL": "error",
       "PEDEAQUI_BILLING_WHATSAPP_ENABLED": "false"}
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
        code, location = app_request(f"/api/conversations/{data['conversations'][1]}/media/{media_ids[1]}")
        require(code == 404 and not location, "anonymous_signed_url_denied")
        print("TENANT_NEXT_RESULT=passed", flush=True)
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill(); server.wait()
