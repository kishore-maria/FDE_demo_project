#!/bin/sh
# Container start: apply migrations, optionally seed (idempotent), then run the API.
set -e

prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  node prisma/seed/index.js
fi

exec node server.js
