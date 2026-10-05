#!/bin/sh
# Container start: apply migrations, optionally seed, then run the API.
# SEED_ON_START=true re-applies demo data on every start; if-empty seeds only a fresh database.
set -e

prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  node prisma/seed/index.js
elif [ "$SEED_ON_START" = "if-empty" ]; then
  node prisma/seed/index.js --if-empty
fi

exec node server.js
