import { createServerClient } from "@supabase/ssr";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { apiUrl, anonKey, session } = JSON.parse(input);
if (!["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) throw new Error("local only");
const cookies = [];
const client = createServerClient(apiUrl, anonKey, { cookies: {
  getAll: () => [], setAll: values => cookies.push(...values),
} });
const { error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
if (error || cookies.length === 0) throw new Error("local session unavailable");
// Parent captures this private IPC; it must never be echoed into CI logs.
process.stdout.write(JSON.stringify(cookies.map(({ name, value }) => ({ name, value }))));
