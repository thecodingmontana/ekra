#!/usr/bin/env bash
# The `ekra` command on a server (installed by scripts/setup.sh):
#   ekra up        build and start everything, wait until it answers
#   ekra update    if the repo has a newer version: back up the database, pull, rebuild, migrate, restart;
#                  if the new version doesn't come up healthy, go back to the old code and database
#   ekra backup    dump the database to /var/backups/ekra (keeps the last 14)
#   ekra status | logs [service] | restart
set -euo pipefail

DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
BRANCH="${EKRA_BRANCH:-main}"
BACKUPS=/var/backups/ekra
cd "$DIR"
PORT="$(sed -n 's/^EKRA_PORT=//p' .env | head -1)"
PORT="${PORT:-3000}"

compose() { docker compose --env-file .env -f infra/docker-compose.prod.yml "$@"; }
say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }

healthy() {
	for _ in $(seq 1 60); do
		curl -fsS -o /dev/null http://127.0.0.1:$PORT/api/health && return 0
		sleep 3
	done
	return 1
}

up() {
	compose up -d --build --remove-orphans
	healthy || die "Ekra didn't come up: ekra logs"
	say "Ekra is running"
}

backup() {
	mkdir -p "$BACKUPS"
	local file
	file="$BACKUPS/ekra-$(date +%Y%m%d-%H%M%S).dump"
	compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' >"$file"
	ls -1t "$BACKUPS"/ekra-*.dump | tail -n +15 | xargs -r rm --
	printf '%s' "$file"
}

restore() {
	compose exec -T postgres sh -c \
		'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' <"$1"
}

update() {
	git fetch -q origin "$BRANCH"
	local current next file
	current="$(git rev-parse HEAD)"
	next="$(git rev-parse "origin/$BRANCH")"
	if [[ "$current" == "$next" ]]; then
		say "Already up to date ($(git log -1 --format='%h %s'))"
		return
	fi
	say "Updating $(git rev-parse --short HEAD) → $(git rev-parse --short "$next")"
	file="$(backup)"
	say "Database backed up to $file"
	git merge -q --ff-only "origin/$BRANCH" || die "Local changes in $DIR block the update; nothing changed."
	if compose up -d --build --remove-orphans && healthy; then
		say "Updated to $(git log -1 --format='%h %s')"
		return
	fi
	say "The new version isn't healthy: rolling back to $(git rev-parse --short "$current")"
	git reset -q --hard "$current"
	restore "$file"
	up
	die "Update rolled back; the old version is running. See: ekra logs"
}

case "${1:-}" in
up) up ;;
update) update ;;
backup) say "Saved $(backup)" ;;
restart) compose restart ;;
status) compose ps ;;
logs) compose logs -f --tail=200 "${@:2}" ;;
*) die "Usage: ekra up | update | backup | restart | status | logs [service]" ;;
esac
