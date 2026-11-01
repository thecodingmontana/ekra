#!/usr/bin/env bash
# Install Ekra on an Ubuntu or Debian server, from scratch or over an earlier install:
#   curl -fsSL https://raw.githubusercontent.com/thecodingmontana/ekra/main/scripts/setup.sh | sudo bash
# Installs Docker if missing, gets the code, writes .env (asks a few questions), connects your proxy (Caddy, Nginx
# or Traefik; installs Caddy when there's none), starts everything, adds the `ekra` command and a nightly update.
# Safe to run again: it keeps an existing .env and proxy config.
set -euo pipefail

REPO="${EKRA_REPO:-https://github.com/thecodingmontana/ekra.git}"
DIR="${EKRA_DIR:-/opt/ekra}"
BRANCH="${EKRA_BRANCH:-main}"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }
# questions read from the terminal even when this script is piped from curl
ask() {
	local prompt="$1" default="${2:-}" answer
	if [[ -n "$default" ]]; then prompt="$prompt [$default]"; fi
	read -r -p "$prompt: " answer </dev/tty || true
	printf '%s' "${answer:-$default}"
}
secret() { openssl rand -base64 "$1" | tr -d '\n/+=' | cut -c1-"$1"; }

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash setup.sh"
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]] ||
	die "Ubuntu and Debian are supported for now (this is ${PRETTY_NAME:-unknown})."

say "Installing basics (git, curl, openssl)"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates openssl >/dev/null

if ! command -v docker >/dev/null; then
	say "Installing Docker"
	curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (install docker-compose-plugin)."
systemctl enable --now docker >/dev/null 2>&1 || true

say "Getting Ekra into $DIR"
if [[ -d "$DIR/.git" ]]; then
	git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" merge -q --ff-only "origin/$BRANCH"
else
	git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

if [[ -f .env ]]; then
	say "Keeping the existing .env"
	DOMAIN="$(sed -n 's|^BETTER_AUTH_URL=https\?://||p' .env | head -1)"
else
	say "A few questions for .env"
	DOMAIN="$(ask "Domain for Ekra (organizations get subdomains of it, e.g. acme.<domain>)")"
	[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "That doesn't look like a domain: $DOMAIN"
	EMAIL_FROM="$(ask "Send emails from" "Ekra <no-reply@$DOMAIN>")"
	RESEND_API_KEY="$(ask "Resend API key (emails; leave empty to add later)")"
	GOOGLE_CLIENT_ID="$(ask "Google client id (optional)")"
	GOOGLE_CLIENT_SECRET="$(ask "Google client secret (optional)")"
	umask 077
	cat >.env <<ENV
# Written by scripts/setup.sh. Keep this file private; back it up with the database.
NODE_ENV=production
POSTGRES_USER=ekra
POSTGRES_PASSWORD=$(secret 32)
POSTGRES_DB=ekra
S3_ACCESS_KEY=$(secret 20)
S3_SECRET_KEY=$(secret 40)
BETTER_AUTH_SECRET=$(secret 48)
BETTER_AUTH_URL=https://$DOMAIN
# the proxy reaches the app through Docker's bridge network
TRUSTED_PROXIES=172.16.0.0/12
EMAIL_PROVIDER=resend
EMAIL_FROM=$EMAIL_FROM
RESEND_API_KEY=$RESEND_API_KEY
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
ENV
	umask 022
fi
[[ -n "$DOMAIN" ]] || die "BETTER_AUTH_URL in .env has no domain."

# the host port the proxy talks to: kept from .env, else the first free one from 3000
PORT="$(sed -n 's/^EKRA_PORT=//p' .env | head -1)"
if [[ -z "$PORT" ]]; then
	for p in $(seq 3000 3999); do
		if ! ss -ltnH "( sport = :$p )" | grep -q .; then PORT=$p; break; fi
	done
	[[ -n "$PORT" ]] || die "No free port between 3000 and 3999 for Ekra."
	printf '# the port on this server the proxy forwards to (127.0.0.1 only)\nEKRA_PORT=%s\n' "$PORT" >>.env
	say "Ekra will listen on 127.0.0.1:$PORT"
fi

# ---- proxy -------------------------------------------------------------------------------------------------------

# who answers on port 443 (or 80), else whatever is installed
proxy_in_use() {
	local owner
	owner="$(ss -ltnpH '( sport = :443 or sport = :80 )' 2>/dev/null | grep -oE 'caddy|nginx|traefik' | head -1 || true)"
	if [[ -z "$owner" ]] && docker ps --format '{{.Image}}' 2>/dev/null | grep -qi traefik; then owner=traefik; fi
	if [[ -z "$owner" ]]; then
		for p in caddy nginx traefik; do command -v "$p" >/dev/null && { owner=$p; break; }; done
	fi
	printf '%s' "$owner"
}

CADDY_SITE="$DOMAIN, *.$DOMAIN {
	# a certificate per organization subdomain, only for organizations that exist (Ekra answers the ask)
	tls {
		on_demand
	}
	reverse_proxy 127.0.0.1:$PORT
}"
CADDY_GLOBAL="{
	on_demand_tls {
		ask http://127.0.0.1:$PORT/api/domains/allowed
	}
}"

