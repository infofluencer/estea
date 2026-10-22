#!/usr/bin/env bash
# escay-backend — Postgres → gzip → local backups/ → S3 (database-backups/)
# Usage (on Dokploy VPS host):
#   cd /path/to/escay-backend && ./scripts/backup-db.sh
# Env: see scripts/README-backup.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_PREFIX="[escay-backup]"

log()  { printf '%s %s\n' "$LOG_PREFIX" "$*" >&2; }
die()  { log "ERROR: $*"; exit 1; }

# Load selected keys from .env without `source` (passwords may contain shell metacharacters)
load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^(DATABASE_URL|S3_[A-Za-z0-9_]+|BACKUP_[A-Za-z0-9_]+|POSTGRES_[A-Za-z0-9_]+)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"; fi
    if [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    printf -v "$key" '%s' "$val"
    export "$key"
  done <"$f"
}

ENV_FILE="${BACKUP_ENV_FILE:-${ROOT_DIR}/.env}"
if [[ -f "$ENV_FILE" ]]; then
  load_env_file "$ENV_FILE"
  log "Loaded env from ${ENV_FILE}"
else
  log "No ${ENV_FILE} — using process environment only"
fi

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
S3_PREFIX="${BACKUP_S3_PREFIX:-database-backups}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILENAME="escay-${STAMP}.sql.gz"
LOCAL_PATH="${BACKUP_DIR}/${FILENAME}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

require_cmd docker
require_cmd gzip
require_cmd date

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required"

# --- parse DATABASE_URL (postgres://user:pass@host:port/db) ---
# Supports postgres:// and postgresql://
parse_database_url() {
  local url="${DATABASE_URL}"
  url="${url#postgres://}"
  url="${url#postgresql://}"

  local creds hostpart
  creds="${url%%@*}"
  hostpart="${url#*@}"

  DB_USER="${creds%%:*}"
  DB_PASS="${creds#*:}"
  # decode %XX in password if present (minimal)
  if command -v python3 >/dev/null 2>&1; then
    DB_PASS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$DB_PASS")"
  fi

  local hostport db
  hostport="${hostpart%%/*}"
  db="${hostpart#*/}"
  db="${db%%\?*}"

  DB_HOST="${hostport%%:*}"
  if [[ "$hostport" == *:* ]]; then
    DB_PORT="${hostport##*:}"
  else
    DB_PORT="5432"
  fi
  DB_NAME="$db"

  [[ -n "$DB_USER" && -n "$DB_NAME" ]] || die "could not parse DATABASE_URL (need user + database)"
}

parse_database_url
log "Target database=${DB_NAME} user=${DB_USER} (host from URL is for app; dump runs inside postgres container)"

# --- resolve postgres container ---
resolve_container() {
  if [[ -n "${BACKUP_POSTGRES_CONTAINER:-}" ]]; then
    echo "$BACKUP_POSTGRES_CONTAINER"
    return
  fi
  if [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
    echo "$POSTGRES_CONTAINER"
    return
  fi
  local id
  id="$(docker ps --filter 'name=escay-postgres' --format '{{.ID}}' | head -1 || true)"
  [[ -n "$id" ]] || die "postgres container not found (set BACKUP_POSTGRES_CONTAINER or name filter escay-postgres)"
  echo "$id"
}

CONTAINER_ID="$(resolve_container)"
CONTAINER_NAME="$(docker inspect --format '{{.Name}}' "$CONTAINER_ID" | sed 's#^/##')"
log "Using postgres container: ${CONTAINER_NAME} (${CONTAINER_ID})"

docker exec "$CONTAINER_ID" pg_dump --version >/dev/null 2>&1 \
  || die "pg_dump not available inside container ${CONTAINER_NAME}"

mkdir -p "$BACKUP_DIR"

# --- dump ---
log "Starting pg_dump → ${LOCAL_PATH}"
# Prefer credentials from DATABASE_URL; fall back to container POSTGRES_* if dump auth fails is not auto — URL is source of truth.
if ! docker exec -e PGPASSWORD="$DB_PASS" "$CONTAINER_ID" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl --format=plain \
  | gzip -c >"${LOCAL_PATH}.partial"
then
  rm -f "${LOCAL_PATH}.partial"
  die "pg_dump failed"
fi

mv "${LOCAL_PATH}.partial" "$LOCAL_PATH"
BYTES="$(wc -c <"$LOCAL_PATH" | tr -d ' ')"
[[ "$BYTES" -gt 100 ]] || die "backup file too small (${BYTES} bytes) — aborting"
log "Local backup OK (${BYTES} bytes): ${LOCAL_PATH}"

# --- S3 upload helper (aws CLI or dockerized amazon/aws-cli) ---
aws_s3() {
  local -a aws_args=()
  if [[ -n "${S3_ENDPOINT:-}" ]]; then
    aws_args+=(--endpoint-url "$S3_ENDPOINT")
  fi
  aws_args+=("$@")

  if command -v aws >/dev/null 2>&1; then
    AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    AWS_DEFAULT_REGION="${S3_REGION:-eu-north-1}" \
    aws "${aws_args[@]}"
    return
  fi

  # Fallback: official AWS CLI image (no host install required)
  log "aws CLI not on host — using docker image amazon/aws-cli"
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    -e AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-eu-north-1}" \
    -v "${BACKUP_DIR}:/backups:ro" \
    amazon/aws-cli:2.15.0 \
    "${aws_args[@]}"
}

