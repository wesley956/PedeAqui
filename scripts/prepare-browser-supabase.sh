#!/usr/bin/env bash
set -Eeuo pipefail

# CI-only fixture stack. Never links to, reads, or migrates a hosted project.
[[ "${GITHUB_ACTIONS:-}" == true && -n "${RUNNER_TEMP:-}" && -n "${GITHUB_ENV:-}" ]] || {
  echo 'This fixture requires a disposable GitHub Actions runner.' >&2; exit 1;
}
readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly fixture_root="$RUNNER_TEMP/pedeaqui-browser-supabase"
readonly fixture_db='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
mkdir -p "$fixture_root"
supabase init --workdir "$fixture_root"
# Keep generated local credentials out of build logs/artifacts.
if ! supabase start --workdir "$fixture_root" -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor > "$fixture_root/start.log" 2>&1; then
  echo 'Disposable Supabase did not start; no hosted fallback is permitted.' >&2; exit 1;
fi
psql "$fixture_db" -X -v ON_ERROR_STOP=1 -c 'create extension if not exists pg_cron with schema extensions' >/dev/null
while IFS= read -r schema_name; do
  echo "BROWSER_SCHEMA_APPLY=$schema_name"
  psql "$fixture_db" -X -v ON_ERROR_STOP=1 -f "$project_root/supabase/sql/$schema_name" >/dev/null
done < <(find "$project_root/supabase/sql" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort -t_ -k1,1n -k2,2)
# This existing public-product delta is in production but not folded into the
# canonical files. Replay its exact definition; do not invent a fixture column.
psql "$fixture_db" -X -v ON_ERROR_STOP=1 -f "$project_root/supabase/migrations/20261111224213_public_item_notes_setting.sql" >/dev/null
psql "$fixture_db" -X -v ON_ERROR_STOP=1 -f "$project_root/supabase/tests/browser_public_fixture.sql" >/dev/null
# Notify PostgREST after replaying the schema through SQL rather than the CLI.
psql "$fixture_db" -X -v ON_ERROR_STOP=1 -c "notify pgrst, 'reload schema'" >/dev/null
supabase status --workdir "$fixture_root" --output json > "$fixture_root/status.json"
chmod 600 "$fixture_root/status.json"
python3 - "$fixture_root/status.json" "$GITHUB_ENV" <<'PY'
import json, sys
from urllib.parse import urlparse
values = json.load(open(sys.argv[1]))
assert urlparse(values['API_URL']).hostname == '127.0.0.1', 'Non-local Supabase forbidden'
with open(sys.argv[2], 'a') as env:
    for target, source in [('NEXT_PUBLIC_SUPABASE_URL', 'API_URL'), ('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'ANON_KEY'), ('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY')]:
        value = values[source]
        assert value and '\n' not in value and '\r' not in value
        print('::add-mask::' + value)
        env.write(target + '=' + value + '\n')
print('BROWSER_DATABASE=disposable-loopback')
PY
