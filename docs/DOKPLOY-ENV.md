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

# Canlı-dışı işareti: gerçek iade engellenir, Omnisend/CAPI kapalı, BizimHesap DRY-RUN
# zorlanır (BIZIMHESAP_DRY_RUN ne olursa olsun), OID öneki STG. Canlıya geçerken BOŞALT.
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

# BizimHesap: Es Çay'ın kendi hesabı (K14). Firm ID verilene dek boş → mock. Test ortamı yok.
BIZIMHESAP_FIRM_ID=
BIZIMHESAP_DRY_RUN=true
BIZIMHESAP_DEFAULT_VAT_RATE=1
BIZIMHESAP_SHIPPING_VAT_RATE=20
# Stok eşitlemesi (K15). Token boş → kapalı. APPLY, test:bizimhesap:stock raporu doğrulanmadan açılmaz.
BIZIMHESAP_TOKEN=
BIZIMHESAP_WAREHOUSE_ID=
BIZIMHESAP_STOCK_APPLY=false

SHIPPING_CARRIER=
SHIPPING_CARRIER_TEST_MODE=true
# DHL (SHIPPING_CARRIER=dhl olunca): DHL_ENV=prod yalnız canlıda
# DHL_CLIENT_ID=
# DHL_CLIENT_SECRET=
# DHL_CUSTOMER_NUMBER=
# DHL_PASSWORD=
# DHL_LABEL_PDF=labelary
# RETURN_CARRIER_NAME=DHL eCommerce
# RETURN_CUSTOMER_NUMBER=
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
npm run setup:admin-layouts:prod
```
Son komut admin sipariş sayfasının ortak düzenini yazar (Es Çay kutuları iş sırasında, JSON/Meta Veriler gizli); kullanıcı oluşturulduktan sonra çalışmalı, tekrar çalıştırmak güvenli.
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
NEXT_PUBLIC_SITE_URL=http://<landing>      (Build-time Argument; boşsa https://esteacay.com, paylaşım önizlemeleri için)
```

## Dönem B'ye geçiş (domain + TLS)

PayTR bildirim URL'i **tek** ve **panelde** yaşar; DNS yayılırken callback'in
ulaşamadığı her dakika "para çekildi, sipariş iptal" riskidir (Mareen #9). Sıra bu yüzden
önce callback ucu, sonra DNS, en son canlı mod:

1. **Callback ucu DNS'ten önce ayakta:** Dokploy backend Domains'e `api.esteacay.com` + HTTPS ekle
   (Generate Domain henüz kalsın). Sunucudan `curl -X POST https://api.esteacay.com/paytr/callback`
   → `PAYTR notification failed: bad hash` dönmeli (uç ayakta, imza reddediyor). Dönmüyorsa DNS'e geçme.
2. **Panel URL'ini cutover gecesinden önce test et:** PayTR paneli bildirim URL'i
   `https://api.esteacay.com/paytr/callback` yap; staging kimlikleriyle (`PAYTR_OID_PREFIX=STG`,
   `PAYTR_TEST_MODE=1`) bir test ödemesi at, admin **Logs**'ta `payment.succeeded` gör. Eski WordPress/başka
   ucu aynı panelde bırakma — bildirim tek yere gider.
3. DNS: `api`, `market`, apex/`www` → 187.77.69.91; Generate Domain'leri sil. Geçiş sırasında callback
   sayfası eski IP'ye giderse PayTR retry eder; temizlik işi (`UNPAID_ORDER_TIMEOUT_MINUTES`) geç gelen
   success'i artık iade etmez, uyarı maili + elle inceleme ister.
4. backend: tüm `http://<…>` → `https://…`; `COOKIE_SECURE` satırını sil; `BIZIMHESAP_DRY_RUN=false`
   mali müşavir onayıyla. Not: `PAYTR_OID_PREFIX` dolu kaldıkça BizimHesap'a hiçbir şey gönderilmez;
   gerçek kayıt ancak 7. adımda önek boşalınca başlar. Deploy sonrası
   `/health/revision` commit hash'i push edilenle aynı mı kontrol et.
5. frontend: `SITE_URL=https://market.esteacay.com`, `MEDUSA_BACKEND_URL=https://api.esteacay.com`, `COOKIE_SECURE` sil → **rebuild** (NEXT_PUBLIC_* gömülü).
6. landing: `NEXT_PUBLIC_SHOP_URL=https://market.esteacay.com`, `NEXT_PUBLIC_SITE_URL=https://esteacay.com` → rebuild.
7. **Canlı PayTR (ayrı adım, kimlikler girilince):** `PAYTR_MERCHANT_*` canlı değerler, `PAYTR_OID_PREFIX=` (boş),
   `PAYTR_TEST_MODE=0`, `PAYTR_MOCK` satırını sil. Üçü birlikte değişir; boot'taki env doğrulaması
   (`src/modules/paytr/env-guard.ts`) `TEST_MODE=0 + önek dolu`, `TEST_MODE tanımsız` ya da `mock açık`
   görürse backend başlamaz — Dokploy log'unda `[paytr/env]` satırına bak. Sonra 1 TL gerçek ödeme + panelden iade.
8. Postgres Backups → S3, `0 3 * * *`, restore testi; cron'a başarı sinyali (heartbeat ping) ekle —
   sessiz kalan cron Mareen'de haftalarca fark edilmedi (K10).
