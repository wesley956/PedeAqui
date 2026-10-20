#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
exec 9>/run/lock/pedeaqui-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
sha=${1:?Commit SHA required}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
archive="/opt/pedeaqui/incoming/$sha.tar.gz"
image="pedeaqui-production:$sha"
active=pedeaqui-production-ready
candidate="pedeaqui-candidate-${sha:0:12}"
previous="pedeaqui-previous-$(date +%s)"
config=/etc/nginx/sites-available/pedeaqui
backup=$(mktemp /etc/nginx/sites-available/pedeaqui-deploy.XXXXXX)
cp -p "$config" "$backup"
renamed=0
changed=0
timer_was_active=0
systemctl is-active --quiet pedeaqui-notifications.timer && timer_was_active=1
rollback() {
  result=$?
  trap - ERR
  set +e
  if (( changed )); then
    cp -p "$backup" "$config"
    nginx -t && systemctl reload nginx
  fi
  if (( renamed )); then
    docker stop "$active"
    docker rename "$active" "$candidate"
    docker rename "$previous" "$active"
    docker start "$active"
  fi
  docker rm -f "$candidate" >/dev/null 2>&1
  if (( timer_was_active )); then systemctl start pedeaqui-notifications.timer; fi
  echo "DEPLOY_FAILED: previous configuration restored; backup=$backup"
  exit "$result"
}
trap rollback ERR
test -s "$archive"
test -s /opt/pedeaqui/production.env
port=$(docker inspect "$active" --format '{{(index (index .HostConfig.PortBindings "3000/tcp") 0).HostPort}}')
case "$port" in
  3011) target=3012 ;;
  3012) target=3011 ;;
  *) echo 'Unexpected active port'; exit 2 ;;
esac
docker image load -i "$archive"
docker image inspect "$image" >/dev/null
docker run -d --name "$candidate" --restart unless-stopped \
  -p "127.0.0.1:$target:3000" --memory 1536m --cpus 1.8 \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env-file /opt/pedeaqui/production.env "$image"
ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$target/login"; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1
for path in /api/health /m/dona-maria-salgados-e-porcoes; do
  curl -fsS --max-time 30 -o /dev/null "http://127.0.0.1:$target$path"
done
systemctl stop pedeaqui-notifications.timer
# Wait for an in-flight notification batch before changing the stable name.
for attempt in $(seq 1 90); do
  state=$(systemctl show -p ActiveState --value pedeaqui-notifications.service)
  [[ "$state" != activating && "$state" != active ]] && break
  sleep 3
done
state=$(systemctl show -p ActiveState --value pedeaqui-notifications.service)
[[ "$state" != activating && "$state" != active ]]
docker rename "$active" "$previous"
renamed=1
docker rename "$candidate" "$active"
python3 - "$config" "$port" "$target" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
source = path.read_text()
old = f"proxy_pass http://127.0.0.1:{sys.argv[2]};"
if source.count(old) != 1:
    raise SystemExit("Unexpected nginx configuration")
path.write_text(source.replace(old, f"proxy_pass http://127.0.0.1:{sys.argv[3]};"))
PY
changed=1
nginx -t
systemctl reload nginx
for domain in pedeaqui.pp.ua www.pedeaqui.pp.ua; do
  curl -fsS --resolve "$domain:443:127.0.0.1" --max-time 30 \
    -o /dev/null "https://$domain/login"
done
if (( timer_was_active )); then systemctl start pedeaqui-notifications.timer; fi
docker stop "$previous"
printf '%s\n' "$sha" > /opt/pedeaqui/deployed-commit
rm -f "$archive"
trap - ERR
echo "DEPLOY_OK commit=$sha rollback_container=$previous nginx_backup=$backup"
