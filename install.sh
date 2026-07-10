#!/usr/bin/env bash
# =============================================================================
# Educathing one-command installer for a fresh Ubuntu VPS.
#
# Usage (as root or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/meiklabs/educathing-llm/main/install.sh | bash
#
# Or clone the repo first and run:
#   sudo bash install.sh
#
# What it does:
#   1. Installs Docker Engine + compose plugin if missing.
#   2. Creates /opt/educathing with app storage, Caddyfile and .env.
#   3. Generates strong random secrets in .env (SIG_KEY, SIG_SALT, JWT_SECRET).
#   4. Pulls ghcr.io/meiklabs/educathing-llm:latest and Caddy.
#   5. Boots the stack via docker compose.
#
# Post-install (edit .env):
#   - Set DOMAIN=your.hostname and ACME_EMAIL=you@org for automatic HTTPS.
#   - Paste your OPENROUTER_API_KEY.
#   Then run: (cd /opt/educathing && docker compose -f docker-compose.yml up -d)
# =============================================================================
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/meiklabs/educathing-llm/main"
INSTALL_DIR="${INSTALL_DIR:-/opt/educathing}"

info()  { printf '\033[1;34m→\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fatal() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
	if [[ $EUID -ne 0 ]]; then
		fatal "Run as root or with sudo (needed to install Docker and write to ${INSTALL_DIR})."
	fi
}

install_docker() {
	if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
		ok "Docker already installed ($(docker --version))."
		return
	fi
	info "Installing Docker Engine…"
	curl -fsSL https://get.docker.com | sh
	systemctl enable --now docker
	ok "Docker installed."
}

fetch() {
	# Prefer local copy (when the script is run from a cloned repo) so bootstrap
	# works offline against a mirror; fall back to raw.githubusercontent.
	local rel="$1" dest="$2"
	local here; here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	if [[ -f "${here}/${rel}" ]]; then
		cp "${here}/${rel}" "${dest}"
	else
		curl -fsSL "${REPO_RAW}/${rel}" -o "${dest}"
	fi
}

generate_secret() {
	# 32 bytes = 64 hex chars, well above AnythingLLM's 32-char minimum.
	openssl rand -hex 32
}

write_env() {
	local env_path="${INSTALL_DIR}/.env"
	if [[ -f "${env_path}" ]]; then
		warn ".env already exists at ${env_path} — leaving it untouched."
		return
	fi
	info "Generating ${env_path} with fresh secrets…"
	fetch "docker/.env.prod.example" "${env_path}.tmp"
	local sig_key sig_salt jwt
	sig_key="$(generate_secret)"
	sig_salt="$(generate_secret)"
	jwt="$(generate_secret)"
	# Use awk so we don't depend on GNU sed's -i semantics.
	awk -v sk="${sig_key}" -v ss="${sig_salt}" -v jw="${jwt}" '
		/^SIG_KEY=/  { print "SIG_KEY=" sk;   next }
		/^SIG_SALT=/ { print "SIG_SALT=" ss;  next }
		/^JWT_SECRET=/ { print "JWT_SECRET=" jw; next }
		{ print }
	' "${env_path}.tmp" > "${env_path}"
	rm -f "${env_path}.tmp"
	chmod 600 "${env_path}"
	ok "Secrets written. Now edit ${env_path} to set DOMAIN, ACME_EMAIL and OPENROUTER_API_KEY."
}

main() {
	require_root
	install_docker

	info "Preparing ${INSTALL_DIR}…"
	mkdir -p "${INSTALL_DIR}"/{storage,hotdir,outputs}
	cd "${INSTALL_DIR}"

	fetch "docker/docker-compose.prod.yml" "docker-compose.yml"
	fetch "docker/Caddyfile" "Caddyfile"
	write_env

	info "Pulling images…"
	docker compose pull

	info "Starting stack…"
	docker compose up -d

	ok "Educathing is up. Check status with:  cd ${INSTALL_DIR} && docker compose ps"
	echo
	printf '\033[1mNext steps:\033[0m\n'
	echo "  1. Edit ${INSTALL_DIR}/.env — set DOMAIN, ACME_EMAIL and OPENROUTER_API_KEY."
	echo "  2. Point your DNS A record at this server."
	echo "  3. Reload: (cd ${INSTALL_DIR} && docker compose up -d)"
	echo "  4. Open https://<your-domain>/ and complete the first-run wizard."
}

main "$@"
