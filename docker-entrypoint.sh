#!/bin/sh
set -e

echo "TimeKeeper starting"

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
