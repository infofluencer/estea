#!/usr/bin/env bash
# escay-backend — restore Postgres from local or S3 .sql.gz backup
# Usage:
#   ./scripts/restore-db.sh                        # interactive: pick latest local
#   ./scripts/restore-db.sh backups/escay-….sql.gz
#   ./scripts/restore-db.sh s3://BUCKET/database-backups/escay-….sql.gz
#   ./scripts/restore-db.sh database-backups/escay-….sql.gz   # key under S3_BUCKET
#
# Safety: requires typing YES and the database name. Refuses without both.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_PREFIX="[escay-restore]"

log()  { printf '%s %s\n' "$LOG_PREFIX" "$*" >&2; }
die()  { log "ERROR: $*"; exit 1; }

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
fi

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
S3_PREFIX="${BACKUP_S3_PREFIX:-database-backups}"
ARG="${1:-}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}
require_cmd docker
require_cmd gzip

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required"

parse_database_url() {
  local url="${DATABASE_URL}"
  url="${url#postgres://}"
  url="${url#postgresql://}"
  local creds hostpart
  creds="${url%%@*}"
  hostpart="${url#*@}"
  DB_USER="${creds%%:*}"
  DB_PASS="${creds#*:}"
  if command -v python3 >/dev/null 2>&1; then
    DB_PASS="$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$DB_PASS")"
  fi
  local hostport db
  hostport="${hostpart%%/*}"
  db="${hostpart#*/}"
  db="${db%%\?*}"
  DB_NAME="$db"
  [[ -n "$DB_USER" && -n "$DB_NAME" ]] || die "could not parse DATABASE_URL"
}

parse_database_url

resolve_container() {
  if [[ -n "${BACKUP_POSTGRES_CONTAINER:-}" ]]; then
    echo "$BACKUP_POSTGRES_CONTAINER"; return
  fi
  if [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
    echo "$POSTGRES_CONTAINER"; return
  fi
  local id
  id="$(docker ps --filter 'name=escay-postgres' --format '{{.ID}}' | head -1 || true)"
  [[ -n "$id" ]] || die "postgres container not found"
  echo "$id"
}

CONTAINER_ID="$(resolve_container)"

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
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    -e AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-eu-north-1}" \
    -v "${BACKUP_DIR}:/backups" \
    amazon/aws-cli:2.15.0 \
    "${aws_args[@]}"
}

mkdir -p "$BACKUP_DIR"
WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

resolve_source() {
  local src="$1"
  if [[ -z "$src" ]]; then
    local latest
    latest="$(ls -1t "${BACKUP_DIR}"/escay-*.sql.gz 2>/dev/null | head -1 || true)"
    [[ -n "$latest" ]] || die "no local backups in ${BACKUP_DIR} and no argument given"
    echo "$latest"
    return
  fi

  if [[ -f "$src" ]]; then
    echo "$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
    return
  fi

  # S3 URI or key
  local key bucket
  if [[ "$src" == s3://* ]]; then
    bucket="${src#s3://}"
    key="${bucket#*/}"
    bucket="${bucket%%/*}"
  else
    [[ -n "${S3_BUCKET:-}" ]] || die "S3_BUCKET required for remote restore"
    bucket="$S3_BUCKET"
    if [[ "$src" == */* ]]; then
      key="$src"
    else
      key="${S3_PREFIX%/}/${src}"
    fi
  fi

  [[ -n "${S3_ACCESS_KEY_ID:-}" && -n "${S3_SECRET_ACCESS_KEY:-}" ]] \
    || die "S3 credentials required to download backup"

  local dest="${WORKDIR}/$(basename "$key")"
  log "Downloading s3://${bucket}/${key}"
  if command -v aws >/dev/null 2>&1; then
    aws_s3 s3 cp "s3://${bucket}/${key}" "$dest" --only-show-errors
  else
    # Download into mounted backups dir then move
    local tmp_name
    tmp_name="$(basename "$key")"
    aws_s3 s3 cp "s3://${bucket}/${key}" "/backups/${tmp_name}.download" --only-show-errors
    mv "${BACKUP_DIR}/${tmp_name}.download" "$dest"
  fi
  echo "$dest"
}

SOURCE_PATH="$(resolve_source "$ARG")"
[[ -f "$SOURCE_PATH" ]] || die "backup file not found: ${SOURCE_PATH}"
[[ "$SOURCE_PATH" == *.sql.gz ]] || die "expected a .sql.gz file"

log "=============================================="
log "DESTRUCTIVE RESTORE"
log "  Source : ${SOURCE_PATH}"
log "  Target : database=${DB_NAME} user=${DB_USER}"
log "  Container: ${CONTAINER_ID}"
log "This will DROP SCHEMA public CASCADE and reload the dump."
log "=============================================="
printf 'Type the database name (%s) to continue: ' "$DB_NAME" >&2
read -r CONFIRM_DB
[[ "$CONFIRM_DB" == "$DB_NAME" ]] || die "database name mismatch — aborted"
printf 'Type YES to overwrite: ' >&2
read -r CONFIRM_YES
[[ "$CONFIRM_YES" == "YES" ]] || die "confirmation failed — aborted"

SQL_PLAIN="${WORKDIR}/restore.sql"
log "Decompressing…"
gzip -dc "$SOURCE_PATH" >"$SQL_PLAIN"
[[ -s "$SQL_PLAIN" ]] || die "decompressed dump is empty"

log "Terminating other connections to ${DB_NAME}…"
docker exec -e PGPASSWORD="$DB_PASS" "$CONTAINER_ID" \
  psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  >/dev/null || true

log "Dropping and recreating public schema…"
docker exec -e PGPASSWORD="$DB_PASS" "$CONTAINER_ID" \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC; GRANT ALL ON SCHEMA public TO \"${DB_USER}\";"

log "Restoring dump (this may take a while)…"
# Stream via docker exec -i
if ! docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER_ID" \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <"$SQL_PLAIN"
then
  die "psql restore failed — database may be partially loaded"
fi

log "Restore completed successfully."
exit 0
