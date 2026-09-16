#!/bin/sh
set -e

echo "TimeKeeper starting"

# ---------------------------------------------------------------------------
# Session secret.
#
# This signs sessions and encrypts the directory and mail passwords held in the
# database, so it cannot ship with a default value — a known secret would let
# anyone forge a session. If one is not supplied, generate it on first start and
# keep it in a volume, so the same secret is used on every restart.
#
# Losing it signs everyone out and makes the stored directory and mail
# passwords unreadable; they would have to be entered again in Admin.
# ---------------------------------------------------------------------------
SECRET_FILE="${AUTH_SECRET_FILE:-/app/data/auth-secret}"

if [ -z "$AUTH_SECRET" ]; then
  if [ ! -f "$SECRET_FILE" ]; then
    mkdir -p "$(dirname "$SECRET_FILE")"
    node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "Generated a session secret at $SECRET_FILE"
  fi
  AUTH_SECRET=$(cat "$SECRET_FILE")
  export AUTH_SECRET
fi

# Wait for Postgres to accept connections. The database may still be starting
# the first time the stack comes up.
attempt=0
until node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => client.end()).catch(() => process.exit(1));
" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Database did not become available after 30 attempts — giving up."
    exit 1
  fi
  echo "Waiting for the database… ($attempt)"
  sleep 2
done

echo "Applying database migrations"
./node_modules/.bin/prisma migrate deploy

echo "Seeding reference data"
./node_modules/.bin/tsx prisma/seed.ts

exec "$@"