install_caddy() {
	say "No proxy found: installing Caddy"
	apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
	curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
	apt-get update -qq && apt-get install -y -qq caddy >/dev/null
	printf '%s\n\n%s\n' "$CADDY_GLOBAL" "$CADDY_SITE" >/etc/caddy/Caddyfile
}

setup_caddy() {
	local file=/etc/caddy/Caddyfile
	if grep -q "reverse_proxy 127.0.0.1:$PORT" "$file" 2>/dev/null; then
		say "Caddy already serves Ekra"
	else
		say "Adding Ekra to Caddy ($file)"
		cp "$file" "$file.before-ekra"
		if grep -q "on_demand_tls" "$file"; then
			warn "Your Caddyfile already has on_demand_tls: make its ask http://127.0.0.1:$PORT/api/domains/allowed"
			printf '\n%s\n' "$CADDY_SITE" >>"$file"
		elif head -c1 "$file" | grep -q '{'; then
			warn "Your Caddyfile has a global options block: add this inside it, then run: systemctl reload caddy"
			printf '%s\n' "	on_demand_tls { ask http://127.0.0.1:$PORT/api/domains/allowed }"
			printf '\n%s\n' "$CADDY_SITE" >>"$file"
		else
			printf '%s\n\n%s\n\n%s\n' "$CADDY_GLOBAL" "$(cat "$file")" "$CADDY_SITE" >"$file"
		fi
	fi
	caddy validate --config "$file" --adapter caddyfile >/dev/null || die "Caddy config check failed ($file)."
	systemctl enable --now caddy >/dev/null && systemctl reload caddy
}

setup_nginx() {
	local conf=/etc/nginx/sites-available/ekra.conf cert key
	say "Adding Ekra to Nginx ($conf)"
	warn "Organization subdomains need a wildcard certificate for *.$DOMAIN (e.g. certbot with your DNS provider)."
	cert="$(ask "Path to the certificate (fullchain) for $DOMAIN and *.$DOMAIN" "/etc/letsencrypt/live/$DOMAIN/fullchain.pem")"
	key="$(ask "Path to its private key" "/etc/letsencrypt/live/$DOMAIN/privkey.pem")"
	[[ -f "$cert" && -f "$key" ]] || die "Certificate or key not found; get the wildcard certificate, then run setup again."
	cat >"$conf" <<NGINX
# Written by Ekra's setup.sh: the app on $DOMAIN and every organization on *.$DOMAIN
server {
	listen 80;
	server_name $DOMAIN *.$DOMAIN;
	return 301 https://\$host\$request_uri;
}
server {
	listen 443 ssl;
	http2 on;
	server_name $DOMAIN *.$DOMAIN;
	ssl_certificate $cert;
	ssl_certificate_key $key;
	client_max_body_size 100m;
	location / {
		proxy_pass http://127.0.0.1:$PORT;
		proxy_set_header Host \$host;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection "upgrade";
	}
}
NGINX
	ln -sf "$conf" /etc/nginx/sites-enabled/ekra.conf
	nginx -t >/dev/null 2>&1 || { nginx -t; die "Nginx config check failed ($conf)."; }
	systemctl reload nginx
}

setup_traefik() {
	local dir resolver
	say "Adding Ekra to Traefik (file provider)"
	dir="$(ask "Traefik's dynamic configuration directory" "/etc/traefik/dynamic")"
	resolver="$(ask "Traefik certificate resolver for *.$DOMAIN (needs a DNS challenge for the wildcard)" "le")"
	mkdir -p "$dir"
	cat >"$dir/ekra.yml" <<TRAEFIK
# Written by Ekra's setup.sh: the app on $DOMAIN and every organization on *.$DOMAIN
http:
  routers:
    ekra:
      rule: "Host(\`$DOMAIN\`) || HostRegexp(\`^[a-z0-9-]+\\.${DOMAIN//./\\\\.}$\`)"
      service: ekra
      tls:
        certResolver: $resolver
        domains:
          - main: "$DOMAIN"
            sans: ["*.$DOMAIN"]
  services:
    ekra:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:$PORT"
TRAEFIK
	warn "Traefik in Docker can't reach 127.0.0.1 on the host: point the url at the host's address instead."
}

case "$(proxy_in_use)" in
caddy) setup_caddy ;;
nginx) setup_nginx ;;
traefik) setup_traefik ;;
*) install_caddy && setup_caddy ;;
esac

# ---- start, the ekra command, nightly updates --------------------------------------------------------------------

say "Building and starting Ekra (the first build takes a few minutes)"
ln -sf "$DIR/scripts/ekra.sh" /usr/local/bin/ekra
chmod +x "$DIR/scripts/ekra.sh"
ekra up

cat >/etc/systemd/system/ekra-update.service <<UNIT
[Unit]
Description=Update Ekra from its repository (backup, rebuild, migrate, roll back if unhealthy)
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/ekra update
UNIT
cat >/etc/systemd/system/ekra-update.timer <<UNIT
[Unit]
Description=Nightly Ekra update
[Timer]
OnCalendar=*-*-* 03:30
RandomizedDelaySec=30m
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now ekra-update.timer >/dev/null

say "Done. Ekra is at https://$DOMAIN"
cat <<NEXT
  - DNS: point $DOMAIN and *.$DOMAIN (an A record for each) at this server.
  - ekra status | logs | update | backup | restart   (updates also run nightly)
  - Settings live in $DIR/.env; after changing it run: ekra restart
NEXT
