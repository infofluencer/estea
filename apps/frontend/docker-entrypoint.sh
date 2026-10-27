#!/bin/sh
set -e
echo "[escay-storefront] SOURCE_REVISION=${SOURCE_REVISION:-unknown}"
echo "[escay-storefront] GIT_COMMIT=${GIT_COMMIT:-unknown}"
echo "[escay-storefront] BUILD_TIMESTAMP=${BUILD_TIMESTAMP:-unknown}"
echo "[escay-storefront] MEDUSA_BACKEND_URL=${MEDUSA_BACKEND_URL:-MISSING}"
echo "[escay-storefront] NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:+set}"
echo "[escay-storefront] NEXT_PUBLIC_MEDUSA_REGION_ID=${NEXT_PUBLIC_MEDUSA_REGION_ID:-MISSING}"
exec "$@"
