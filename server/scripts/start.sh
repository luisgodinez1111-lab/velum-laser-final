#!/bin/sh
set -e
npm run prisma:generate
npm run prisma:migrate
if [ "${RUN_SEED}" = "true" ]; then
  npm run seed
fi
exec npx tsx src/index.ts
