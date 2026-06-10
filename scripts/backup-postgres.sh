#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.production.yml}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Arquivo de ambiente nao encontrado: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

BACKUP_DIR="${PEPPABOT_BACKUP_DIR:-${ROOT_DIR}/backups/postgres}"
BACKUP_RETENTION_DAYS="${PEPPABOT_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/peppabot-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

ENV_FILE="${ENV_FILE}" docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  pg_dump \
  --username="${PEPPABOT_POSTGRES_USER}" \
  --dbname="${PEPPABOT_POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --no-privileges >"${BACKUP_FILE}"

find "${BACKUP_DIR}" \
  -type f \
  -name 'peppabot-*.dump' \
  -mtime "+${BACKUP_RETENTION_DAYS}" \
  -delete

echo "Backup criado: ${BACKUP_FILE}"
