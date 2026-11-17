#!/usr/bin/env bash
set -Eeuo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/infra/deploy-vps.sh"
bash -n "$script"

# Extract only the cleanup function. Never execute the real deploy script.
function_body="$(sed -n '/^cleanup_old_releases() {/,/^}/p' "$script")"
[[ -n "$function_body" ]] || { echo 'Missing cleanup function' >&2; exit 1; }
eval "$function_body"

previous=pedeaqui-previous-300
calls="$(mktemp)"
trap 'rm -f "$calls"' EXIT

docker() {
  case "$1 $2" in
    'ps -a')
      printf '%s\n' pedeaqui-previous-100 pedeaqui-previous-200 pedeaqui-previous-300 pedeaqui-production pedaqui-previous-500
      ;;
    'inspect --format')
      printf 'sha256:test-%s\n' "$4"
      ;;
    'rm pedeaqui-previous-100'|'rm pedeaqui-previous-200')
      printf '%s\n' "$2" >> "$calls"
      ;;
    'image rm')
      return 0
      ;;
    *)
      echo "Unexpected Docker call: $*" >&2
      return 1
      ;;
  esac
}

cleanup_old_releases
[[ "$(sort "$calls")" == "$(printf '%s\n' pedeaqui-previous-100 pedeaqui-previous-200 | sort)" ]] || {
  echo "Incorrect deletion set: $(cat "$calls")" >&2
  exit 1
}
echo "PASS: cleanup preserves current rollback and ignores unrelated names"
