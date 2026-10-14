// Fail-closed guard for every VPS homologation workflow using synthetic data.
// This does not replace network isolation or dedicated sandbox credentials.
const vars = [
  'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'DATABASE_URL',
  'DIRECT_URL', 'POSTGRES_URL', 'SUPABASE_DB_URL',
];
const forbiddenRef = 'idyjinpeijyqcejnunwm';
const errors = [];
for (const key of vars) {
  const value = process.env[key] || '';
  if (!value) continue;
  if (value.includes(forbiddenRef)) errors.push(key + ': PRODUCTION_PROJECT_DETECTED');
  // Disallow any non-placeholder remote database from running with heavy load.
  if (key === 'NEXT_PUBLIC_SUPABASE_URL' || key === 'SUPABASE_URL') {
    if (!/^https:\/\/example\.supabase\.co\/?$/.test(value)) errors.push(key + ': NOT_ISOLATED_PLACEHOLDER');
  } else {
    errors.push(key + ': DATABASE_CONNECTION_MUST_BE_UNSET');
  }
}
for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'PAGBANK_CLIENT_SECRET',
  'META_WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN', 'CRON_SECRET']) {
  if (process.env[key]) errors.push(key + ': LIVE_OR_UNKNOWN_SECRET_MUST_BE_UNSET');
}
if (errors.length) {
  console.error('VPS_HOMOLOGATION_SAFETY_FAIL', errors.join(' | '));
  process.exit(1);
}
console.log('VPS_HOMOLOGATION_SAFETY_OK: dummy URL only; no database URL or service-side integration secret');
