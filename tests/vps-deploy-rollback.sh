#!/usr/bin/env bash
set -Eeuo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/infra/deploy-vps.sh"
bash -n "$script"
function_body="$(sed -n '/^rollback() {/,/^}/p' "$script")"
[[ -n "$function_body" ]] || { echo "Missing rollback function" >&2; exit 1; }

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
config="$workdir/nginx"
backup="$workdir/nginx.backup"
printf 'healthy nginx configuration\n' > "$backup"
printf 'broken nginx configuration\n' > "$config"
calls="$workdir/calls"

docker() {
  printf 'docker %s\n' "$*" >> "$calls"
}
systemctl() {
  printf 'systemctl %s\n' "$*" >> "$calls"
}
nginx() {
  printf 'nginx %s\n' "$*" >> "$calls"
}

active=pedeaqui-production-ready
candidate=pedeaqui-candidate-test
previous=pedeaqui-previous-300
changed=1
renamed=1
timer_was_active=1
eval "$function_body"

set +e
( false; rollback ) > "$workdir/rollback-output" 2>&1
result=$?
set -e
[[ "$result" -eq 1 ]] || { echo "Expected original failure status, got $result" >&2; exit 1; }
cmp -s "$config" "$backup" || { echo "Nginx backup was not restored" >&2; exit 1; }
for expected in \
  "nginx -t" \
  "systemctl reload nginx" \
  "docker stop pedeaqui-production-ready" \
  "docker rename pedeaqui-production-ready pedeaqui-candidate-test" \
  "docker rename pedeaqui-previous-300 pedeaqui-production-ready" \
  "docker start pedeaqui-production-ready" \
  "docker rm -f pedeaqui-candidate-test" \
  "systemctl start pedeaqui-notifications.timer"; do
  grep -Fxq "$expected" "$calls" || { echo "Missing rollback call: $expected" >&2; exit 1; }
done
echo "PASS: rollback restores Nginx, stable container name and notification timer"
