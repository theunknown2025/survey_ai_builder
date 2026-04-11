#!/usr/bin/env bash
#
# Supabase setup for VPS (Ubuntu): Docker + Supabase CLI, start stack from repo,
# then sync VITE_* vars into .env.production.
#
# Usage (on the server, as a user who can use sudo):
#   chmod +x supabase-config.sh
#   ./supabase-config.sh
#
# Optional environment overrides:
#   APP_DIR=/home/ubuntu/survey-app          # default below
#   VITE_SUPABASE_PUBLIC_URL=https://...     # URL browsers use (strongly recommended for production)
#   SKIP_DOCKER=1                            # skip Docker install (already installed)
#   SKIP_SUPABASE_CLI=1                      # skip CLI install (supabase already on PATH)
#   SUPABASE_START_DEBUG=1                   # pass --debug to supabase start (more detail on stderr)
#   SUPABASE_IGNORE_HEALTH_CHECK=1           # pass --ignore-health-check (use if one service blocks "ready" forever)
#   SUPABASE_EXCLUDE=studio,mailpit          # comma list; see: supabase start --help (-x)
#   SUPABASE_HEARTBEAT_SEC=30                # seconds between progress messages while starting (0 = off)
#
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/survey-app}"
ENV_OUT="${ENV_OUT:-.env.production}"
SKIP_DOCKER="${SKIP_DOCKER:-0}"
SKIP_SUPABASE_CLI="${SKIP_SUPABASE_CLI:-0}"
SUPABASE_HEARTBEAT_SEC="${SUPABASE_HEARTBEAT_SEC:-30}"

log() { printf '%s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
      log "Docker is already installed and the daemon is reachable."
      return 0
    fi
    if sudo docker info >/dev/null 2>&1; then
      die "Docker is installed but user '$USER' cannot access the daemon. Run: newgrp docker  (or log out/in), then re-run this script."
    fi
    die "Docker is installed but the daemon is not reachable. Try: sudo systemctl start docker"
  fi
  log "Installing Docker Engine (get.docker.com)..."
  require_cmd curl
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
  sudo systemctl enable --now docker
  if id -nG "$USER" | grep -qw docker; then
    :
  else
    sudo usermod -aG docker "$USER" || true
    log ""
    log "Added user '$USER' to the 'docker' group. Log out and back in (or: newgrp docker) before"
    log "running this script again if 'docker' permission denied errors appear."
    log ""
  fi
}

cli_arch() {
  case "$(uname -m)" in
    x86_64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "Unsupported machine architecture: $(uname -m) (expected x86_64 or aarch64)" ;;
  esac
}

install_supabase_cli_deb() {
  local arch tag ver url deb
  arch="$(cli_arch)"
  require_cmd curl
  tag="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
  [[ -n "$tag" ]] || die "Could not resolve latest supabase/cli release tag"
  ver="${tag#v}"
  deb="/tmp/supabase_${ver}_linux_${arch}.deb"
  url="https://github.com/supabase/cli/releases/download/${tag}/supabase_${ver}_linux_${arch}.deb"
  log "Downloading Supabase CLI ${tag} (${arch})..."
  curl -fL --retry 3 -o "$deb" "$url"
  sudo dpkg -i "$deb" || sudo apt-get install -f -y
  rm -f "$deb"
}

install_supabase_cli() {
  if command -v supabase >/dev/null 2>&1; then
    log "Supabase CLI already on PATH: $(command -v supabase)"
    supabase --version
    return 0
  fi
  if [[ -f /etc/os-release ]] && grep -qi 'ID=ubuntu\|ID=debian' /etc/os-release; then
    install_supabase_cli_deb
  else
    die "Automatic CLI install supports Debian/Ubuntu (.deb) only. Install Supabase CLI manually, then re-run with SKIP_SUPABASE_CLI=1"
  fi
}

upsert_env_line() {
  local file="$1" key="$2" val="$3"
  local tmp
  tmp="$(mktemp)"
  if [[ -f "$file" ]]; then
    grep -v "^${key}=" "$file" >"$tmp" || true
  else
    : >"$tmp"
  fi
  printf '%s=%s\n' "$key" "$val" >>"$tmp"
  mv "$tmp" "$file"
}

