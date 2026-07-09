#!/bin/sh
set -e

# El cliente Prisma ya se genera en el build de la imagen (Dockerfile:
# `RUN npm run prisma:generate`) y viaja en node_modules → regenerarlo en cada
# boot es redundante y agrega ~8s de arranque. Solo aplicamos migraciones.
npm run prisma:migrate

if [ "${RUN_SEED}" = "true" ]; then
  npm run seed
fi

exec ./node_modules/.bin/tsx src/index.ts
