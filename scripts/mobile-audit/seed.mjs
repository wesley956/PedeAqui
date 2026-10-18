// Auditoria mobile: cria o dono e a loja de teste no Supabase LOCAL descartável.
// Nunca roda contra o projeto hospedado.
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anon = process.env.LOCAL_ANON_KEY;
const service = process.env.LOCAL_SERVICE_KEY;
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("local only");

const admin = createClient(url, service, { auth: { persistSession: false } });
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Dono Teste" } });
if (created.error) throw created.error;

const client = createClient(url, anon, { auth: { persistSession: false } });
const signed = await client.auth.signInWithPassword({ email, password });
if (signed.error) throw signed.error;

const { data, error } = await client.rpc("bootstrap_commercial_organization", {
  p_organization_name: "Salgados da Vila LTDA",
  p_store_name: "Salgados da Vila",
  p_store_slug: "salgados-da-vila",
  p_business_type: "restaurant",
  p_plan_key: "management",
});
if (error) throw error;
process.stdout.write(JSON.stringify({ user: created.data.user.id, org: data.organization_id, store: data.store_id }));
