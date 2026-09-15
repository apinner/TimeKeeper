#!/bin/sh
# Nightly backup. Add to the host's crontab, for example:
#   0 2 * * * cd /opt/timekeeper && ./scripts/backup.sh >> /var/log/timekeeper-backup.log 2>&1
#
# Dumps into ./backups, which is mounted into the postgres container, and keeps
# 30 days. Copy the directory off this machine as well — a backup on the same
# disk is not a backup.
set -e

KEEP_DAYS=${KEEP_DAYS:-30}
STAMP=$(date +%Y-%m-%d-%H%M)
FILE="/backups/timekeeper-${STAMP}.sql.gz"

docker compose exec -T postgres sh -c "pg_dump -U \${POSTGRES_USER:-timekeeper} \${POSTGRES_DB:-timekeeper} | gzip > ${FILE}"
echo "Wrote ${FILE}"

find ./backups -name 'timekeeper-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
echo "Removed backups older than ${KEEP_DAYS} days"