ensure_seed_file() {
  # Avoids "no files matched pattern: supabase/seed.sql" and extra CLI work when the glob is empty.
  local seed="$APP_DIR/supabase/seed.sql"
  if [[ ! -f "$seed" ]]; then
    log "Creating minimal supabase/seed.sql (referenced by config.toml)."
    printf '%s\n' \
      '-- Auto-created by supabase-config.sh so [db.seed] sql_paths resolve.' \
      '-- Add INSERT statements here if you need default data.' \
      'select 1;' \
      >"$seed"
  fi
}

build_supabase_start_args() {
  SUPABASE_START_ARGS=(--yes)
  [[ "${SUPABASE_START_DEBUG:-}" == "1" ]] && SUPABASE_START_ARGS+=(--debug)
  [[ "${SUPABASE_IGNORE_HEALTH_CHECK:-}" == "1" ]] && SUPABASE_START_ARGS+=(--ignore-health-check)
  if [[ -n "${SUPABASE_EXCLUDE:-}" ]]; then
    local part
    IFS=',' read -ra parts <<<"${SUPABASE_EXCLUDE// /}"
    for part in "${parts[@]}"; do
      part="${part// /}"
      [[ -n "$part" ]] || continue
      SUPABASE_START_ARGS+=(-x "$part")
    done
  fi
}

run_supabase_start_with_heartbeat() {
  build_supabase_start_args
  log "Running: supabase start ${SUPABASE_START_ARGS[*]}"
  supabase start "${SUPABASE_START_ARGS[@]}" &
  local spid=$!
  log "supabase start is running (pid $spid). Output above may pause for a long time during image pulls."

  trap 'log "Interrupted."; kill "$spid" 2>/dev/null; wait "$spid" 2>/dev/null; exit 130' INT TERM

  local interval="${SUPABASE_HEARTBEAT_SEC:-30}"
  if [[ "$interval" =~ ^[0-9]+$ ]] && [[ "$interval" -gt 0 ]]; then
    local elapsed=0
    while kill -0 "$spid" 2>/dev/null; do
      sleep "$interval"
      kill -0 "$spid" 2>/dev/null || break
      elapsed=$((elapsed + interval))
      if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE 'supabase|kong|postgrest'; then
        log "[$elapsed s] Supabase-related containers are up; CLI is still finishing (health checks / wiring). This is normal."
      else
        log "[$elapsed s] Still no Supabase containers listed — Docker is usually pulling images (first run often 10–25+ minutes on a small VPS)."
        log "        In another SSH session try:  docker images  |  docker system df  |  sudo iotop"
      fi
    done
  fi

  trap - INT TERM
  wait "$spid"
}

parse_status_env() {
  # Reads supabase status -o env from stdin; sets shell vars: _API_URL, _ANON_KEY
  _API_URL=""
  _ANON_KEY=""
  local line k v
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#export }"
    [[ "$line" =~ ^([A-Za-z0-9_]+)=(.*)$ ]] || continue
    k="${BASH_REMATCH[1]}"
    v="${BASH_REMATCH[2]}"
    v="${v#\"}"
    v="${v%\"}"
    case "$k" in
      API_URL|SUPABASE_URL) [[ -z "$_API_URL" ]] && _API_URL="$v" ;;
      ANON_KEY|SUPABASE_ANON_KEY) [[ -z "$_ANON_KEY" ]] && _ANON_KEY="$v" ;;
    esac
  done
}