S3_OK=0
if [[ -z "${S3_BUCKET:-}" || -z "${S3_ACCESS_KEY_ID:-}" || -z "${S3_SECRET_ACCESS_KEY:-}" ]]; then
  log "WARN: S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY missing — skip upload (local backup kept)"
else
  S3_KEY="${S3_PREFIX%/}/${FILENAME}"
  if command -v aws >/dev/null 2>&1; then
    UPLOAD_SRC="$LOCAL_PATH"
  else
    # Path inside amazon/aws-cli container (BACKUP_DIR mounted at /backups)
    UPLOAD_SRC="/backups/${FILENAME}"
  fi
  log "Uploading s3://${S3_BUCKET}/${S3_KEY}"
  if aws_s3 s3 cp "$UPLOAD_SRC" "s3://${S3_BUCKET}/${S3_KEY}" --only-show-errors; then
    S3_OK=1
    log "S3 upload OK"
  else
    log "ERROR: S3 upload failed — local backup retained at ${LOCAL_PATH}"
    S3_OK=0
  fi
fi

# --- rotation local ---
log "Rotating local backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'escay-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete 2>/dev/null || true

# --- rotation S3 ---
if [[ "$S3_OK" -eq 1 ]]; then
  log "Rotating S3 objects under s3://${S3_BUCKET}/${S3_PREFIX}/ older than ${RETENTION_DAYS} days"
  CUTOFF_EPOCH="$(date -u -d "-${RETENTION_DAYS} days" +%s 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%s)"
  # List and delete old keys (best-effort)
  LIST_OUT="$(mktemp)"
  if aws_s3 s3api list-objects-v2 --bucket "$S3_BUCKET" --prefix "${S3_PREFIX%/}/" --output text \
      --query 'Contents[].[Key,LastModified]' >"$LIST_OUT" 2>/dev/null; then
    while read -r key lastmod; do
      [[ -z "${key:-}" || "$key" == "None" ]] && continue
      [[ "$key" == *.sql.gz ]] || continue
      # LastModified like 2026-09-06T03:00:00+00:00
      obj_epoch="$(date -u -d "$lastmod" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%S" "${lastmod%%+*}" +%s 2>/dev/null || echo "")"
      if [[ -n "$obj_epoch" && "$obj_epoch" -lt "$CUTOFF_EPOCH" ]]; then
        log "Deleting old S3 object: ${key}"
        aws_s3 s3 rm "s3://${S3_BUCKET}/${key}" --only-show-errors || log "WARN: failed to delete ${key}"
      fi
    done <"$LIST_OUT"
  else
    log "WARN: could not list S3 objects for rotation (non-fatal)"
  fi
  rm -f "$LIST_OUT"
fi

if [[ "$S3_OK" -eq 0 && -n "${S3_BUCKET:-}" ]]; then
  die "backup written locally but S3 upload failed"
fi

log "Done: ${FILENAME}"
exit 0
