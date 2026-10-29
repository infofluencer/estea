# Dokploy env'leri — Es Çay (187.77.69.91, proje `estea / production`)

İki dönem var. **Dönem A (şimdi):** domain yok, Dokploy'un ürettiği `*.traefik.me`
adresleri, HTTP. **Dönem B:** gerçek domain + TLS. B'ye geçişte yalnızca URL/CORS/cookie
satırları değişir; kod ve build aynı kalır (storefront `NEXT_PUBLIC_*` için rebuild gerekir).

Geçici adres: her serviste **Domains → Generate Domain**. Host port AÇMAYIN (blueprint §7.1).
Aşağıda `<backend>`, `<frontend>`, `<landing>` = üretilen hostname (ör. `estea-backend-ab12cd.traefik.me`).

## Servis ayarları

| Servis | Docker File | Port | Build args (her deploy) |
|---|---|---|---|
| backend | `Dockerfile.backend` | 9000 | `GIT_COMMIT`, `CACHE_BUST`, `BUILD_TIMESTAMP` |
| frontend | `Dockerfile.storefront` | 3025 | aynı + tüm `NEXT_PUBLIC_*` + `MEDUSA_BACKEND_URL` |
| landing | `Dockerfile.landing` | 3020 | aynı + `NEXT_PUBLIC_SHOP_URL` |
| postgres | Database → PostgreSQL 17 | iç | — |
| redis | Database → Redis 7 | iç | — |

Build Path `/`, Docker Context `.` hepsinde.

**Watch Paths** (Advanced → otomatik deploy hangi dosyalarda tetiklensin; yanlışsa push deploy başlatmaz):

| Servis | Watch Paths |
|---|---|
| backend | `apps/backend/**`, `shared/**`, `Dockerfile.backend` |
| frontend | `apps/frontend/**`, `shared/**`, `Dockerfile.storefront` |
| landing | `apps/landing/**`, `packages/ui/**`, `Dockerfile.landing`, `package.json`, `package-lock.json` |

## backend — Dönem A

```
DATABASE_URL=postgres://<user>:<pass>@postgres:5432/<db>
REDIS_URL=redis://redis:6379
MEDUSA_WORKER_MODE=shared
JWT_SECRET=<openssl rand -base64 32>
COOKIE_SECRET=<openssl rand -base64 32, farklı>
# HTTP döneminde zorunlu; TLS gelince SİL
COOKIE_SECURE=false

STORE_CORS=http://<frontend>
ADMIN_CORS=http://<backend>
AUTH_CORS=http://<frontend>,http://<backend>
STOREFRONT_URL=http://<frontend>
MEDUSA_BACKEND_PUBLIC_URL=http://<backend>

CONTACT_INBOX=info@esteacay.com
RETURNS_INBOX=info@esteacay.com
UNPAID_ORDER_TIMEOUT_MINUTES=30

# Canlı-dışı işareti: gerçek iade engellenir, Omnisend/CAPI kapalı, OID öneki STG.
# Canlıya geçerken BOŞALT.
PAYTR_OID_PREFIX=STG
PAYTR_TEST_MODE=1
PAYTR_MERCHANT_ID=
PAYTR_MERCHANT_KEY=
PAYTR_MERCHANT_SALT=
# PayTR kimliği yoksa mock akış (HTTP yok): PAYTR_MOCK=1
BANK_TRANSFER_ENABLED=0

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=info@esteacay.com
SMTP_PASS=<google app password>
SMTP_FROM=Es Çay <info@esteacay.com>
SMTP_SECURE=false

PARASUT_ENV=test
PARASUT_DRY_RUN=true
PARASUT_DEFAULT_VAT_RATE=1
PARASUT_SHIPPING_VAT_RATE=20

SHIPPING_CARRIER=
SHIPPING_CARRIER_TEST_MODE=true
ORDER_REF_PREFIX=ESC-
SHIPPING_FLAT_PRICE=149.90
FREE_SHIPPING_THRESHOLD=0
KDV_RATE=1

# S3 boşsa görseller container diskine (Swarm'da kalıcı değil). Ürün görseli yüklemeden önce doldur.
S3_BUCKET=
S3_FILE_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=
S3_ENDPOINT=
```

İlk deploy sonrası (proje terminali → backend container):
```
npm run setup:turkey:prod
npx medusa user -e admin@esteacay.com -p <şifre>
```
Çıktıdan `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` ve `NEXT_PUBLIC_MEDUSA_REGION_ID` alınır.
Admin: `http://<backend>/app`. Doğrulama: `http://<backend>/health`, `/health/revision`.

## frontend — Dönem A (Environment + Build-time Arguments, ikisine de)

```
MEDUSA_BACKEND_URL=http://<backend>
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://<backend>
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_…
NEXT_PUBLIC_MEDUSA_REGION_ID=reg_…
# Geçici adres: SITE_URL ≠ SITE_HOST olduğu için site noindex kalır (istenen).
SITE_URL=http://<frontend>
NEXT_PUBLIC_SITE_HOST=market.esteacay.com
NEXT_PUBLIC_LANDING_URL=https://esteacay.com
COOKIE_SECURE=false
NEXT_PUBLIC_VAT_RATE=1
NEXT_PUBLIC_S3_FILE_URL=
NEXT_PUBLIC_COOKIEYES_ID=
NEXT_PUBLIC_GA4_ID=
NEXT_PUBLIC_GOOGLE_ADS_ID=
NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=
NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_CLARITY_ID=
NEXT_PUBLIC_OMNISEND_BRAND_ID=
```
Takip ID'leri boşken hiçbir script yüklenmez; CookieYes banner'ı da çıkmaz. Doğrulama: `http://<frontend>/api/build-info`.

## landing — Dönem A

```
NEXT_PUBLIC_SHOP_URL=http://<frontend>     (Build-time Argument da)
```

## Dönem B'ye geçiş (domain + TLS)

1. DNS: `api`, `market`, apex/`www` → 187.77.69.91; Dokploy Domains'te gerçek host + HTTPS, Generate Domain'leri sil.
2. backend: tüm `http://<…>` → `https://…`; `COOKIE_SECURE` satırını sil; `PAYTR_OID_PREFIX` boşalt; `PAYTR_TEST_MODE=0` ancak canlı PayTR kimlikleri girilince; `PARASUT_ENV=prod`, `PARASUT_DRY_RUN=false` mali müşavir onayıyla.
3. frontend: `SITE_URL=https://market.esteacay.com`, `MEDUSA_BACKEND_URL=https://api.esteacay.com`, `COOKIE_SECURE` sil → **rebuild** (NEXT_PUBLIC_* gömülü).
4. landing: `NEXT_PUBLIC_SHOP_URL=https://market.esteacay.com` → rebuild.
5. PayTR paneli bildirim URL'i: `https://api.esteacay.com/paytr/callback`.
6. Postgres Backups → S3, `0 3 * * *`, restore testi.