main() {
  [[ -d "$APP_DIR" ]] || die "APP_DIR does not exist: $APP_DIR"
  [[ -f "$APP_DIR/supabase/config.toml" ]] || die "No supabase/config.toml under $APP_DIR (clone/pull the full repo first)"

  if [[ "$SKIP_DOCKER" != "1" ]]; then
    install_docker
  else
    log "SKIP_DOCKER=1 — assuming Docker is installed."
    require_cmd docker
    docker info >/dev/null 2>&1 || die "Docker daemon not reachable. Start docker or fix permissions."
  fi

  if [[ "$SKIP_SUPABASE_CLI" != "1" ]]; then
    install_supabase_cli
  else
    log "SKIP_SUPABASE_CLI=1 — using existing supabase binary."
    command -v supabase >/dev/null 2>&1 || die "supabase not found on PATH"
  fi

  cd "$APP_DIR"

  if ! docker info >/dev/null 2>&1; then
    die "Cannot talk to Docker. Run: newgrp docker   OR log out/in   OR use: sudo usermod -aG docker $USER"
  fi

  ensure_seed_file

  log ""
  log "=== Supabase Docker stack ==="
  log "The step 'Starting containers...' often sits with no new lines for a long time. Typical causes:"
  log "  • First-time image pulls (~1GB+ total) — commonly 10–25+ minutes on a small VPS or slow disk."
  log "  • Unpacking layers on a busy or low-RAM host."
  log "This script prints a heartbeat every ${SUPABASE_HEARTBEAT_SEC}s while start runs (set SUPABASE_HEARTBEAT_SEC=0 to disable)."
  log "For verbose CLI logs: SUPABASE_START_DEBUG=1 ./supabase-config.sh"
  log "Optional leaner stack (faster): SUPABASE_EXCLUDE=studio,mailpit,edge-runtime ./supabase-config.sh"
  log "(Only exclude services you do not need; storage-api + imgproxy are required for image uploads.)"
  log ""

  run_supabase_start_with_heartbeat

  local status_env
  status_env="$(supabase status -o env)" || die "supabase status -o env failed"

  _API_URL=""
  _ANON_KEY=""
  parse_status_env <<<"$status_env"
  [[ -n "$_ANON_KEY" ]] || die "Could not parse anon key from 'supabase status -o env'. Paste output to support."

  local vite_url
  if [[ -n "${VITE_SUPABASE_PUBLIC_URL:-}" ]]; then
    vite_url="${VITE_SUPABASE_PUBLIC_URL}"
    log "Using VITE_SUPABASE_PUBLIC_URL for the frontend: $vite_url"
  else
    vite_url="$_API_URL"
    log ""
    log "-------------------------------------------------------------------"
    log "VITE_SUPABASE_PUBLIC_URL is not set. Using API URL from CLI: $vite_url"
    log "Browsers must reach this URL. If you only expose the app via nginx/HTTPS,"
    log "set a public URL before building the app, e.g.:"
    log "  export VITE_SUPABASE_PUBLIC_URL=https://supabase.yourdomain.com"
    log "then re-run this script or edit .env.production and rebuild (npm run build)."
    log "Typical options: reverse-proxy port 54321, or open firewall :54321 (not ideal)."
    log "-------------------------------------------------------------------"
    log ""
  fi

  local env_path="$APP_DIR/$ENV_OUT"
  upsert_env_line "$env_path" "VITE_SUPABASE_URL" "$vite_url"
  upsert_env_line "$env_path" "VITE_SUPABASE_ANON_KEY" "$_ANON_KEY"
  upsert_env_line "$env_path" "VITE_SUPABASE_IMAGE_BUCKET" "${VITE_SUPABASE_IMAGE_BUCKET:-survey-images}"

  log ""
  log "Updated $env_path with:"
  log "  VITE_SUPABASE_URL=$vite_url"
  log "  VITE_SUPABASE_ANON_KEY=(set)"
  log "  VITE_SUPABASE_IMAGE_BUCKET=${VITE_SUPABASE_IMAGE_BUCKET:-survey-images}"
  log ""
  log "Next: rebuild the frontend so Vite picks up the new vars, e.g.:"
  log "  cd $APP_DIR && npm install && npm run build"
  log ""
  log "Useful commands (from $APP_DIR):"
  log "  supabase status    # URLs and keys"
  log "  supabase stop      # stop stack"
  log "  supabase start     # start stack (e.g. after reboot)"
}

main "$@"
