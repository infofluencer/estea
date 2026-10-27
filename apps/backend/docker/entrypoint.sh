#!/bin/sh
set -e

echo "[escay-backend] SOURCE_REVISION=${SOURCE_REVISION:-unknown}"
echo "[escay-backend] GIT_COMMIT=${GIT_COMMIT:-unknown}"
echo "[escay-backend] CACHE_BUST=${CACHE_BUST:-unknown}"
echo "[escay-backend] BUILD_TIMESTAMP=${BUILD_TIMESTAMP:-unknown}"
echo "[escay-backend] Prefer Dokploy Domain/Ingress — host port publish keeps stale containers."
if [ -f ./.build-meta ]; then
  echo "[escay-backend] .build-meta:"
  cat ./.build-meta
fi
echo "[escay-backend] Running migrations..."
npx medusa db:migrate

MODE="${MEDUSA_WORKER_MODE:-shared}"
echo "[escay-backend] Starting Medusa (worker mode: ${MODE})..."
# Production: medusa start (NOT develop / runserver)
exec npx medusa start
