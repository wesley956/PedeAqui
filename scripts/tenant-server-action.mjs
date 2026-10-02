import fs from 'node:fs';
import { createRequire } from 'node:module';

// Disposable localhost only. Never print cookies, replies or tokens.
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const require = createRequire(import.meta.url);
const { encodeReply } = require('next/dist/compiled/react-server-dom-webpack/client.node');
const form = new FormData();
for (const [key, value] of Object.entries(input.fields)) form.set(key, value);
const body = await encodeReply([form]);
const response = await fetch('http://127.0.0.1:3000/m/tenant-http-0/checkout', {
  method: 'POST', redirect: 'manual', body,
  headers: { 'Next-Action': input.actionId, Cookie: input.cookie, Origin: 'http://127.0.0.1:3000' },
  signal: AbortSignal.timeout(30000),
});
await response.arrayBuffer();
process.stdout.write(JSON.stringify({ status: response.status }));
