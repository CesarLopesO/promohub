#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${ROOT_DIR}/docker-compose.production.yml}"
BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" || ! -f "${BACKUP_FILE}" ]]; then
  echo "Uso: $0 /caminho/para/backup.dump" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Arquivo de ambiente nao encontrado: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

ENV_FILE="${ENV_FILE}" docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  exec -T postgres \
  pg_restore \
  --username="${PEPPABOT_POSTGRES_USER}" \
  --dbname="${PEPPABOT_POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges <"${BACKUP_FILE}"

echo "Restore concluido a partir de: ${BACKUP_FILE}"
