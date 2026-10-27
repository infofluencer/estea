# Es Çay — Teknik Sistem Kopyalama Kılavuzu (Mareen'den türetilmiştir)

**Tarih:** 2026-10-22 · **Kaynak:** `mareen` monorepo (`main`, son commit `74ded54`), `docs/CUTOVER.md`, `DEPLOY.md`, `docs/DHL-DIRECT.md`, kod okuması
**Amaç:** Mareen'in teknik mimarisini, entegrasyonlarını, operasyon akışlarını ve canlıya geçişte öğrenilen dersleri, **Es Çay** (çay e-ticaret sitesi) için aynı sistemi yeniden kurarken kullanılacak marka bağımsız bir kılavuz olarak belgelemek.
**Kapsam dışı (Es Çay'da olmayacak):** Geliver, DHL direkt entegrasyonu, Trendyol, WordPress/WooCommerce geçiş katmanı. Kargo firması henüz belli olmadığı için kargo katmanı **adaptör sözleşmesi** olarak tarif edilmiştir (§4.13).
**Gizlilik:** Bu belgede hiçbir secret değeri yoktur; yalnızca env değişken **adları** vardır.

## Nasıl okunmalı

| Hedef | Bölümler |
|---|---|
| Sistemi 10 dakikada anlamak | §1, §6 |
| Repo'yu klonlayıp budamak | §2, §12 Aşama 1-2 |
| Backend'i yeniden kurmak | §3, §4, §9 |
| Storefront'u yeniden kurmak | §5 |
| Dokploy'a deploy | §7, §8 |
| Mareen'in hatalarını tekrarlamamak | §11 |
| Kargo firması seçilince | §4.13, §12 Aşama 3 |
| Karar bekleyenler | §13 |

Tablolardaki "Es Çay" sütunu: **Aynen** = değiştirmeden kopyala · **Yeni değer** = markaya göre doldur · **Karar** = §13'teki bir karara bağlı · **Yok / Sil** = Es Çay'da kullanılmaz.

## İçindekiler

1. Sistemin kuş bakışı mimarisi
2. Repo yapısı ve monorepo mekaniği
3. Backend (Medusa v2.18) — yapı, middleware, subscriber, job
4. Entegrasyonlar (PayTR, Havale, Auth, E-posta, Omnisend/Meta, Ops/Wishlist, Store API, İade/Değişim, Sipariş durumu, Paraşüt, Sözleşme/Etiket PDF, Admin, Kargo katmanı, Trendyol)
5. Storefront (Next.js 15)
6. Sipariş yaşam döngüsü — olay zinciri
7. Altyapı, deploy ve operasyon
8. Ortam değişkenleri — tam envanter
9. Veri kurulumu (yeni DB)
10. Test ve doğrulama katmanları
11. Mareen'den öğrenilen dersler
12. Es Çay uyarlama planı
13. Açık kararlar

---
## 1. Sistemin kuş bakışı mimarisi

```
                 İnternet
                    │
        ┌───────────┴────────────┐
        │  Traefik (Dokploy)     │  TLS (Let's Encrypt), host bazlı yönlendirme
        └──┬──────────────────┬──┘
   escay.com.tr          api.escay.com.tr
           │                  │
 ┌─────────▼─────────┐  ┌─────▼──────────────────────────┐
 │ storefront        │  │ backend (Medusa v2.18)         │
 │ Next.js 15 stand- │  │ + yerleşik Admin  /app         │
 │ alone, port 3015  │──│ port 9000                      │
 │ (SSR → iç ağ)     │  │ entrypoint: db:migrate → start │
 └───────────────────┘  └──┬───────────┬─────────────────┘
                           │           │
                    ┌──────▼───┐  ┌────▼─────┐
                    │ Postgres │  │ Redis 7  │  cache + event bus + admin session
                    │ 16/17    │  └──────────┘
                    └──────────┘
 Dış servisler: PayTR (iFrame + callback) · Paraşüt (e-arşiv) · S3 (görsel + yedek + sözleşme PDF)
                Google Workspace SMTP · Omnisend · Meta CAPI · GA4/Ads/Pixel/Clarity (CookieYes onayıyla)
                [Mareen'de ayrıca: Geliver/DHL kargo, Trendyol — Es Çay'da YOK]
```

| Katman | Teknoloji | Not |
|---|---|---|
| Backend | Medusa v2.18 (`@medusajs/medusa` 2.18.0), Node 20 | Tek container; `MEDUSA_WORKER_MODE=shared`. Admin ayrı container değil, `api.<domain>/app` |
| Storefront | Next.js 15.5 App Router, React 19, Tailwind v4, `output: "standalone"` | Port 3015. Tarayıcı backend'i **doğrudan çağırmaz**; tüm Medusa çağrıları Server Component / Server Action'da (BFF modeli) |
| Veri | Postgres 16 (Dokploy'da 17 image'ı kullanıldı), Redis 7 | Dokploy iç servis adlarıyla bağlanılır (`postgres:5432`, `redis:6379`), IP hardcode yok |
| Hosting | Hostinger VPS, Dokploy (Docker Swarm + Traefik) | Staging ve prod aynı VPS'te ayrı Dokploy projeleri |
| Dosya | AWS S3 (eu-north-1), Medusa file-s3 provider, `files/` prefix public, diğer prefix'ler private | Yerel disk Swarm'da kullanılmaz |
| Paylaşılan kod | `shared/` paketi (`@mareen/shared`) | Backend ve storefront'un ortak TS modülleri (adres, sipariş no, zaman çizelgesi, sözleşme metni) |

**Tek domain kuralı:** `www` → apex 308 yönlendirme (PayTR dönüşü, çerezler, SEO). Admin için ayrı subdomain yok.

**Doğrulama uçları:** storefront `GET /api/build-info` (gitCommit), backend `GET /health`, `GET /health/revision`.

---

## 2. Repo yapısı ve monorepo mekaniği

```
<repo>/
├── CLAUDE.md, DEPLOY.md, README.md, docs/
├── Dockerfile.backend          ← Dokploy bunu kullanır (Build Path: /)
├── Dockerfile.storefront       ← Dokploy bunu kullanır (Build Path: /)
├── docker-compose.dev.yml      ← lokal Postgres 5433 / Redis 6380 / Mailpit 8025
├── docker-compose.dokploy-backend.yml ← Swarm update_config (stop-first) örneği
├── shared/                     ← @mareen/shared (tek kaynak)
│   ├── package.json (exports)  tr-address.ts  tr-districts.ts  order-number.ts
│   ├── order-timeline.ts       legal-contracts.ts
├── mareen-backend/
│   ├── medusa-config.ts        src/{admin,api,emails,jobs,lib,links,modules,scripts,subscribers,workflows}
│   ├── shared/                 ← build sırasında kökten kopyalanır (scripts/sync-shared.mjs)
│   ├── scripts/                ← build yardımcıları, backup, WP import (legacy)
│   ├── data/                   ← fonts/ (PDF için), katalog json'ları (legacy)
│   ├── integration-tests/      test/returns/   jest.config.js
│   └── docker/entrypoint.sh
└── mareen-storefront/
    ├── next.config.ts  src/{app,components,hooks,lib}  public/  e2e/  scripts/
    ├── shared/                 ← ELLE kopya (Docker'da kök shared/ ile ezilir)
    └── docker-entrypoint.sh
```

### 2.1 `shared/` paketi nasıl çalışır (kopyalarken aynen al)

- tsconfig `paths`: backend `@mareen/shared/*` → `./shared/*`; storefront `@mareen/shared/*` → `./shared/*`, `../shared/*`.
- Backend `prebuild`: `scripts/sync-shared.mjs` kökteki `shared/` dizinini `mareen-backend/shared/` içine kopyalar.
- Backend `build`: `medusa build && node scripts/link-shared-module.mjs` → `.medusa/server/node_modules/@mareen/shared` symlink'i + `package.json` kopyası. Node runtime tsconfig paths okumadığı için bu link şart.
- `shared/package.json` `exports` alanı **her yeni dosya için güncellenmeli**; aksi halde prod'da `ERR_PACKAGE_PATH_NOT_EXPORTED` ile backend açılmaz (Mareen'de yaşandı).
- Dockerfile'lar kök `shared/`'ı her iki servise `COPY shared ./shared` ile taşır. Runner aşamasında `ln -sfn ../../shared node_modules/@mareen/shared`.
- Jest `moduleNameMapper` ile `@mareen/shared/*` → `../shared/*`.
- Dikkat: `shared/*.js` derlenmiş kopyalar git'te duruyor (`order-number.js`, `tr-address.js`, `tr-districts.js`). Yeni projede **yalnızca .ts tut**, .js'leri `.gitignore`'a al. Aynı sorun `src/modules/geliver/*.js`, `src/emails/format.js`, `src/api/store/orders/_shared.js`, `src/modules/paytr/hash.js` için de var: `medusa develop` .js'yi .ts'ye tercih edip eski kodu yüklüyordu.

### 2.2 Build zinciri

| Servis | Komut | Not |
|---|---|---|
| Backend | `npm run build` = `sync-shared` + `patch-dashboard-order-filters` (prebuild) → `medusa build` → `link-shared-module` → Dockerfile ayrıca `node scripts/compile-exec-scripts.mjs` | `medusa build` çıktısı `.medusa/server`; prod container'ın çalışma dizini `/server`. `medusa exec` prod'da **derlenmiş `.js`** script ister (`src/scripts/*.js`), bu yüzden `compile-exec-scripts.mjs` var ve package.json'da `:prod` varyantları `.js`'e işaret eder |
| Storefront | `next build` (standalone) | `NEXT_PUBLIC_*` build anında gömülür → değişince **rebuild**. `MEDUSA_BACKEND_URL`, `SITE_URL` runtime okunur → domain değişiminde rebuild gerekmez |

---

## 3. Backend (Medusa v2.18) — yapı

### 3.1 `medusa-config.ts` özeti

| Alan | Ayar | Neden |
|---|---|---|
| `databaseDriverOptions.connection.ssl=false` | Docker iç Postgres'te TLS yok | Medusa localhost dışı host'ta SSL zorlar |
| `redisUrl` | Redis | cache-redis, event-bus-redis, admin session store |
| `workerMode` | `shared` (env ile `server`/`worker`) | Tek container |
| `sessionOptions` | ttl 12 saat, `rolling: true` | Admin paneli 10 saatte düşüyordu |
| `cookieOptions` | `sameSite: lax`, `secure` (COOKIE_SECURE=false değilse) | HTTP IP döneminde kapatılır |
| `http.authMethodsPerActor` | user: emailpass, customer: emailpass | |
| `http.authVerificationsPerActor` | customer: e-posta doğrulaması **zorunlu**; user: yok | Doğrulanmamış müşteriye tam JWT verilmez; misafir checkout etkilenmez |
| `admin.storefrontUrl` | `STOREFRONT_URL` | Admin'den mağazaya linkler |
| `admin.disable` | `DISABLE_MEDUSA_ADMIN=true` | |

Modül kayıtları (sırayla):

| Modül | Provider / id | Es Çay |
|---|---|---|
| `auth` | `./src/modules/auth-wp-emailpass` id `emailpass` + verification `token` TTL **24 saat** (varsayılan 15 dk) | WP katmanını at: `@medusajs/medusa/auth-emailpass` kullan, TTL ayarını koru |
| `cache-redis`, `event-bus-redis` | | Aynen |
| `payment` | `./src/modules/paytr` id `paytr` → `pp_paytr_paytr`; `./src/modules/bank-transfer` id `havale` → `pp_havale_havale` | Aynen |
| `fulfillment` | `@medusajs/medusa/fulfillment-manual` id `manual` + `./src/modules/geliver` id `geliver` | manual kalır; geliver → yeni kargo adaptörü veya yok |
| `notification` | `./src/modules/smtp-notification` id `smtp` kanal `email`; `notification-local` id `local` kanal `feed` (admin zil) | Aynen |
| `wishlist`, `ops-event` | custom | Aynen |
| `wp-legacy`, `trendyol` | custom | Sil |
| `parasut` | custom, kimlik boşsa mock | Aynen |
| `file` | `S3_BUCKET` doluysa file-s3 (`prefix: files/`, `acl: false`), yoksa file-local `static/` | Aynen |

### 3.2 Dizin haritası ve satır sayıları (yaklaşık)

| Dizin | Satır | İçerik |
|---|---|---|
| `src/lib` | 13.1k | İş mantığı (ödeme telafisi, iade, değişim, fatura, etiket PDF, kargo orkestrasyonu, sözleşme) |
| `src/modules` | 8.4k | 9 özel modül |
| `src/admin` | 8.1k | 20 widget, 7 sayfa, bileşenler, TR i18n |
| `src/api` | 5.7k | ~70 route + middlewares |
| `src/subscribers` | 1.6k | 20 subscriber |
| `src/emails` | 1.5k | 10 şablon dosyası |
| `src/jobs` | 0.6k | 6 cron job |
| `src/workflows/hooks` | 17 | `require-cart-email` |
| `src/scripts` | — | ~60 operasyon/test script'i |

### 3.3 Middleware kuralları (`src/api/middlewares.ts`) — sırayla

Medusa çekirdeği publishable key'i yalnızca `/store/*` için ister. `/paytr/callback`, `/geliver/webhook`, `/health/revision` kök seviyede olduğundan ne key ne auth ister; güvenlik route içinde (hash / shared secret).

| Yol | Metot | Middleware |
|---|---|---|
| `/admin/wp-import/*` | POST | body 10 MB **[WP, sil]** |
| `/paytr/callback` | POST | IP rate-limit (180/60 sn) |
| `/geliver/webhook` | POST | yok (secret route içinde) **[kargo adaptörüne göre]** |
| `/health/revision` | GET | yok |
| `/auth/session` | POST | `adminRememberMe` (çerez `mareen_admin_remember=1` → 7 gün) |
| `/auth/verification/request` | POST | 5/15 dk (ip + identity) |
| `/auth/customer/emailpass/register` | POST | 10/10 dk |
| `/auth/customer/emailpass/reset-password` | POST | 5/10 dk |
| `/auth/customer/emailpass/update` | POST | 5/10 dk |
| `/auth/customer/emailpass` | POST | login 10/10 dk |
| `/store/orders/:id` | GET | `authenticate("customer")` — **çekirdek bunu auth'suz bırakır, kişisel veri sızar; override şart** |
| `/store/orders/lookup` | POST | 30/10 dk + zod `{id, email}` |
| `/store/returns/guest` | POST | rate-limit + zod `{order_id, email, items[{id, quantity, exchange_variant_id?}], reason_id, note?}` |
| `/store/returns/exchange-options` | POST | opsiyonel auth + rate-limit |
| `/store/returns/request` | POST | auth + rate-limit + zod |
| `/admin/orders` | GET | `filterOrdersByStatus` → `markPendingBankTransfersInList` |
| `/admin/returns/:id/receive`, `/receive/confirm`, `/accept` | POST | `ensureReturnReceiveLocation` |
| `/store/carts`, `/store/carts/:id` | POST | `stripReservedCartMetadata` (`source`, `geliver_attach_shipment_id`, `trendyol*` silinir) |
| `/store/carts/:id/line-items[/:line_id]` | POST | `stripReservedLineItemMetadata` (`weight_kg`, `weight_g`, `weight`, `length`, `width`, `height`) |
| `/store/contact` | POST | 12/10 dk + zod (honeypot `company`) |
| `/store/customers/me/password` | POST | auth + zod (min 8) |
| `/store/customers/me/wishlist[...]` | GET/POST/DELETE | auth (+ zod) |

İstemcinin yazmasına izin verilen cart metadata anahtarları: `payment_method`, `marketing_consent`, `tracking_consent`, `legal_accepted_at`.

Rate-limiter: `src/api/store/_rate-limit.ts` `createRateLimiter({name, maxAttempts, windowMs})`, process-içi `Map`, anahtar `name:IP` (`x-forwarded-for` ilk değer). Çoklu replica'da Redis'e taşınmalı.

### 3.4 Subscribers (olay → iş)

| Olay | Dosya | Ne yapar | Es Çay |
|---|---|---|---|
| `auth.verification_requested` | `email-verification.ts` | `/verify-email?token&email` linki, 24 saat | Aynen |
| `auth.password_reset` | `password-reset.ts` | Müşteri `/reset-password`, admin `/app/reset-password` | Aynen |
| `customer.created` | `merge-wordpress-customer.ts` | WP adreslerini yeni hesaba taşır | Sil |
| `order.placed` | `order-placed.ts` | Yalnızca havale siparişinde "Ödemeniz Bekleniyor" (IBAN) maili + `payment.pending` olayı; kart siparişinde **mail yok** (ödeme henüz yok) | Aynen |
| `payment.captured` | `payment-captured-email.ts` | "Siparişiniz Alındı" / "Havale Ödemeniz Alındı" (idempotent `order-confirmation:<orderId>`) | Aynen |
| `payment.captured` | `payment-captured-geliver.ts` | Otomatik fulfillment + kargo gönderisi | Kargo adaptörüne göre |
| `payment.captured` | `payment-captured-parasut.ts` | e-Arşiv fatura | Aynen |
| `payment.captured` | `omnisend-placed-order.ts` | Omnisend `placed order` (v2) | Aynen |
| `payment.captured` | `meta-capi-purchase.ts` | Meta CAPI Purchase (yalnızca `tracking_consent`, yalnızca prod) | Aynen |
| `cart.updated` | `omnisend-started-checkout.ts` | E-posta + ürün varsa `started checkout` (24 saat Redis dedupe), izinliyse contact `subscribed` | Aynen |
| `shipment.created` / `delivery.created` | `order-shipping-status-email.ts` | "Kargoya verildi" / "Teslim edildi" mailleri (`no_notification` ise atla) | Aynen (kargo bağımsız) |
| `order.return_requested` | `return-requested-email.ts` | Müşteriye talep/iade kodu maili + satıcıya `RETURNS_INBOX` | Aynen |
| `order.return_received` | `return-received-refund.ts` / `return-received-exchange.ts` | Para iadesi (PayTR iade) veya değişim gönderisi | Aynen (kargo kısmı adaptöre) |
| `mareen.return_refunded` (özel) | `return-refunded-email.ts`, `return-refunded-parasut.ts` | Müşteri maili + Paraşüt iade faturası | Aynen (event adını yeniden adlandır) |
| `mareen.return_rejected` (özel) | `return-rejected-email.ts` | Red maili | Aynen |
| inventory-level.updated / reservation.created | `trendyol-*.ts` | Trendyol stok kuyruğu | Sil |

### 3.5 Jobs (cron)

| Job | Zamanlama | İş | Es Çay |
|---|---|---|---|
| `cancel-unpaid-paytr-orders` | `*/10 * * * *` | `status=pending`, `created_at ≤ now-30dk`, PayTR session'ı pending/error olan siparişi `cancelOrderWorkflow` ile iptal (stok serbest). Havale siparişlerine dokunmaz. PayTR callback kilidiyle aynı lock | Aynen |
| `retry-parasut-invoices` | periyodik | Başarısız faturaları 8 denemeye kadar, 72 saat geriye | Aynen |
| `dhl-track-shipments` | 30 dk | DHL durum sorgusu → shipped/delivered | Adaptöre göre (webhook yoksa polling şablonu olarak değerli) |
| `trendyol-push-stock` (5 dk), `trendyol-pull-orders` (15 dk), `trendyol-reconcile-stock` (15 dk) | | | Sil |

### 3.6 Workflow hook

`src/workflows/hooks/require-cart-email.ts`: `completeCartWorkflow.hooks.validate` → e-posta yoksa/geçersizse sipariş oluşmaz.

---

## 4. Entegrasyonlar

### 4.1 PayTR (iFrame API) — aynen kopyalanır

Dosyalar: `src/modules/paytr/{service,hash,order-guards,mock-iade}.ts`, `src/api/paytr/callback/`, `src/lib/paytr-compensate.ts`, `src/lib/paytr-status.ts`, `src/jobs/cancel-unpaid-paytr-orders.ts`, `src/emails/paytr-alerts.ts`.

**Ödeme oturumu (`initiatePayment`):**
1. Storefront `initiatePaymentSession(cart, {provider_id: "pp_paytr_paytr", data})`; `data` = `customer_email`, `first_name`, `last_name`, `phone`, `address`, `cart_items[{name, unit_price, quantity}]`, `user_ip` (`x-forwarded-for`). Sepet toplamı ile kalem toplamı 0,02'den fazla farklıysa (promosyon) tek satır `"Sipariş"` gönderilir.
2. Session id `payses_<ts>_<rand>`; `merchant_oid` = `PAYTR_OID_PREFIX` (yoksa `M`) + alfanümerik session id, ≤ 64 karakter. Session `data.session_id`, `data.merchant_oid` tutar.
3. `payment_amount` = kuruş (`round(amount*100)`); `currency` `TL`; `no_installment=0`, `max_installment=0`, `timeout_limit=30`, `lang=tr`.
4. `merchant_ok_url` / `merchant_fail_url` = `${STOREFRONT_URL}/odeme/payment-result?status=success|failed&oid=…`.
5. `debug_on`: `PAYTR_DEBUG_ON` zorlaması; yoksa test mode veya OID prefix varsa 1.
6. Token hash: `hash_str = merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode`; `paytr_token = base64(HMAC_SHA256(key=merchant_key, msg=hash_str + merchant_salt))`.
7. Kimlik yoksa veya `PAYTR_MOCK=1` → HTTP yok, `_stub: true` PENDING session.
8. **Güvenlik kilidi:** `PAYTR_OID_PREFIX` doluyken `testMode≠1` ise throw (canlı-dışı ortam asla canlı token alamaz).
9. POST multipart `https://www.paytr.com/odeme/api/get-token` → `iframe_token`. Storefront iframe: `https://www.paytr.com/odeme/guvenli/<token>`.

**Provider metotları:** `authorizePayment` yalnızca `data.paytr_status==="success"` ise AUTHORIZED, aksi halde PENDING_AUTHORIZATION → `cart.complete` siparişi **ödeme bekler** durumda oluşturur. Tarayıcı `ok_url`'e dönmek onay **değildir**; onay yalnızca callback'tir. `capturePayment` HTTP yapmaz (`paytr_status=success`, `captured_at`).

**Callback `POST /paytr/callback`:**
1. Alanlar: `merchant_oid`, `status`, `total_amount`, `payment_amount` (taksit farkı için), `hash`, `failed_reason_code/msg`.
2. Key/salt boşsa ve mock kapalıysa 200 "not configured" (boş key ile HMAC taklit edilebilirdi).
3. Hash: `base64(HMAC_SHA256(key, merchant_oid + salt + status + total_amount))`, `timingSafeEqual`. Hatalıysa 200 "bad hash".
4. Lock `paytr-callback:<oid>` (timeout 30, ttl 120).
5. Session bulma: `listPaymentSessions({provider_id})` sayfalayarak `data.merchant_oid` eşleşmesi. Bulunamazsa `OK` (PayTR tekrar denemesin — eski site/WP callback'leri sessizce yutulur).
6. `callback_processed===true` → no-op (idempotent).
7. Sipariş bulma: `order_payment_collection` → yoksa `cart_payment_collection` → `order_cart`.
8. **success:** sipariş yok → telafi `success_no_order`; sipariş iptal edilmiş → `late_success_canceled`: varsayılan **iade etmez**, kritik alarm maili + session `manual_review` (`PAYTR_LATE_SUCCESS_AUTO_REFUND=1` ile otomatik iade); tutar uyuşmazlığı (1 kuruş tolerans) → telafi `amount_mismatch`; normal → session `paytr_status=success`, `processPaymentWorkflow(SUCCESSFUL, amount)` (authorize+capture → `payment.captured`), `callback_processed=true`, ops event `payment.succeeded`. Workflow hata verirse alarm + **500** (PayTR tekrar dener).
9. **failed:** `processPaymentWorkflow(FAILED)`, `cancelUnpaidOrderIfSafe` (sipariş iptali, stok serbest), ops `payment.failed`.
10. Telafi (`compensatePaytrCharge`): tam tutarı `/odeme/iade` ile iade, başarısızsa alarm `compensate_failed` + 500.

**Order guards:** `isOrderUnpaidSafeToCancel` (iptal edilmiş, ödenmiş veya bilinmeyen statüde iptal etmez); `cancelUnpaidOrderIfSafe` → `cancelOrderWorkflow({no_notification:true})`; "already canceled" idempotent, "has fulfillments" admin incelemesine bırakılır.

**İade (`refundPayment`)** — Medusa'nın yerel refund akışından çağrılır: `return_amount` **TL string** (`"199.90"`, kuruş değil); `reference_no = "R"+n+sha256(oid|amount|n)[0..28]`; hash `base64(HMAC_SHA256(key, merchant_id + oid + return_amount + salt))`; POST `https://www.paytr.com/odeme/iade`; başarılar `data.paytr_refunds[]`'a yazılır (aynı referans+tutar tekrar gönderilmez). Canlı-dışı ortamda (prefix dolu, mock kapalı) throw — iade API'sinin test modu yok → `PAYTR_MOCK=1`.

**Durum sorgusu** `src/lib/paytr-status.ts`: `/odeme/durum-sorgu`, token = refund formülünün `return_amount` boş hâli. Generic.

**Kritik alarm** `sendPaytrCriticalAlert(kind)`: ops `payment.alert` + `PAYTR_ALERT_INBOX` → `RETURNS_INBOX` → `CONTACT_INBOX` maili, konu `[KRİTİK] PayTR tutarsızlık — <oid>`.

**Panel ayarı:** Mağaza Paneli → Bildirim URL = `https://api.<domain>/paytr/callback` (tek URL). Test modu → `PAYTR_TEST_MODE=1`. Lokal: `PAYTR_USER_IP` dış IP.

**Markaya bağlı yerler:** fallback e-posta `no-reply@mareen.com.tr`, alarm/sepet Türkçe metinleri, storefront yolu `/odeme/payment-result`.

### 4.2 Havale / EFT — aynen kopyalanır

Provider `src/modules/bank-transfer` (`pp_havale_havale`): `initiatePayment` → `bank_transfer_status: pending`; `authorizePayment` yalnızca `received` ise AUTHORIZED, aksi halde PENDING_AUTHORIZATION (sipariş ödenmemiş oluşur, stok rezerve edilir); `capturePayment` → `received`; `refundPayment` para hareketi yapmaz, `data.manual_refunds[]`'a yazar (banka elle); webhook yok.

Akış:
1. Storefront `GET /store/bank-transfer` → `{enabled, bank_name, account_name, iban}` (`BANK_TRANSFER_ENABLED` + IBAN + hesap sahibi dolu olmalı).
2. Checkout session `pp_havale_havale` + cart `metadata.payment_method="bank_transfer"` (kartta `"card"`).
3. `order.placed` → "Ödemeniz Bekleniyor" (IBAN, kuruşlu tutar, açıklama = sipariş no) + ops `payment.pending` (sipariş başına bir kez).
4. `GET /store/orders/:id` ve `lookup` yanıtına `bank_transfer` bilgisi eklenir (onay + takip sayfasında IBAN kutusu).
5. Admin liste: `awaiting` + `payment_method=bank_transfer` → `requires_action` ("Havale onayı bekleniyor").
6. Admin widget (`order.details.side.before`) "Havale alındı" → `POST /admin/orders/:id/bank-transfer/confirm` → `confirmBankTransferPayment` (lock, idempotent) → `processPaymentWorkflow(SUCCESSFUL)` → `payment.captured` → onay maili + fatura + kargo + Omnisend/CAPI. Ops `payment.succeeded {method: bank_transfer}`.
7. Otomatik iptal yok. Paraşüt'te ödeme şekli EFT/HAVALE, platform = `BANK_TRANSFER_BANK_NAME`.

Kurulum: env → redeploy → `npm run enable:bank-transfer:prod` (provider'ı Türkiye region'a bağlar, idempotent) → `BANK_TRANSFER_ENABLED=1`. Test: `test:bank-transfer` (sipariş açar, doğrular, iptal eder).

### 4.3 Auth / müşteri hesabı

- **Provider:** Mareen'de `auth-wp-emailpass` (Medusa `EmailPassAuthService` alt sınıfı; WP hash'i varsa ilk girişte doğrular ve scrypt'e çevirir). **Es Çay'da standart `@medusajs/medusa/auth-emailpass`.**
- **E-posta doğrulama:** `authVerificationsPerActor` ile müşteri için zorunlu; token TTL 24 saat; `POST /auth/verification/confirm` override'ı doğrulamadan sonra **misafir siparişlerini hesaba bağlar** (`link-guest-orders.ts`: aynı e-postalı `has_account=false` müşterinin siparişlerinin `customer_id`'si güncellenir).
- **Kayıt koruması:** `POST /store/customers` override'ı body e-postası ile auth identity `entity_id` eşit değilse NOT_ALLOWED (başkasının e-postasıyla kayıt engeli).
- **Şifre değiştirme:** `POST /store/customers/me/password` (çekirdek `/auth/.../update` yalnızca reset token kabul eder) → `authenticate` + `updateProvider`.
- **Admin "Beni hatırla":** widget çerez yazar, `/auth/session` middleware 7 gün.
- **Rate-limit'ler:** 3.3'teki tablo.

### 4.4 Bildirim / e-posta — aynen kopyalanır

- Provider `smtp-notification` (nodemailer). Şablon çözümlemesi provider'da **yok**; çağıran taraf `content.subject/html/text` hazır gönderir, `template` yalnızca etiket.
- `src/lib/notify.ts` `createNotificationIdempotent`: aynı `idempotency_key` ile başarılı kayıt varsa göndermez; başarısız kayıt varsa `key#r<n>` ile yeni satır (Medusa "Notification not found" hatası için).
- Ortak: `src/emails/company.ts` (künye — **değiştir**), `src/emails/format.ts` (`formatMoney` tr-TR, `emailLayout` 600px tablo, logo `${STOREFRONT_URL}/email/mareen-logo.png`, footer "© Mareen — shop@…" — **değiştir**).

| Şablon | Tetikleyici | Idempotency key |
|---|---|---|
| `email-verification` | `auth.verification_requested` | `email-verification:<code>` |
| `password-reset` | `auth.password_reset` | `password-reset:<token>` |
| `order-confirmation` ("Siparişiniz Alındı" / "Havale Ödemeniz Alındı"; takip linki + varsa fatura PDF linki) | `payment.captured` | `order-confirmation:<orderId>` |
| `order-bank-transfer` ("Ödemeniz Bekleniyor") | `order.placed` (havale) | `order-bank-transfer:<orderId>` |
| `order-shipped` / `order-delivered` | `shipment.created` / `delivery.created` | `<template>:<fulfillmentId>` |
| `return-requested-customer` / `return-dhl-code-customer` | `order.return_requested` | `return-requested-customer:<returnId>` |
| `return-requested-seller` / `return-label-seller` → `RETURNS_INBOX` | `order.return_requested` | `return-requested-seller:<returnId>` |
| `return-refunded-customer` | `mareen.return_refunded` | `…:<returnId>:<payment>` |
| `return-rejected-customer` | `mareen.return_rejected` | `…:<returnId>` |
| `return-dhl-code-customer` | admin iade kodu girince | `return-dhl-code:<returnId>:<code>` |
| `parasut-invoice-issued` | fatura kesilince | `parasut-invoice:<orderId>` |
| `parasut-invoice-failure-admin` → `PARASUT_ADMIN_ALERT_EMAIL` | fatura hatası | |
| `return-refund-failed` → `RETURNS_INBOX` | iade hatası | |
| `paytr-critical-<kind>` → `PAYTR_ALERT_INBOX` | callback anomalisi | `paytr-critical:<kind>:<oid>` |
| `contact-form` → `CONTACT_INBOX` | `POST /store/contact` | yok |
| `admin-ui` (kanal `feed`) | `recordOpsEvent` | yok |

Tasarım notu: kart siparişinde `order.placed` ödeme öncesi tetiklendiği için onay maili `payment.captured`'a bağlı; ödenmemiş/başarısız siparişe "sipariş alındı" gitmez.

`STOREFRONT_URL` fallback'i dosyadan dosyaya farklı (8000 vs 3015) → **her zaman açıkça set et.**

### 4.5 Pazarlama: Omnisend + Meta CAPI — aynen kopyalanır (hesaplar yeni)

**Omnisend** (`src/lib/omnisend.ts`, REST v5, `X-API-KEY`):
- Kapı: `OMNISEND_API_KEY` boşsa kapalı; canlı-dışı (`PAYTR_OID_PREFIX` dolu) yalnızca `OMNISEND_TEST_EMAILS`.
- `upsertOmnisendContact` yalnızca `subscribed` ise (KVKK); `sendOmnisendEvent` (`started checkout` v"", `placed order` v2, `eventID` deterministik sha256).
- Satırlar: productID, title, price, quantity, variant, SKU, image, `productURL`; `abandonedCheckoutURL = ${STOREFRONT_URL}/sepet/recover/<cartId>`.
- Bilinen eksik: `paymentMethod:"card"` sabit (havalede de).
- Kapsam dışı (ileride): `viewed product`, `added product to cart`, ürün katalog senkronu.

**Meta CAPI** (`src/lib/meta-capi.ts`): `payment.captured` → Purchase; `event_id = purchase-<orderId>` (tarayıcı Pixel ile dedupe); `user_data` sha256 (em, ph 90-prefix, fn, ln, ct, zp, country, external_id); `contents[].id` = `variant.metadata.wc_variation_id` (**WP kalıntısı → `variant_id`/SKU'ya çevir**); `META_PIXEL_ID` varsayılanı Mareen'in — **değiştir**. Yalnızca `order.metadata.tracking_consent===true` ve prod.

### 4.6 Ops Event + Wishlist — aynen kopyalanır

- `ops_event` modeli: `kind`, `level` (info|warning|error), `title`, `detail`, `order_id`, `order_display_id`, `data`. `recordOpsEvent(container, {…, once, oncePerTitle})` hiç throw etmez; belirli kind'ler + tüm error'lar admin zil `feed` bildirimi üretir. `GET /admin/ops-events?level&kind&order_id&limit&offset`. Admin "Logs" sayfası + sipariş "Olaylar".
- Kind'ler: `payment.{succeeded,failed,alert,pending}`, `order.canceled_unpaid`, `shipment.{created,failed,attached,shipped,delivered,problem,webhook,dhl}`, `return.{requested,code_sent,refund_failed,refunded}`, `exchange.{requested,shipped,failed}`, `contract.failed`.
- `wishlist_item`: müşteri başına ürün snapshot'ı (handle, title, thumbnail, price), unique (customer_id, product_id). Endpoints: GET/POST/DELETE + `sync` (localStorage birleştirme, ≤100).

### 4.7 Store API override'ları

- `GET /store/orders` — auth, misafir sipariş bağlama, `getOrdersListWorkflow`.
- `GET /store/orders/:id` — auth + sahiplik kontrolü (generic 404), `bank_transfer` eklenir.
- `POST /store/orders/lookup {id, email}` — misafir takip; `parseOrderNumber` (`#100003`, `100003`, `3`, `order_…`), e-posta eşleşmesi, `returns` + `bank_transfer`.
- `POST /store/contact` — honeypot, HTML escape, `CONTACT_INBOX`.
- `GET /store/custom` — deploy probe (`.build-meta`).
- `shared/order-number.ts`: müşteriye gösterilen numara = `100000 + display_id` (`ORDER_NUMBER_BASE`).

### 4.8 İade / değişim (RMA) — generic çekirdek aynen, kargo uçları adaptöre

Veri modeli: özel tablo **yok**; her şey Medusa `return`/`order` `metadata`'sında (`mareen_acceptance`, `mareen_rejection`, `mareen_exchange`, `paytr_refund`, `dhl_return_code*`).

**Müşteri tarafı:**
- `POST /store/returns/request` (üye) / `POST /store/returns/guest` (misafir, e-posta eşleşmesi) → `_create-return.ts` `createStoreReturnRequest`: sipariş iptal/draft değil; daha önce reddedilmiş kalem tekrar istenemez; yalnızca **teslim edilmiş** adet iade edilebilir (`delivered − requested − received − dismissed`); aynı sipariş için process-içi kilit (çift tık). Workflow: `beginReturnOrderWorkflow` → `requestItemReturnWorkflow` → `confirmReturnRequestWorkflow` → `order.return_requested`. Kargo yöntemi yok (çekirdek `POST /store/returns` kullanılmaz).
- `POST /store/returns/exchange-options` → aynı ürünün stoktaki diğer varyantları (stok sayısı verilmez). Tüm kalemlerde `exchange_variant_id` varsa talep **değişim** olur (`return.metadata.mareen_exchange`).

**Admin tarafı:**

| Uç | İş |
|---|---|
| `POST /admin/returns/:id/accept {items[{item_id, restock_quantity, damaged_quantity}], reason?, refund_shipping?}` | `planReturnAcceptance`: restock → receive (stoğa), damaged → dismiss (para iade, stok yok), kalan → reddedildi (para yok). `mareen_acceptance` yazılır → `beginReceiveReturn` → `receiveItem` → `dismissItem` → `confirmReturnReceive` → `order.return_received`. Kısmi kabul `partially_received` |
| `POST /admin/returns/:id/reject {reason?}` | `mareen_rejection` + `paytr_refund:{status:skipped}` önce yazılır (iade kilidi) → `cancelReturnWorkflow` → `mareen.return_rejected` |
| `POST /admin/returns/:id/refund` | `processReturnRefund` elle tekrar |
| `POST /admin/returns/:id/exchange`, `/exchange/ship`, `/exchange/cancel`, `/exchange/reship` | Değişim dönüştürme / gönderi / iptal |
| `POST /admin/returns/:id/geliver-code`, `/dhl-code {code}` | İade kodu üret / elle gir → müşteriye mail (`sendReturnCodeToCustomer`) — **`dhl-code` adına rağmen generic "elle kod gir"** |
| `GET /admin/mareen-returns?state=` | Son 500 iade, durum sınıflandırması (`open / received / refunded / problem / rejected / canceled`) + sayaçlar |
| `GET /admin/mareen-exchanges`, `GET/POST /admin/orders/:id/exchange` | Değişim listesi, admin'den değişim açma (telefonla gelen talep) |
| middleware `ensureReturnReceiveLocation` | `return.location_id` boşsa varsayılan depo yazılır (restock çalışsın) |

**Para iadesi** (`return-refund.ts` `processReturnRefund`, `order.return_received` ile): reddedilmiş/değişim aktif → atla; `paytr_refund.success` → idempotent atla; durum `received|partially_received` şart; tutar = teslim alınan adet × birim (`refundable_total_per_unit`) + kargo (sebep `metadata.seller_pays_shipping` veya admin `refund_shipping`; sipariş başına bir kez); `order.summary.pending_difference` negatifse tercih edilir; PayTR capture'ı olan ödeme bulunur → `refundPaymentWorkflow` → PayTR `/odeme/iade`; başarı → `paytr_refund{…}` + `mareen.return_refunded` (müşteri maili + Paraşüt iade faturası). **Havale siparişinde otomatik iade yok** → `status: failed, manual_required` + ops error + `RETURNS_INBOX` maili (IBAN'a elle).

**Değişim** (`exchange.ts`): yeni sipariş/ödeme **yok**. `shipExchange`: order edit ile yeni kalemler `unit_price: 0, is_custom_price: true` (`begin → addNewItem → request → confirm`), ardından **aynı siparişe yeni fulfillment** (`autoFulfillPaidOrder({manual:true, items, metadata:{mareen_exchange_return_id}})`, kargo no `-D` ekli). Durumlar: `requested → shipment_created | failed | canceled`; görünüm `awaiting_return | to_ship | label_ready | shipped | delivered | rejected | canceled`.

**İade sebepleri** (seed): `wrong_size_color`, `changed_mind`, `wrong_item` (kargo satıcıda), `defective` (kargo satıcıda), `other`. Es Çay: sebepleri çaya göre düzenle (`wrong_size_color` → ör. `wrong_variant`).

**Generic vs kargo:** talep/kabul/red/iade hesabı/değişim-order-edit/admin listeleri generic. Kargo bağımlı: `geliver-return-label.ts` (`GELIVER_RETURN_LABEL_ENABLED=1` ile otomatik iade kaydı), `/geliver-code`, `shipExchange` içindeki `autoFulfillPaidOrder`, `reshipExchange`'in Geliver iptali, müşteri mailindeki "DHL şubesine firma no + kod ile verin" metni.

### 4.9 Sipariş durumu ve operasyon

- **Özel durum alanı yok**; müşteriye görünen durum `shared/order-timeline.ts` `resolveOrderTimeline(order)` ile **türetilir**: `canceled` → iptal; fulfillment `delivered_at` → Teslim; `shipped_at` → Kargoda; `metadata.label_printed_at` veya `prepared_at` (+ ödenmiş/fulfillment var) → Hazırlandı; ödenmiş veya fulfillment var → Hazırlanıyor; aksi → Alındı. Aynı dosya admin (`src/admin/lib/order-timeline.ts`, elle kopya) ve storefront'ta.
- `advanceMareenOrderStatus({orderId, action})` (`POST /admin/orders/:id/mareen-status`): `prepare` (fulfillment yoksa `manual_manual`'a geçici provider swap ile oluşturur, `prepared_at`), `ship` (takip no/link ile `createOrderShipmentWorkflow`, `geliver_provider_code: "MANUAL"`), `deliver`, `link_geliver` (Geliver'e özgü). `notify:false` → müşteri maili yok.
- Admin sipariş listesi filtreleri: Medusa v2 ödeme/kargo durumu filtresi vermez → `scripts/patch-dashboard-order-filters.mjs` dashboard dist yaması ("Ödeme durumu", "Kargo durumu" seçicileri + hazır butonlar: Tümü / Kargolanacaklar / Havale bekleyenler / Kargoda / İptaller) + sunucu `status-filter.ts` (≤5000 sipariş tarar, `id` filtresine çevirir).
- `GET /admin/mareen-nav-counts` → kenar çubuğu rozetleri (bekleyen iade, kargolanacak, havale bekleyen); widget dakikada bir yoklar.

### 4.10 Paraşüt e-Arşiv / e-Fatura — aynen kopyalanır

Modül `src/modules/parasut` (DB modeli yok; durum `order.metadata.parasut_invoice`).
- **OAuth2 password grant** (`client_id/secret + username/password + company_id`), token cache (expires − 30 sn), refresh_token → başarısızsa password. 429/5xx/abort'ta exponential retry (`Try again in N seconds` dikkate alınır).
- **Mock mod:** beş kimlikten biri boş/placeholder ise HTTP yok. **DRY-RUN:** taslak oluşturur, finalize/GİB yok.
- **Tetik:** `payment.captured` (kart: PayTR callback; havale: admin onayı) → `issueSalesInvoiceForOrder`. Idempotent (`issued` atla; `pending/error` + `invoice_id` varsa yeniden oluşturmaz, finalize'a geçer).
- **Akış:** `ensureContact` (e-posta ile ara, yoksa oluştur: ad/unvan, vergi no, vergi dairesi, telefon, il/ilçe/adres) → `createSalesInvoice` (`order_no` = 100000+display_id, `issue_date` bugün, satırlar net `unit_price` + `vat_rate` + indirim, kargo satırı "Kargo") → `pending` → `finalizeInvoice` → `getInvoicePdf` → `issued` → müşteriye "e-Arşiv Fatura" maili (PDF linki).
- **e-Arşiv / e-Fatura kararı:** vergi no 10 haneli (VKN) ise `GET /e_invoice_inboxes?filter[vkn]=` → kayıt varsa **e_invoice**, yoksa/TCKN/boş → **e_archive** (`internet_sale {url, payment_type: KREDIKARTI/BANKAKARTI | EFT/HAVALE, payment_platform: PayTR | banka adı, payment_date}`).
- **KDV:** Medusa fiyatları KDV dahil → `gross/(1+rate/100)`; satır KDV `tax_lines[0].rate` yoksa `PARASUT_DEFAULT_VAT_RATE`; kargo `PARASUT_SHIPPING_VAT_RATE`; sipariş geneli kalan indirim `invoice_discount`. Bilinen sapma: 2 haneye yuvarlanan net birim × adet → 1 kuruş.
- **Ürün eşleştirme:** `variant.metadata.parasut_product_id` varsa o; yoksa SKU = Paraşüt ürün kodu → ad; bulunamazsa `PARASUT_PRODUCT_CREATE` ile oluşturur (`inventory_tracking:false`). Script'ler: `parasut-product-match` (rapor) → `parasut-apply-mapping` (`PARASUT_APPLY_CONFIRM=yes`).
- **Vergi no kaynağı:** `customer.metadata` / `billing_address.metadata` / `order.metadata` → `tax_number | vkn | tckn | identity_number`; `company_name`, `tax_office`, `district`. Storefront checkout bunları `billing_address.metadata`'ya yazar.
- **Hata:** `error` + `PARASUT_ADMIN_ALERT_EMAIL` maili (idempotent `admin_notified_at`); job `retry-parasut-invoices` (15 dk, 72 saat, 8 deneme); admin widget "Yeniden dene".
- **İade faturası** (`mareen.return_refunded`): `createRefundInvoice` → `order.metadata.parasut_refund_invoices[return_id]`. Kodda "iskelet" olarak işaretli: **detay satırı göndermez, resmileştirmez** → Es Çay'da mali müşavirle netleştirip tamamla.
- Markaya bağlı: açıklama metni "Mareen sipariş/iade …", `mareen.com.tr` fallback URL.

### 4.11 Yasal sözleşme PDF'leri ve etiketler — aynen kopyalanır

- `shared/legal-contracts.ts`: Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi metni tek kaynak; `CONTRACT_SELLER` künyesi; `CONTRACT_TEXT_VERSION`. Storefront `/legal/*` `data=null` ile ("sipariş sırasında belirtilir"), backend siparişin verileriyle.
- `order.placed` → `generateOrderContracts` (`src/lib/order-contracts.ts`): `S3_BUCKET` şart; `getOrderDetailWorkflow` ile tutarlar; A4 pdf-lib (Inter font, `subset:false`); **private S3** `contracts/<order_id>/<kind>.pdf` (AES256); `order.metadata.contracts{source:"medusa", generated_at, legal_accepted_at, backfilled, text_version, keys}`; bir kez oluşturulur (immutable); 1 saatten geç üretilirse "sonradan oluşturulmuştur" dipnotu. Hata → ops `contract.failed`.
- `GET /admin/orders/:id/contracts/:kind` → 300 sn imzalı S3 linki; widget "Sözleşmeleri oluştur".
- **Etiket**: `order-packing-label.ts` (sipariş fişi modeli), `label-pdf.ts` (`buildLabelsPdf`: 10×15 cm termal, 12,7 mm pay, firmanın PDF etiketi üstte + `?slip=1` ile altında fiş: adet × ürün · varyant · SKU, not), `label-logos.ts` (marka logosu base64 — **değiştir**). `GET /admin/mareen-labels/orders?ids=&slip=` → `order.metadata.label_printed_at` yazar; alınamayan etiketler `X-Mareen-Skipped` başlığında. Admin: tekli widget + sipariş listesi üstünde toplu widget (`migration-scripts/order-list-bulk-labels-first.ts` ile `order.list` düzeninde en üste).
- Fontlar: `data/fonts/Inter-{Regular,Medium}.ttf` (Türkçe glif).

### 4.12 Admin özelleştirmeleri envanteri (`src/admin/`)

| Dosya | Zone | İş | Es Çay |
|---|---|---|---|
| `widgets/bank-transfer-widget.tsx` | `order.details.side.before` | Havale durumu + "Havale alındı" | Aynen |
| `widgets/order-label-widget.tsx` | `order.details.side.before` | Tekli etiket yazdır (barkod gelene dek 10 sn yoklar) | Aynen (adaptör anahtarı) |
| `widgets/order-ops-widget.tsx` | `order.details.side.before` | Kargo kurtarma (Geliver aday/bağla/yeniden dene) + sipariş olayları | Olaylar aynen; Geliver kısmı adaptöre |
| `widgets/order-exchange-widget.tsx` | `order.details.side.before` | Değişim oluştur/gönder/iptal/etiket | Aynen |
| `widgets/return-reject-widget.tsx` | `order.details.side.before` | İade kutusu: ürün bazlı kabul (stoğa/hasarlı), red, iade tekrar, kod gir | Aynen |
| `widgets/order-status-widget.tsx` | `order.details.side.after` | Zaman çizelgesi + Hazırlandı/Kargoya ver/Teslim + takip no + Geliver/DHL elle bağlama | Aynen; Geliver/DHL alanları adaptöre |
| `widgets/order-contracts-widget.tsx` | `order.details.side.after` | Sözleşme PDF'leri | Aynen |
| `widgets/parasut-invoice-widget.tsx` | `order.details.side.after` | Fatura durumu + tekrar | Aynen |
| `widgets/order-bulk-labels-widget.tsx` | `order.list.before` | Toplu etiket, ödeme/kargo/etiket filtreleri, toplu kargoya verildi/teslim (`notify:false`), yeniden gönderi | Aynen |
| `widgets/hide-native-return-actions.tsx` | `order.details.before` | Medusa'nın yerleşik iade/claim/edit/fulfillment/refund linklerini gizler (CSS + MutationObserver) → personel özel akışları kullanır | Aynen |
| `widgets/variant-stock-widget.tsx` | variant/inventory detay | Lokasyon bazlı stok hızlı düzenleme | Aynen |
| `widgets/nav-badges-widget.tsx` | 10 zone | Kenar çubuğu rozetleri | Aynen |
| `widgets/default-language-tr.tsx` | login + listeler | Admin dilini bir kez TR yapar | Aynen |
| `widgets/login-remember-me.tsx` | `login.after` | "Beni hatırla (7 gün)" çerezi | Aynen (çerez adı değişir) |
| `widgets/stale-chunk-reload.tsx` | `login.before` | Deploy sonrası `vite:preloadError` → 30 sn'de en fazla bir reload | Aynen |
| `widgets/trendyol-product-widget.tsx` | `product.details.after` | | Sil |
| `routes/iadeler` ("İadeler"), `routes/degisimler` ("Değişimler"), `routes/ops-events` ("Logs"), `routes/sales-stats` | sidebar | Listeler + satış istatistikleri (`GET /admin/sales-stats`: ham SQL, kaynak web/trendyol/wp, saat/gün/hafta/ay, Europe/Istanbul, top ürünler, önceki dönem karşılaştırma) | Aynen; sales-stats'tan wp/trendyol kaynaklarını çıkar |
| `routes/trendyol/*`, `routes/wp-orders/*`, `components/wp-*.tsx` | | | Sil |
| `i18n/json/tr.json` | | Eksik çekirdek TR çeviriler + etiket override'ları ("Tamamlama" → "Kargo durumu") | Aynen |
| `lib/persisted-state.ts` | | sessionStorage filtre kalıcılığı (`mareen-admin:` öneki) | Aynen |
| `migration-scripts/order-list-bulk-labels-first.ts`, `sidebar-sales-stats-after-price-lists.ts` | | Settings modülü ile varsayılan layout (2.18'de widget before/after sırası yok sayılır) | Aynen |
| `GET /admin/tr-geo` | | 81 il + ilçeler (admin Vite build CJS shared'ı import edemediği için API) | Aynen |

---

### 4.13 Kargo katmanı — Mareen'de nasıl, Es Çay'da nasıl olmalı

Mareen'de **tek özel fulfillment provider** var: `src/modules/geliver` (`geliver_geliver`). `SHIPPING_CARRIER=dhl_direct` yalnızca bu provider'ın `createFulfillment`/`cancelFulfillment` içinde DHL Apizone'a devreder. Gerçek bir "taşıyıcı arayüzü" **yok**; sözleşme örtük: her adaptör aynı `labels[]` biçimini ve aynı `fulfillment.data` anahtarlarını (`geliver_*` önekli) yazar; mailler, storefront, etiketler ve admin widget'ları bu anahtarları okur.

#### Orkestrasyon (generic — Es Çay'da aynen korunur)

```
payment.captured
  └─ subscribers/payment-captured-geliver.ts → findOrderIdForPayment → autoFulfillPaidOrder(orderId)
        ├─ atla: AUTO_FULFILL kapalı | token yok | sipariş iptal | aktif gönderi var | kalan adet 0
        ├─ order.metadata.email / geliver_recipient_email yaz (workflow provider'a order.email vermez!)
        ├─ kalan adet = items.detail.quantity − fulfilled_quantity
        ├─ stok lokasyonu = resolveDefaultStockLocationId()
        └─ createOrderFulfillmentWorkflow({items, location_id, shipping_option_id, metadata, no_notification:true})
               └─ provider.createFulfillment → {data, labels[]}            ← ADAPTÖR
  ops: shipment.created | shipment.failed

Taşıyıcı durum güncellemesi (webhook VEYA polling job)
  └─ applyGeliverFulfillmentAction(fulfillmentId, "shipped" | "delivered" | "failed" | "returned")
        ├─ shipped  → createOrderShipmentWorkflow(labels) → Medusa shipment.created → "Kargoya verildi" maili
        ├─ delivered → (önce shipped) markOrderFulfillmentAsDeliveredWorkflow → delivery.created → "Teslim edildi" maili
        ├─ failed/returned → ops shipment.problem
        └─ isAlreadyDone(): webhook + job yarışında "already shipped/delivered" yutulur (çift mail yok)

Elle: POST /admin/orders/:id/mareen-status {prepare | ship(tracking_number, tracking_url) | deliver, notify}
Yeniden gönderi: taşıyıcıda iptal (reddederse DUR) → cancelOrderFulfillmentWorkflow → autoFulfillPaidOrder(manual)
İade kodu: order.return_requested → (adaptör createReturn?) → sendReturnCodeToCustomer → return.metadata.dhl_return_code*
```

Generic dosyalar (yeniden adlandırarak koru): `lib/auto-fulfill-order.ts`, `lib/geliver-fulfillment-actions.ts` (`applyGeliverFulfillmentAction` → `applyCarrierAction`), `lib/shipping-status-email.ts` + `subscribers/order-shipping-status-email.ts` + `emails/shipping-notifications.ts`, `lib/mareen-order-status.ts`, `lib/return-code.ts`, `lib/label-pdf.ts` + `order-packing-label.ts` + `api/admin/mareen-labels`, `lib/shipment-audit.ts` (denetim kuralları), `lib/dhl/track-shipments.ts` (polling job iskeleti: `trackTarget` + `getStatus` + `applyAction`), `api/geliver/webhook/route.ts` yapısı (secret → her zaman 200 → shipment id ile fulfillment eşle → data merge → action → ops), `shared/order-timeline.ts`, `modules/geliver/package-profile.ts` (koli hesabı), `modules/geliver/tr-geo.ts` + `shared/tr-address.ts` + `shared/tr-districts.ts` (TR adres çözümleme), `mapping.ts` içindeki alıcı çözümleme mantığı (il: `metadata.city_code` → `province` → `city` → posta kodu; ilçe: `metadata.district` → `province` → `address_2` → varsayılan).

Geliver'e özgü (at): `GeliverClient` (`/shipments`, `/transactions`, `/priceList`, `/addresses`), teklif bekleme/seçme (`offers.ts`, `pricing.ts`), gönderici adres id, `GELIVER_ORDER_PREFIX` eşleşmesi (`geliver-order-link.ts`), `attach`/`link_geliver`, `x-geliver-secret`, `geliver-return-label.ts`. DHL'e özgü (at ya da DHL seçilirse yeniden değerlendir): `lib/dhl/*`, `manual-dhl-shipment.ts`, `jobs/dhl-track-shipments.ts`, `api/admin/dhl`, `api/admin/orders/[id]/dhl-manual`.

#### Checkout kargo ücreti (Mareen)
Seed varsayılanı `price_type: flat` 149,99 TL. `set-shipping-price-type` ile `calculated` yapılırsa `calculatePrice` Geliver `GET /priceList` (8 sn timeout, 10 dk cache) + `GELIVER_CHECKOUT_FEE`; hata/teklif yoksa `GELIVER_FALLBACK_SHIPPING_PRICE`. Prod kararı: **sabit 149,90**. Ücretsiz kargo eşiği yok. Es Çay: flat + Medusa shipping option **rules** ile eşik (ör. `cart.total >= X` için ikinci "Ücretsiz Kargo" seçeneği) ya da promosyon.

#### Koli profili
`DEFAULT_PACKAGE_PROFILE` 30×20×10 cm, 0,2 kg × adet, `maxHeight` (hep 2 desi). Line item `metadata.weight_kg|weight_g|weight|length|width|height` profili ezer (store API'den yazılamaz, `_strip-reserved-metadata`). `SHIPPING_PACKAGE_DEFAULT` JSON env profili ezer. **Çay:** varyant gramajından `weight_kg` türet; koli boyutlarını gerçek paketle ölç.

#### Es Çay için minimal taşıyıcı adaptörü (kodun gerçekten çağırdıklarından türetildi)

```ts
type Parcel = { weight: number; length: number; width: number; height: number }
type Recipient = { name; email; phone /* +90… */; address1; address2?; cityCode; cityName; districtName; zip? }
type LabelRow = { tracking_number: string; tracking_url: string; label_url: string }
type FulfillmentAction = "none" | "shipped" | "delivered" | "canceled" | "returned" | "failed"

interface CarrierAdapter {
  code: string                                   // data.carrier
  owns(data): boolean                            // mevcut kaydı bu adaptör mü açtı
  createShipment(input: { order:{id, display_id, isExchange?}, fulfillmentId?, recipient: Recipient,
                          parcel: Parcel, items:{title, sku?, quantity}[] }):
    Promise<{ data: Record<string,unknown>; labels: LabelRow[] }>   // sipariş başına SABİT referans, POST'u körlemesine retry ETME
  cancelShipment(data): Promise<Record<string,unknown>>             // provider cancel: throw etmez
  cancelShipmentStrict?(data): Promise<void>                        // reship/elle bağlama: reddedilirse DUR
  quote?(parcel: Parcel): Promise<number | null>                    // calculatePrice; null → flat yedek
  getStatus(data): Promise<{ code; description; action: FulfillmentAction }>   // polling job
  parseWebhook?(req): { shipmentRef; action; patch; labels? } | null
  getLabel?(data, format: "pdf"|"zpl"): Promise<Buffer|string>     // yoksa data.label_url PDF olarak çekilir
  createReturn?(originalData, returnId): Promise<{ returnCode?; trackingNumber?; trackingUrl?; labelUrl?; data }>
  trackingUrl(trackingNumber): string                               // {code} şablonu
}
```

Bağlama: tek generic Medusa fulfillment provider (`createFulfillment`/`cancelFulfillment`/`calculatePrice`/`createReturnFulfillment` → `SHIPPING_CARRIER` ile yeni gönderi, `data.carrier` ile mevcut), adaptör başına bir webhook route (`parseWebhook`), tek polling job (`trackTarget` + `getStatus`), `applyCarrierAction` değişmeden.

**Normalize `fulfillment.data` sözleşmesi** (Mareen'deki `geliver_*` yerine): `carrier`, `tracking_number`, `tracking_url`, `carrier_name` (bugün `geliver_provider_code`), `label_url` | `label_zpl`, `shipment_ref` (bugün `geliver_shipment_id`/`dhl_reference_id`), `barcode`, `status_code`, `status`, `status_at`, `test_mode`. Anahtarlar değişince güncellenecek okuyucular: `shipping-status-email.ts`, `geliver-fulfillment-actions.ts` (`buildShipmentLabels`), `order-packing-label.ts`, `order-label-widget.tsx` (`geliver_barcode` yoklar), `order-bulk-labels-widget.tsx`, `order-status-widget.tsx`, `shared/order-timeline.ts`, `exchange-admin-list.ts`, `mareen-returns/route.ts`, storefront `OrderDetail.tsx` + `order-types.ts`, `shipment-audit.ts`.

**Seçenek B (API yok):** yalnızca `fulfillment-manual`; seed `provider_id: "manual_manual"`; `withManualShipping` hack'i gereksiz; `autoFulfillPaidOrder` ya manual fulfillment açar ya da atlar; admin `prepare/ship/deliver` + takip no ile mailler çalışır; etiket = sipariş fişi + firmanın etiketi.

#### Tasarıma taşınacak tuzaklar
- `query.graph`'ta `items.detail.quantity` iste.
- Fulfillment workflow provider'a `order.email` vermez → metadata workaround'u koru.
- Taşıyıcı POST'larını körlemesine retry etme; sipariş başına sabit referans; "satın al" adımından önce shipment id'yi kaydet.
- Reship/elle bağlama için throw eden iptal gerekir.
- Webhook + polling birlikte çalışıyorsa `isAlreadyDone` koruması.
- Auto-fulfill `no_notification:true` ile açılır ama shipment/delivery olayları bildirimli olmalı (yoksa müşteri maili gitmez).
- Webhook eşleşmesi Mareen'de yalnızca son 200 fulfillment'ta arıyor → `shipment_ref` ile doğrudan sorgu yap.

### 4.14 Trendyol — Es Çay'da yok
Modül `src/modules/trendyol` (3 tablo: `trendyol_product_mapping`, `trendyol_order_import`, `trendyol_sync_log`), `lib/trendyol-*.ts`, 3 job, 2 subscriber (`inventory-level.updated`, `reservation.created`), admin sayfa/widget, `api/admin/trendyol/**`. Temiz kaldırma için ayrıca `source === "trendyol"` dallarını temizle: `sales-stats` (route + page), `order-contracts` (+widget), `meta-capi.ts`, `omnisend-placed-order.ts`, `_strip-reserved-metadata.ts` (`trendyol` öneki), `cleanup-abandoned-orders.ts`.

---

## 5. Storefront (Next.js 15 App Router)

Stack: Next.js 15.5.27, React 19.1, `@medusajs/js-sdk`, Tailwind v4 (yalnızca `@import "tailwindcss"`; utility sınıfları neredeyse kullanılmıyor), stil = `globals.css` (5,6k satır, BEM-ish) + 16 CSS module. Fontlar Fontsource (npm). `experimental.externalDir: true` (kök `shared/` için). `<html lang="tr">`; çoklu dil **yok** (`i18n-home.ts` tr/en sözlüğü kalıntı, `readStoredLang` hep `tr`).

### 5.1 Veri katmanı (`src/lib/medusa.ts`)
- Tarayıcı Medusa'yı **hiç çağırmaz**; tüm çağrılar RSC / Server Action / route handler'da. Tek backend URL: `MEDUSA_BACKEND_URL` → `NEXT_PUBLIC_MEDUSA_BACKEND_URL` → localhost (dinamik `process.env[key]` okuma → build'e gömülmez).
- `sdk` lazy singleton Proxy (`publishableKey` env'den). Cache/retry yok.
- `storePricingParams()` = `{region_id, country_code: "tr"}`; `storeCartCreateParams()` = `{region_id}`.
- Görseller: `s3BaseUrl()` (`NEXT_PUBLIC_S3_FILE_URL`, **hardcoded Mareen bucket fallback → değiştir**), `s3FileUrl(f) = base/files/f`, `siteMediaUrl("/media/x") → files/site/x` (tüm pazarlama medyası S3'te). `DeferredImage` düz `<img>` (next/image değil).
- `lib/site.ts`: `SITE_URL` runtime; `isIndexableSite()` domain hardcoded → **değiştir**.
- `lib/stock.ts`: `LOW_STOCK_THRESHOLD=5`, `CRITICAL=3`; `inventory_quantity == null` stokta sayılır.
- `lib/cart-pricing.ts`: `VAT_RATE=10` hardcoded (**çay KDV**), `CART_SHIPPING_PRICE=149.99` yalnızca gösterim yedeği.
- `lib/email-domain.ts`: misafir e-postası için DNS MX/A kontrolü (3 sn, cache 1 saat, yalnızca NXDOMAIN/null MX reddeder, `.test` muaf).
- `lib/cookie-secure.ts`: `COOKIE_SECURE` → URL şeması → `NODE_ENV`.
- `lib/consent.ts`: CookieYes (`NEXT_PUBLIC_COOKIEYES_ID`, **hardcoded fallback → değiştir**), `readConsent()` (`getCkyConsent` → çerez), kategori: `analytics||performance` → analytics, `advertisement` → marketing, `cookieyes_consent_update` olayı.

### 5.2 Auth (BFF modeli) — aynen
Çerezler (`httpOnly`, `sameSite: lax`, `secure` koşullu):

| Çerez | TTL | Amaç |
|---|---|---|
| `_mareen_jwt` | 7 gün | Müşteri JWT |
| `_mareen_verify_jwt` | 24 saat | Doğrulama bekleyen actorless JWT (aynı tarayıcıda doğrulama → `auth.refresh` ile tam oturum) |
| `_mareen_cart_id` | 14 gün | Sepet |
| `_mareen_last_order_email`, `_mareen_last_order_id` | 24 saat | Misafir onay sayfası lookup, PayTR success yönlendirmesi |
| `_mareen_pending_checkout` | 24 saat | `[{variant_id, quantity}]` snapshot: PayTR fail/vazgeçmede sepeti yeniden kurma |

- Login: `sdk.auth.login` → `verification_required` ise verify çerezi + doğrulama maili isteği + `code: "unverified"`; JWT ise çerez + `cart.transferCart`.
- Register: `auth.register` → `customer.create` (Bearer) → login → `needs_verification`. UI slide-in `LoginPanel` (`?login=1` / `?register=1`).
- Doğrulama `/verify-email?token&email` → `verification.confirm` → aynı tarayıcıda `auth.refresh` → `/hesabim`.
- Şifre sıfırlama `/forgot-password` (anti-enumeration) → `/reset-password?token&email` → `auth.updateProvider`.
- Logout yalnızca çerez siler. Remember-me/refresh yok.
- `getLoggedInCustomer()` root layout'ta **her istekte** → tüm sayfalar dinamik (performans borcu: ISR planla).
- Hesap: profil, şifre (`/store/customers/me/password`), siparişler, adresler (`address_2` = mahalle, `metadata {district, neighbourhood, city_code}`), favoriler (`FavoritesProvider`: misafir localStorage → girişte `wishlist/sync`).

### 5.3 Sepet
`lib/cart.ts` (`CART_FIELDS`, `getCart` auth header'lı), `lib/actions.ts` (`ensureCart`, `addToCart` — tamamlanmış sepette yeni sepetle 1 kez retry, `updateLineItem`, `removeLineItem`). Client olayları `mareen:cart-added` (toast + GA4/Pixel add_to_cart), `mareen:cart-count`. Sepet sayfası: `CartItems`, `CartSummary` (kargo tahmini ilk shipping option), `PromoCodeForm` (yalnızca `/sepet`'te), `CheckoutProgress`. `/sepet/recover/[cartId]`: Omnisend terk edilmiş sepet linki → **her zaman yeni sepet** açıp kalemleri kopyalar (imzasız link, kaynak sepet çereze bağlanmaz) → `/odeme`.

### 5.4 Checkout akışı (adım adım) — aynen
`app/odeme/page.tsx` (force-dynamic) → `CheckoutForm.tsx` (~1.400 satır, tek sayfa).

1. **Form:** e-posta (üyede kilitli), pazarlama izni (varsayılan kapalı), kayıtlı adres seçici, ad/soyad, **İl (81) → İlçe (973, `shared/tr-districts`) → Mahalle (`/tr-mahalle/<plaka>.json`, NVİ, "Listede yok — elle yaz")**, posta kodu (5 hane), adres, telefon (`normalizeTrPhone`), sipariş notu (≤500), fatura tipi Bireysel (TCKN opsiyonel) / Kurumsal (unvan, VKN 10 hane, vergi dairesi), ayrı fatura adresi kutusu (etiketi "Farklı bir adrese gönderilsin mi?" — **yanıltıcı, düzelt**).
2. **Doğrulama** (`lib/checkout-address.ts`, client + server): açık adres yalnızca mahalle/ilçe/il adıysa kesin engel; numara/sokak yoksa "Adresinizi kontrol edin" onayı; `buildBillingInvoiceMetadata` → `billing_address.metadata {invoice_type, vkn|tckn, tax_office, company_name, district, neighbourhood, city_code, email}` (Paraşüt ile hizalı); shipping metadata `{district, neighbourhood, city_code, email}`.
3. **Autosave:** geçerli formda 700 ms debounce → `saveCheckoutContactAction` → `cart.update` (adresler, `metadata.marketing_consent`, `metadata.tracking_consent` (CookieYes marketing), `metadata.order_note`); sunucuda e-posta DNS kontrolü; kargo seçenekleri yenilenir.
4. **Kargo:** `fulfillment.listCartOptions` (+ `calculated` için `calculate`); `syncShippingWithCart` ilk/seçili seçeneği otomatik uygular.
5. **Ödeme yöntemi:** `GET /store/bank-transfer` enabled ise "Kredi/banka kartı" | "Havale/EFT".
6. **Yasal onay:** tek zorunlu kutu (mesafeli satış + ön bilgilendirme linkleri), onaysız gönderim diyalogla engellenir.
7. **Submit** (kilitli): save → shipping uygula → özet → ödeme session'ı (havale: `pp_havale_havale`; kart: `pp_paytr_paytr` + `data` {müşteri, adres, `cart_items` + "Kargo" satırı, `user_ip`}) → **`completeCheckoutAction`**: `cart.metadata.legal_accepted_at` + `payment_method` → kalem snapshot → `cart.complete` (**sipariş ödeme öncesi oluşur**) → last-order çerezleri → pending snapshot → sepet çerezi silinir → kart: `redirect("/odeme/payment/<token>")`; havale: `/odeme/confirmation/<orderId>`.
8. **`/odeme/payment/[token]`:** `PaytrIframe` (`https://www.paytr.com/odeme/guvenli/<token>` + PayTR iframeResizer); sepeti okumaz (F5 güvenli).
9. **`/odeme/payment-result?status&oid`** (PayTR ok/fail URL, **iframe içinde** açılır; `frame-ancestors` bu yüzden): success + last-order çerezi → `/odeme/confirmation/<id>`; failed → `RestorePendingCheckoutOnMount` sepeti snapshot'tan kurar, "Tekrar dene". Bu sayfaya ulaşmak onay **değildir**.
10. **`/odeme/confirmation/[id]`:** üye `order.retrieve`, misafir `POST /store/orders/lookup` (çerezdeki e-posta) → `CheckoutConfirmationView` (100000+display_id, timeline rozeti, havalede `BankTransferBox` IBAN/tutar/açıklama) + `TrackPurchase` (GA4 purchase, Pixel Purchase `eventID purchase-<id>`, Ads conversion) + `FinalizePaidCheckoutOnMount` (çerez temizliği).

Bilinen boşluk: onay sayfası PayTR iframe'i **içinde** render olur, `target=_top` çıkışı yok → Es Çay'da `payment-result`'a `window.top.location` ekle.

### 5.5 Sipariş / iade (müşteri)
- `/order-tracking` (sipariş no `#100003|100003|3|order_…` + e-posta) → `POST /store/orders/lookup` → `/order-tracking/<id>?email=` (Analytics e-postayı maskeler, Pixel bu yolda atlanır).
- `OrderDetail.tsx`: timeline (shared), takip (`labels[].tracking_*` veya `data.geliver_tracking_*` → **normalize anahtarlara geçir**), kalemler, adres, iadeler, havale kutusu.
- `OrderReturnRequest.tsx`: "İade talebi" / "Beden-renk değişimi" (çayda "varyant değişimi" ya da kaldır); kalem adedi (`item.detail` ile iade edilebilir adet), değişimde hedef varyant (`exchange-options`), sebep (`/store/return-reasons`), not. Başarı metni DHL şubesine yönlendiriyor → kargo firmasına göre değişir.
- `hesabim/LegacyOrders.tsx` → sil.

### 5.6 Katalog ve içerik
- **PDP** `/urun/[slug]`: handle ↔ slug (`lib/urls.ts` WP haritaları → **boşalt**), `metadata.story`, `spec-labels.ts` (`metadata.specifications` + kategori varsayılanları → çay: menşei, gramaj, demleme süresi/sıcaklığı, aroma notları), varyant/renk swatch (`?v=`, `?color=`), düşük stok notu, `ProductGallery` (varyant bazlı S3 görsel; `variant-images.json` WP SKU anahtarlı → **boşalt**), `ProductAudioStory` (Palimpsest'e özgü → sil veya `metadata.audio_url` generic), ilgili ürünler (kategori/koleksiyon skoru), `TrackViewItem`, `generateMetadata` (`metadata.seo_title/seo_description`, canonical, og image).
- **Listeleme** `/urun-kategori/[[...path]]`: kategori (50) + koleksiyon (20) + ürün (limit 200, **sayfalama yok**), filtre `color`/`sort`/`q` client-side, tükenenler sona; `CategoryProductGrid` editoryal S3 tile havuzları (marka içeriği); sabit başlık/pin/varyant-genişletme listeleri (marka).
- **Ana sayfa** `HomeLocalized.tsx`: hero video (S3), 3 kategori banner'ı, `FeaturedProductsCarousel`, 4 koleksiyon hikâyesi, footer'da statik Instagram mozaiği (API değil). Tamamı marka içeriği → yeniden tasarla; mimariyi (SSR fetch + bileşen düzeni) koru.
- **Arama** `lib/product-search.ts`: tüm katalog (300) 60 sn in-memory cache; Türkçe katlama, token skorlama (başlık prefix 10, SKU 8, substring 6, option 5, fuzzy, koleksiyon 3, açıklama 1); `GET /api/search?q=` top 6; `/search` 24.
- Ölü marka kodu: `PatternFeature`, `CollectionBannerSlider`, `CategoryTile`, `components/collection/*`, `lib/collections/palimpsest.ts`, `PATTERN_OF_MONTH_HANDLE`.

### 5.7 SEO / feed / redirect
- `app/sitemap.ts` (statik + ürün 500 + kategori 200 + koleksiyon 100; `siteUrl()`), `app/robots.ts` (indekslenmeyen host → `disallow /`; `/api`, `/sepet`, `/odeme`, `/hesabim`, `/istek-listesi`, `/order-tracking`, auth sayfaları kapalı). `metadataBase` yok; yalnızca PDP'de canonical/OG → kategori/koleksiyon metadata ekle.
- `next.config.ts`: `www → apex` 308 (hardcoded), WP redirect json (sil), İngilizce eski yollar → Türkçe (sil veya koru), güvenlik başlıkları.
- **Ürün feed'i** `lib/product-feed.ts`: RSS 2.0 `g:` namespace, varyant başına item (id, item_group_id, price/sale_price, availability, brand, google_product_category, product_type), 100'lük sayfalama ≤2000, cache 1800 sn. Mareen'de WP yolunda (`/wp-content/uploads/woo-product-feed-pro/xml/<hash>.xml`, Google + Meta) → Es Çay'da `/feeds/google.xml`, `/feeds/meta.xml`; `g:id` = variant id/SKU; `g:brand` sabiti değişir.

### 5.8 Analytics ve onay
| Script | Nerede | Kapı | ID |
|---|---|---|---|
| CookieYes | `layout.tsx` `next/script afterInteractive` | hep | `NEXT_PUBLIC_COOKIEYES_ID` (fallback hardcoded) |
| GA4 gtag | `Analytics.tsx` | analytics onayı + prod host | `NEXT_PUBLIC_GA4_ID` (fallback hardcoded) |
| Clarity | `Analytics.tsx` | analytics | `NEXT_PUBLIC_CLARITY_ID` (fallback) |
| Google Ads | `Analytics.tsx` | marketing | `NEXT_PUBLIC_GOOGLE_ADS_ID` (fallback) + **conversion label hardcoded** |
| Meta Pixel | `Analytics.tsx` | marketing | `NEXT_PUBLIC_META_PIXEL_ID` (fallback) |
| Omnisend launcher | `OmnisendSnippet.tsx` | marketing | `NEXT_PUBLIC_OMNISEND_BRAND_ID` (yoksa kapalı) |
| PayTR iframeResizer | `PaytrIframe.tsx` | yok (ödeme) | — |

- `isProductionHost()` domain hardcoded → değiştir. `safeLocation()` `email/token/code` query'lerini maskeler. SPA page_view pathname değişiminde.
- E-ticaret olayları (`lib/analytics.ts`, `TrackEvent.tsx`): `view_item`/ViewContent, `add_to_cart`/AddToCart, `begin_checkout`/InitiateCheckout, `purchase`/Purchase (`eventID` CAPI dedupe, sessionStorage ile tekrar engeli) + Ads conversion. Item id `wc_variation_id` → variant id.
- **Dockerfile'da GA4/Ads/Pixel/Clarity/CookieYes `ARG` yok** → bugün hardcoded fallback'ler kullanılıyor. Es Çay: ARG+ENV ekle, fallback'leri sil.

### 5.9 API route'ları
`/api/build-info` (public, commit), `/api/contact` (12/10 dk, honeypot → backend `/store/contact`), `/api/search`, `/api/staging-diag` (`ALLOW_STAGING_DIAGNOSTICS=1`), `/api/cart/smoke` (**prod'da korumasız gerçek sepet açar → kaldır**).

### 5.10 Markaya bağlı / silinecek / generic özeti
- **Değiştir:** `lib/company.ts`, `shared/legal-contracts.ts`, `lib/site.ts`, `lib/consent.ts`, `Analytics.tsx` ve `lib/analytics.ts` fallback'leri, `next.config.ts` domain'leri, `medusa.ts` S3 fallback, `layout.tsx` metadata/fontlar, `globals.css` renk/font token'ları (`--background`, `--brand-deep`, `--brand-gold`, `--font-*`), `public/` logo/favicon/e-posta logosu, `SiteHeaderBar NAV_LINKS`, `SiteFooter` listeleri, hakkımızda/SSS/iletişim/yasal metinler, `CartInfoAside` metni, iade başarı metni, promo placeholder, `VAT_RATE`, `/api/cart/smoke` handle, `_mareen_*` çerez ve `mareen:*` olay adları, `html.mareen-loading`.
- **Sil (WP):** `wp-redirects.json`, `urls.ts` haritaları, feed WP yolu, `wc_*` metadata kullanımları, `LegacyOrders`, `/products` ve `/categories` redirect sayfaları, çerez politikasındaki `mareen-lang` satırı.
- **Generic (koru):** BFF auth, sepet + self-heal, abandoned-cart recovery, tek sayfa checkout + autosave + TR adres modeli + fatura kimliği + DNS e-posta kontrolü, PayTR iframe akışı + pending snapshot, havale kutusu, misafir sipariş/iade UI, fuzzy arama, stok/KDV yardımcıları, onaylı analytics yükleyici, sitemap/robots/güvenlik başlıkları, build-info, Playwright paketi.

---

## 6. Sipariş yaşam döngüsü — uçtan uca olay zinciri

```
[Storefront]                                   [Backend olayları]                        [Yan etkiler]
cart.update (adres, metadata)  ───────────────► cart.updated ──────────────────────────► Omnisend started checkout (izinliyse contact)
initiatePaymentSession(paytr|havale)
cart.complete ────────────────────────────────► order.placed (ödeme BEKLER) ───────────► Sözleşme PDF'leri → S3 (private)
                                                                                        Havale ise: "Ödemeniz Bekleniyor" maili + ops payment.pending
                                                                                        Kart ise: mail YOK
Kart: PayTR iframe → müşteri öder
PayTR → POST /paytr/callback (hash) ──────────► processPaymentWorkflow(SUCCESSFUL)
Havale: admin "Havale alındı" ────────────────► processPaymentWorkflow(SUCCESSFUL)
                                                payment.captured ───────────────────────► "Siparişiniz Alındı" maili (idempotent)
                                                                                        Paraşüt e-Arşiv/e-Fatura → fatura maili
                                                                                        autoFulfillPaidOrder → kargo gönderisi/etiket (ADAPTÖR)
                                                                                        Omnisend placed order
                                                                                        Meta CAPI Purchase (tracking_consent)
                                                                                        ops payment.succeeded
PayTR failed / 30 dk sessizlik ───────────────► cancelOrderWorkflow (stok serbest) ───► ops payment.failed | order.canceled_unpaid
Admin etiket yazdır ──────────────────────────► order.metadata.label_printed_at ──────► timeline "Hazırlandı"
Taşıyıcı webhook/polling: shipped ────────────► createOrderShipmentWorkflow → shipment.created ─► "Kargoya verildi" maili (takip linki)
Taşıyıcı: delivered ──────────────────────────► markOrderFulfillmentAsDelivered → delivery.created ─► "Teslim edildi" maili
Müşteri iade talebi ──────────────────────────► order.return_requested ───────────────► iade kodu/talep maili + satıcı maili + ops return.requested
Admin kabul (stoğa/hasarlı) ──────────────────► order.return_received ────────────────► PayTR iade → mareen.return_refunded → müşteri maili + Paraşüt iade faturası
                                                                                        (havale: manual_required + alarm)
Admin red ────────────────────────────────────► mareen.return_rejected ───────────────► red maili
Değişim ──────────────────────────────────────► order edit (0 TL kalem) + yeni fulfillment aynı siparişe (-D)
```

Sipariş numarası: müşteriye `#100000 + display_id`; taşıyıcıya `<PREFIX>-<display_id>` (değişimde `-D`).

Metadata sözleşmesi (store API'den yazılabilen): cart `payment_method`, `marketing_consent`, `tracking_consent`, `legal_accepted_at`, `order_note`; adres `district`, `neighbourhood`, `city_code`, `email`; fatura `invoice_type`, `vkn|tckn`, `tax_office`, `company_name`. Sunucu tarafı: order `contracts`, `parasut_invoice`, `parasut_refund_invoices`, `label_printed_at`, `prepared_at`, `email`; return `mareen_acceptance`, `mareen_rejection`, `mareen_exchange`, `paytr_refund`, `dhl_return_code*`; variant `parasut_product_id`, `weight_kg` vb.

---

## 7. Altyapı, deploy ve operasyon

### 7.1 Dokploy ayarları (her iki servis)

| Ayar | Backend | Storefront |
|---|---|---|
| Build Path | `/` | `/` |
| Docker File | `Dockerfile.backend` | `Dockerfile.storefront` |
| Docker Context | `.` | `.` |
| Container port | 9000 | 3015 |
| Host port publish | **YAPMA** (Domain/Ingress kullan) | YAPMA |
| Build args (zorunlu) | `GIT_COMMIT`, `CACHE_BUST`, `BUILD_TIMESTAMP` | aynı + `MEDUSA_BACKEND_URL`, tüm `NEXT_PUBLIC_*` |
| Domain | `api.<domain>` → 9000 | `<domain>`, `www.<domain>` → 3015 |
| Deploy tetikleyici | `main` push → otomatik prod deploy (~10 dk) | aynı |

**Neden host port publish yok:** Swarm yeni task'ı kaldırırken eski container host portunu tutmaya devam eder; Dokploy "Done" der ama trafik eski image'a gider. Çözüm Traefik Ingress + `update_config.order: stop-first` (bkz. `docker-compose.dokploy-backend.yml`).

**Neden CACHE_BUST:** Dokploy aynı source layer'ı tekrar kullanabiliyor; `ARG CACHE_BUST` `COPY`'dan önce gelir ve her deploy'da değişir (commit SHA veya timestamp). `GIT_COMMIT=unknown` kalırsa hangi kodun çalıştığı doğrulanamaz.

### 7.2 Dockerfile özellikleri (aynen kopyala)

Backend (multi-stage):
1. `deps`: `npm ci --legacy-peer-deps` (BuildKit cache mount, lockfile değişmedikçe cache)
2. `prod-deps`: `npm prune --omit=dev` (ikinci `npm ci` yok → 8-11 dk tasarruf)
3. `builder`: `COPY mareen-backend/ .`, `COPY shared ./shared`, `.build-meta` yaz, `npm run build`
4. `runner`: `/server` = `.medusa/server`; `node_modules` prod-deps'ten; `src/scripts`, `data`, `medusa-config.ts`, `tsconfig.json` kopyalanır; `HEALTHCHECK` `/health`; `STOPSIGNAL SIGTERM`; Traefik label'ları

Storefront: `deps` → `builder` (`next build`, `.build-meta`) → `runner` (`.next/standalone` + `.next/static` + `public`, `PORT=3015`, `HOSTNAME=0.0.0.0`).

Entrypoint'ler `SOURCE_REVISION`, `GIT_COMMIT` ve kritik env'lerin set olup olmadığını loglar (değerleri değil).

### 7.3 Ortamlar

| Ortam | Storefront | Backend | DB |
|---|---|---|---|
| Lokal | `localhost:3015` | `localhost:9000` (+ `/app`) | docker-compose.dev: Postgres 5433, Redis 6380, Mailpit 1025/8025 |
| Staging | `IP:3016` | `IP:9001` | Ayrı Dokploy projesi, ayrı Postgres/Redis |
| Prod | `https://<domain>` | `https://api.<domain>` | Ayrı Dokploy projesi |

Kural: staging ve prod aynı VPS'te; **test komutları prod host/portunu reddeder** (`e2e/utils/env.ts`, staging-smoke). Staging'de canlı-dışı işareti `PAYTR_OID_PREFIX=STG` → Omnisend/Meta CAPI gönderimi kapanır, gerçek PayTR iade engellenir.

### 7.4 Güvenlik temelleri (Mareen'de yapılan düzeltmeler)

- `JWT_SECRET`, `COOKIE_SECRET`: `openssl rand -base64 32`, birbirinden ve staging'den farklı. Boşsa Medusa `supersecret` kullanır.
- CORS üçlüsü prod domain'leriyle; localhost bırakma.
- `COOKIE_SECURE=false` yalnızca HTTP/IP döneminde; HTTPS'e geçince sil.
- Storefront `next.config.ts` başlıkları: HSTS, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'self' https://<domain> https://www.<domain>` (PayTR iframe dönüşü için), `poweredByHeader: false`. Tam CSP yok (takip/ödeme script'leri test edilmeden açılmamalı).
- Dokploy paneli `:3000` ve doğrudan `:9000/:3015` host portları internete açık **olmamalı** (firewall / yalnızca Traefik).
- Postgres/Redis dışarı kapalı.
- Admin API yetkisiz → 401; `/store/*` publishable key'siz → 400; webhook'lar imza/token doğrular.
- Next.js'i güncel tut (Mareen'de 15.5.23 kritik RCE → 15.5.27).
- Rate-limit'ler process-içi (tek replica varsayımı). Çoklu replica'ya geçersen Redis tabanlı limiter veya Traefik middleware.

### 7.5 Yedekleme

- Tercih edilen: **Dokploy → database → Backups**, S3 destination, cron `0 3 * * *` (UTC), keep 14. Format `pg_dump` custom; restore için `pg_restore` sürümü Postgres image'ıyla uyumlu olmalı (Mareen: 17).
- S3 destination için dar yetkili ayrı IAM kullanıcısı (`<marka>-db-backup`).
- Yedek `database-backups/` prefix'i private; yalnızca `files/*` public (bucket policy).
- Alternatif/eski yöntem: `mareen-backend/scripts/backup-db.sh` + host cron (README-backup.md). Mareen'de host cron sessizce durmuştu → Dokploy yedeğine geçildi. **Restore testi yapmadan "yedek var" deme.**

### 7.6 RAM / kaynak

Medusa build (admin dahil) 2-4 GB; runtime shared mode 1-2 GB. Swap aç. OOM görürsen önce build RAM'i, sonra `MEDUSA_WORKER_MODE` ayrımı (server + worker replica).

### 7.7 Gözlemlenebilirlik

Repo'da Sentry/uptime yok (Mareen'de kabul edilmiş risk). Es Çay'da baştan ekle: en azından uptime monitörü (`/health`, `/api/build-info`) + hata izleme. Operasyonel olaylar için Mareen'in `ops_event` modülü (admin "Logs") var; bunu koru.

---

## 8. Ortam değişkenleri — tam envanter (değerler yok)

Sütun "Es Çay": **Aynen** = kopyala, **Yeni değer** = markaya göre doldur, **Yok** = sil (Geliver/DHL/Trendyol/WP), **Karar** = kargo firmasına bağlı.

### 8.1 Backend — çekirdek

| Değişken | Amaç | Es Çay |
|---|---|---|
| `DATABASE_URL` | Postgres (Dokploy iç servis adı) | Yeni değer |
| `REDIS_URL` | Redis cache + event bus + admin session | Yeni değer |
| `MEDUSA_WORKER_MODE` | `shared` / `server` / `worker` | Aynen (`shared`) |
| `JWT_SECRET`, `COOKIE_SECRET` | Random, farklı | Yeni değer |
| `COOKIE_SECURE` | Yalnızca HTTP/IP döneminde `false` | Geçici |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` | CORS origin listeleri | Yeni değer |
| `STOREFRONT_URL` | PayTR ok/fail URL, mail linkleri, Admin storefrontUrl | Yeni değer |
| `MEDUSA_BACKEND_PUBLIC_URL` | Public API URL (file-local backend_url, linkler) | Yeni değer |
| `DISABLE_MEDUSA_ADMIN` | `true` → admin build/serve kapalı | Aynen (boş) |
| `CONTACT_INBOX`, `RETURNS_INBOX` | İletişim formu / iade bildirimi alıcıları | Yeni değer |
| `UNPAID_ORDER_TIMEOUT_MINUTES` | Ödenmemiş PayTR siparişi iptal süresi (job 10 dk'da bir) | Aynen (30) |
| `AUTH_LOGIN_RATE_MAX/WINDOW_MS`, `AUTH_REGISTER_*`, `AUTH_PASSWORD_RESET_*`, `AUTH_PASSWORD_UPDATE_*`, `GUEST_RETURN_*`, `EXCHANGE_OPTIONS_RATE_*`, `ORDER_LOOKUP_*`, `PAYTR_CALLBACK_RATE_*` | Rate-limit ayarları (kodda varsayılan) | Aynen (boş) |

### 8.2 Backend — PayTR

| Değişken | Amaç | Es Çay |
|---|---|---|
| `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` | Mağaza paneli → Entegrasyon Bilgileri | Yeni değer (Es Çay'ın kendi PayTR mağazası) |
| `PAYTR_TEST_MODE` | `1` test (varsayılan), `0` canlı | Canlıda `0` |
| `PAYTR_OID_PREFIX` | Canlı-dışı işareti (staging `STG`); doluysa get-token yalnızca test modda, gerçek iade engellenir, Omnisend/CAPI kapalı. Prod'da **boş** (varsayılan önek `M`) | Staging'de `STG`, prod boş |
| `PAYTR_MOCK` | `1` → HTTP yok, mock akış (lokal/test). Prod'da tanımsız | Aynen |
| `PAYTR_USER_IP` | Lokal testte dış IP (PayTR geçerli IP ister) | Lokal |
| `PAYTR_DEBUG_ON` | get-token `debug_on` zorla | Aynen (boş) |
| `PAYTR_ALERT_INBOX` | Kritik tutarsızlık alarmı (geç success, tutar farkı) | Yeni değer |
| `PAYTR_LATE_SUCCESS_AUTO_REFUND` | `1` → iptal edilmiş siparişe geç gelen success'i otomatik iade et (varsayılan: iade yok, manual_review + alarm maili) | Aynen (boş) |

### 8.3 Backend — Havale/EFT

| Değişken | Amaç | Es Çay |
|---|---|---|
| `BANK_TRANSFER_ENABLED` | `0/1` | Yeni değer |
| `BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_ACCOUNT_NAME`, `BANK_TRANSFER_IBAN` | Checkout ve mailde gösterilen banka bilgisi; IBAN veya hesap sahibi boşsa seçenek görünmez | Yeni değer |

### 8.4 Backend — SMTP

| Değişken | Amaç | Es Çay |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Google Workspace: `smtp.gmail.com:587`, App Password, `SMTP_SECURE=false` (STARTTLS). Lokal: Mailpit `localhost:1025` | Yeni değer |

DNS tarafı: MX Google, SPF `include:_spf.google.com`, Google DKIM, DMARC. Gmail günlük gönderim limiti var (Mareen'de 19.10 limit aşımında mailler başarısız oldu → idempotent bildirim düzeltmesi).

### 8.5 Backend — Paraşüt

| Değişken | Amaç | Es Çay |
|---|---|---|
| `PARASUT_CLIENT_ID`, `PARASUT_CLIENT_SECRET`, `PARASUT_USERNAME`, `PARASUT_PASSWORD`, `PARASUT_COMPANY_ID` | OAuth2 password grant | Yeni değer |
| `PARASUT_ENV` | `test` (varsayılan) / `prod` | Canlıda `prod` |
| `PARASUT_BASE_URL` | Varsayılan `https://api.parasut.com/v4` | Aynen |
| `PARASUT_DRY_RUN` | `true` → yalnızca taslak, GİB'e gitmez | Testte `true` |
| `PARASUT_DRY_RUN_ORDER_ID` | Tek sipariş için dry-run | Test |
| `PARASUT_DEFAULT_VAT_RATE` | Ürün satırı KDV % (Mareen 10) | **Yeni değer — çay için KDV oranını mali müşavire sor** |
| `PARASUT_SHIPPING_VAT_RATE` | Kargo satırı KDV % (20) | Aynen |
| `PARASUT_PRODUCT_CREATE` | Eşleşmeyen ürünü Paraşüt'te oluştur | Aynen |
| `PARASUT_SHIPPING_PRODUCT_ID` / `PARASUT_SHIPPING_PRODUCT_CODE` | Kargo kalemi ürünü (varsayılan kod `KARGO`) | Yeni değer |
| `PARASUT_ADMIN_ALERT_EMAIL` | Fatura hatası uyarısı | Yeni değer |
| `PARASUT_INTERNET_SALE_URL` | e-Arşiv internet satış URL'i (yoksa STOREFRONT_URL) | Yeni değer |
| `PARASUT_RETRY_MAX_ATTEMPTS`, `PARASUT_RETRY_LOOKBACK_HOURS` | Retry job (8 deneme, 72 saat) | Aynen |

Kimlikler boşsa modül **mock** modda çalışır (HTTP yok) → lokal/staging güvenli.

### 8.6 Backend — Dosya / S3

| Değişken | Amaç | Es Çay |
|---|---|---|
| `S3_BUCKET` | Doluysa file-s3, boşsa file-local (`static/`) | Yeni değer |
| `S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT` | S3 / R2 / MinIO | Yeni değer |
| `S3_PREFIX` | Yükleme prefix'i (varsayılan `files/`); bucket policy yalnızca bunu public yapar; ACL kapalı | Aynen |

### 8.7 Backend — Pazarlama

| Değişken | Amaç | Es Çay |
|---|---|---|
| `OMNISEND_API_KEY` | v5 REST; boşsa kapalı | Yeni değer (Es Çay'ın Omnisend hesabı) |
| `OMNISEND_TEST_EMAILS` | Canlı-dışı ortamda yalnızca bu adreslere | Staging |
| `META_CAPI_TOKEN` | Meta Conversions API Purchase; boşsa kapalı | Yeni değer |
| `META_PIXEL_ID` | Pixel ID (CAPI için) | Yeni değer |
| `META_CAPI_TEST_EVENT_CODE` | Test event; prod'da sil | Test |

### 8.8 Backend — Kargo (Mareen'e özgü, Es Çay'da yeniden tasarlanacak)

| Grup | Değişkenler | Es Çay |
|---|---|---|
| Geliver | `GELIVER_API_TOKEN`, `GELIVER_AUTO_FULFILL`, `GELIVER_TEST_MODE`, `GELIVER_BASE_URL`, `GELIVER_SENDER_ADDRESS_ID`, `GELIVER_SENDER_NAME/EMAIL/PHONE/ADDRESS1/CITY/DISTRICT/ZIP`, `GELIVER_PROVIDER_ACCOUNT_ID`, `GELIVER_PROVIDER_SERVICE_CODE`, `GELIVER_OFFER_STRATEGY`, `GELIVER_ORDER_PREFIX`, `GELIVER_WEBHOOK_SECRET`, `GELIVER_DEFAULT_DISTRICT`, `GELIVER_CHECKOUT_FEE`, `GELIVER_FALLBACK_SHIPPING_PRICE`, `GELIVER_RETURN_LABEL_ENABLED` | Yok |
| DHL direkt | `SHIPPING_CARRIER`, `DHL_ENV`, `DHL_CLIENT_ID`, `DHL_CLIENT_SECRET`, `DHL_CUSTOMER_NUMBER`, `DHL_PASSWORD`, `DHL_BARCODE_RETRY_INTERVAL_MS`, `DHL_BARCODE_RETRY_TIMEOUT_MS`, `DHL_REFERENCE_PREFIX`, `DHL_TRACKING_URL_TEMPLATE`, `DHL_LABEL_PDF` | Yok (firma DHL seçilirse bu kod yeniden değerlendirilebilir) |
| Genel | `SHIPPING_PACKAGE_DEFAULT` (varsayılan koli JSON: kg/cm/maxHeight) | **Karar** — çay paketleri için yeni profil |
| Trendyol | `TRENDYOL_SUPPLIER_ID`, `TRENDYOL_API_KEY`, `TRENDYOL_API_SECRET`, `TRENDYOL_ENV`, `TRENDYOL_SYNC_ENABLED` | Yok |
| WP import | `WP_IMPORT_BACKEND_URL`, `WP_IMPORT_ADMIN_EMAIL`, `WP_IMPORT_ADMIN_PASSWORD`, `WP_IMPORT_ALLOW_HTTP`, `WP_IMPORT_ONLY_EMAILS`, `WP_MYSQL_DB` | Yok |

### 8.9 Backend — test / script

`STAGING_BACKEND_URL`, `STAGING_FRONTEND_URL`, `STAGING_PUBLISHABLE_KEY`, `STAGING_ADMIN_EMAIL`, `STAGING_ADMIN_PASSWORD` (staging smoke), `INTEGRATION_PRODUCT_COUNT`, `SHIPPING_PRICE_TYPE`, `SHIPPING_PRICE_TYPE_APPLY`, `BACKFILL_APPLY`, `AUDIT_DAYS`, `OMNISEND_SMOKE_*`, `BACKUP_*` (backup-db.sh).

### 8.10 Storefront

| Değişken | Build/Runtime | Amaç | Es Çay |
|---|---|---|---|
| `MEDUSA_BACKEND_URL` | Runtime | SSR/Server Action için backend (Swarm iç servis adı veya `https://api.<domain>`) | Yeni değer |
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | Build | Yedek/public API URL | Yeni değer |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Build | `pk_…` (ensure-publishable-key script'i) | Yeni değer |
| `NEXT_PUBLIC_MEDUSA_REGION_ID` | Build | **Türkiye** region id (setup-turkey çıktısı) | Yeni değer |
| `NEXT_PUBLIC_S3_FILE_URL` | Build | Görsel CDN kökü | Yeni değer |
| `NEXT_PUBLIC_OMNISEND_BRAND_ID` | Build | Omnisend snippet + site-verification meta | Yeni değer |
| `NEXT_PUBLIC_COOKIEYES_ID` | Build | CookieYes site anahtarı (kodda varsayılan Mareen'inki hardcoded → **değiştir**) | Yeni değer |
| `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_CLARITY_ID` | Build | Takip ID'leri; **Dockerfile'da ARG yok, kodda Mareen fallback'leri hardcoded** → ARG ekle, fallback'leri sil; Ads conversion label da `lib/analytics.ts`'te sabit | Yeni değer |
| `NEXT_PUBLIC_PATTERN_OF_MONTH_HANDLE` | Build | Mareen ana sayfa "ayın deseni" | Yok |
| `SITE_URL` | Runtime | Canonical/sitemap/robots; yalnızca gerçek domain indekslenir (`isIndexableSite` kodda domain hardcoded → **değiştir**) | Yeni değer |
| `ALLOW_STAGING_DIAGNOSTICS` | Runtime | `/api/staging-diag` açar; prod'da tanımsız | Staging |
| `STAGING_FRONTEND_URL`, `STAGING_BACKEND_URL`, `STAGING_PUBLISHABLE_KEY` | e2e | Playwright hedefi (prod reddedilir) | Staging |

Dokploy'da `NEXT_PUBLIC_*` hem **Environment** hem **Build-time Arguments**'a yazılır; `Dockerfile.storefront`'ta her biri için `ARG`+`ENV` satırı olmalı (yeni değişken eklerken unutma).

---

## 9. Veri kurulumu (yeni DB)

Sıra: `medusa db:migrate` (entrypoint'te otomatik; `migration-scripts/initial-data-seed.ts` **stok Medusa demo seed'ini** çalıştırır: Europe region, EUR, demo ürünler) → `cleanup-medusa-defaults` (demo ürün/kategori/kargo seçeneklerini siler; sales channel → marka adı, API key → "Storefront", stok lokasyonu → "<Marka> Depo", fulfillment set → "<Marka> Kargo", shipping profile → "Standart Profil") → `setup-turkey` = `seed-mareen` + `ensure-publishable-key`.

`seed-mareen.ts` (idempotent) yaptıkları:

| Adım | Değer (Mareen) | Es Çay |
|---|---|---|
| Store | ad, `supported_currencies: [try default]` | Ad değişir |
| Region | "Türkiye", `try`, `["tr"]`, providers `pp_system_default`, `pp_paytr_paytr`, `pp_havale_havale` | Aynen |
| Vergi | tax region `tr`, oran "KDV" **%10** default | **Çay KDV oranı** |
| Fiyat tercihi | `is_tax_inclusive: true` (currency + region) | Aynen |
| Kategoriler / koleksiyonlar | Eşarp, Şal, Omuz Şal, Giyim… / sayfiye, payitaht… | Çay kategorileri |
| Kargo | provider `geliver_geliver` stok lokasyonuna link; fulfillment set + service zone "Türkiye" (`tr`); tek seçenek "Standart Kargo" `flat` 149,99 TRY, `data:{id:"geliver-standard"}`, type `standard_tr`, rules `enabled_in_store`, `is_return=false` | provider `manual_manual` veya yeni adaptör; sabit ücret + ücretsiz eşik |
| İade sebepleri | 5 sebep, `metadata.seller_pays_shipping` | Çaya uyarla |
| Promosyon | `hosgeldin10` %10 | Karar |
| Temizlik | TR dışı region/tax/shipping silinir | Aynen |

`ensure-publishable-key.ts`: varsayılan sales channel (hardcoded id fallback → **temizle**), ilk publishable key ya da "Storefront" başlıklı yeni key, kanala bağlar, `.env.local` yazar (hardcoded Dokploy host/S3 URL içerir → **temizle**).

Diğer: `enable-bank-transfer` (`pp_havale_havale` region'a), `npx medusa user -e … -p …` (admin), `set-shipping-price-type` (flat ↔ calculated), `seed-order-status-demos` (demo siparişler, `PAYTR_MOCK=1`), `test-emails` (Mailpit), `cleanup-abandoned-orders` (hardcoded Mareen sipariş listesi → sil), `reset-admin-password`.

`src/lib/default-stock-location.ts`: "Mareen Depo" adını tercih eder → marka sabitini değiştir.

---

## 10. Test ve doğrulama katmanları

| Katman | Komut | Kapsam |
|---|---|---|
| Unit (Jest + swc) | `npm run test:unit` (`src/**/__tests__/*.unit.spec.ts`, ~47 spec) | iade kabul/red/tutar, değişim planı, etiket, sözleşme, timeline, Paraşüt eşleştirme/tutar/dry-run/mock, havale, PayTR durum, DHL, status-filter, notify idempotency, kargo bildirim zinciri |
| Integration HTTP | `npm run test:integration:http` (`medusaIntegrationTestRunner`, geçici DB; docker-compose.dev Postgres/Redis) | health, auth (verification_required, 429), catalog, cart-checkout (PayTR stub → sipariş + 6 haneli no), errors, guest-customer (doğrulama sonrası sipariş bağlama), order-lookup, returns (teslim öncesi 4xx, çift gönderim tek iade) |
| Returns suite | `npm run test:returns` (`PAYTR_MOCK=1`) | offline: PayTR iade hash/TL string/idempotency, tutar hesabı, mail builder'ları; canlı: enumeration, rate-limit, lifecycle; `MANUAL-CHECKLIST.md` |
| Smoke (medusa exec) | `test:smoke:full`, `test:contracts`, `test:bank-transfer`, `test:paytr:callback`, `test:emails`, `test:parasut:draft` | uçtan uca mock akışlar |
| Staging smoke (HTTP, tsx) | `test:staging:backend` (health, catalog, config/CORS, auth, cart, checkout, orders, order-tracking) | prod URL'yi reddeder |
| E2E (Playwright) | `npm run test:staging:e2e` (`STAGING_FRONTEND_URL` şart; prod host/3015 reddedilir; chromium + iPhone 13 projesi) | homepage, pdp-cart, account, auth-flows, checkout (3 spec), order-tracking, responsive, config, guest (journey/register/return/tracking/member-comparison); page object'ler `e2e/fixtures/page-objects/` |

Lokal mail: Mailpit (`SMTP_HOST=localhost:1025`, UI 8025). PayTR lokal: `PAYTR_MOCK=1` ya da test mode + `PAYTR_USER_IP`; callback simülasyonu `test:paytr:callback`.

---

## 11. Mareen'den öğrenilen dersler (Es Çay'da baştan doğru yap)

Bu liste `docs/CUTOVER.md`'deki 25 bölümün ve commit geçmişinin damıtılmış hâli. Her madde Mareen'de gerçekten yaşandı.

### Ödeme
1. **Sipariş ödeme öncesi oluşur** (cart.complete → iframe). Bu yüzden `cancel-unpaid-paytr-orders` job'u (10 dk, 30 dk eşiği) şart; stok rezervasyonu iptalle serbest kalır. Havale siparişlerine job dokunmaz.
2. PayTR **bildirim URL'i panelde tektir**. Eski site aynı mağazayı kullanıyorsa callback geçişi atomik yapılmalı; DNS yayılırken callback ulaşamazsa sipariş 30 dk'da iptal olur ama para çekilmiş olur (Mareen #9). Geç gelen success artık **otomatik iade etmez**, alarm maili + `manual_review`.
3. Callback'te `payment_amount` kontrolü taksitli ödemede fark yaratır (düzeltildi); hash doğrulaması zorunlu; tanınmayan `merchant_oid`'e `OK` döner (PayTR tekrar denemesin).
4. `PAYTR_TEST_MODE` tanımsız = test. Prod'a geçerken açıkça `0`.
5. Lokal testte PayTR gerçek dış IP ister (`PAYTR_USER_IP`).

### Veri / Medusa API tuzakları
6. **`query.graph`'ta `items.quantity` boş döner**; `items.detail.quantity` istenmeli. Mareen'de bu yüzden otomatik kargo hiç açılmıyor, Paraşüt her kalemi 1 adet kesiyor, Meta Purchase değeri yanlış gidiyordu. Yeni projede ilk günden bu kalıbı kullan.
7. Medusa varsayılan **Europe/EUR** region'ı fiyatları bozar; `setup-turkey` ile Türkiye/TRY + temizlik. `NEXT_PUBLIC_MEDUSA_REGION_ID` Türkiye olmalı.
8. `defineConfig`'te bir modülü (ör. fulfillment) yeniden tanımlarsan Medusa'nın varsayılan provider'ını (`manual`) **açıkça tekrar eklemelisin**; yoksa yerleşik yöntemler kırılır.
9. Medusa bildirim modülü: aynı `idempotency_key` ile daha önce **başarısız** olmuş bildirimi yeniden işlerken "Notification not found" hatası verir → `createNotificationIdempotent` (başarılı varsa gönderme, başarısız varsa `#r<n>` ekle).
10. Medusa v2 sipariş tablosunda ödeme/kargo durumu filtresi yok → dashboard dist yaması + `GET /admin/orders` middleware'i. Medusa güncellemesinde yama kırılırsa **build hata verir** (bilinçli).
11. Medusa Admin oturumu varsayılan 10 saat sabit → `sessionOptions.ttl` 12 saat + `rolling`, "Beni hatırla" 7 gün (`/auth/session` middleware).
12. Auth `verification` TTL varsayılan 15 dk → 24 saate çıkarıldı; e-posta doğrulaması müşteri için zorunlu (`authVerificationsPerActor`), misafir checkout etkilenmez.
13. Email doğrulamasız müşteri (ör. import) için "şifremi unuttum" mail göndermez (auth identity yok).

### Storefront
14. **CookieYes senkron `<head>` script'i React hidrasyonunu bozar** (#418) → banner silinir → hiçbir takip yüklenmez. `next/script` `afterInteractive` kullan. Takip script'leri kendi kodunda onaya bağlı olsun (`lib/consent.ts`).
15. Checkout'ta **ilçe serbest metin olmasın**: il → ilçe → mahalle listbox (`shared/tr-districts.ts` 973 ilçe, `public/tr-mahalle/<plaka>.json` 73k mahalle, NVİ dökümü). Kargo firması ne olursa olsun ilçe eşleşmesi gerekir.
16. Açık adres yalnızca mahalle adı olabiliyor → `isAddressLineOnlyLocation` kesin engeli + şüpheli adreste "Adresinizi kontrol edin" diyaloğu.
17. Misafir e-postası `gmail.con` gibi geçersiz domain → sunucu tarafı DNS (MX/A) kontrolü, yalnızca kesin yoklukta red.
18. Eski/İngilizce URL'ler (`/cart`, `/checkout`, `/account`, `/products`) 308 ile Türkçe'ye; mail/PayTR/Omnisend linkleri kırılmaz. `www` → apex.
19. Tüm sayfalar dinamik (`no-store`) → TTFB ~0,9 sn. Ürün/kategori sayfalarına ISR/`revalidate` planla.
20. `GET /api/cart/smoke` herkese açık teşhis ucu — prod'da kaldır/koru.
21. Fontlar Fontsource ile npm'den (Google Fonts'a build bağımlılığı yok; latin-ext şart: ş, ğ, ı).

### Deploy
22. `GIT_COMMIT`/`CACHE_BUST` boşsa hangi kodun çalıştığı bilinmez; `build-info` ile doğrula.
23. Host port publish → eski container trafiği tutar. Ingress + stop-first.
24. `shared/package.json` exports güncellenmezse backend açılmaz.
25. Yedek cron'u "kurulu sanıldı", 3 hafta çalışmamıştı. Dokploy yedeği + restore testi.
26. Prod'da `medusa exec` derlenmiş `.js` ister; çalışma dizini `/server`.
27. Git'teki eski derlenmiş `.js` kopyaları (.ts'nin yanında) `medusa develop` ve Jest'i yanıltır.

### Entegrasyon / operasyon
28. Paraşüt: KDV hariç birim fiyat 2 haneye yuvarlanınca adet × fiyat 1 kuruş sapabilir → muhasebeciyle netleştir (4 hane gönderme adayı).
29. Paraşüt ürün eşleştirmesi SKU = Paraşüt ürün kodu; eşleşmeyen ürün canlıda ilk satışta oluşturulur (`PARASUT_PRODUCT_CREATE`). Katalogda **her varyanta SKU ver**.
30. Omnisend sandbox yok → staging'de API key girme ya da `OMNISEND_TEST_EMAILS` allowlist. Pazarlama izni olmayan kişi `subscribed` gönderilmez (KVKK); checkout'ta "Teklifler için bana e-posta gönderin" varsayılan **işaretsiz**.
31. Omnisend otomasyonları (Abandoned Checkout) standart event adlarıyla tetiklenir; `started checkout` sepete geri dönüş linki (`/sepet/recover/[cartId]`) ister.
32. Meta CAPI yalnızca çerez "Pazarlama" onayı olan siparişlerde ve yalnızca prod'da.
33. Gmail SMTP günlük limit → toplu mail (iade kodu vb.) günlerinde takılabilir; idempotent bildirim + yeniden gönderim butonu.
34. Kargo: **ağırlık/desi ürün başına gerçekçi olmalı** (Mareen 0,2 kg × adet, 30×20×10 cm = 2 desi). Yanlış profil → müşteriye düşük kargo, firmadan desi farkı faturası. Çay için gramaj bazlı ağırlık varyant metadata'sından gelsin.
35. Harici kargo aracısı (Geliver) ile firma (DHL) arasındaki uyumsuzluklar (barkod formatı, varış şubesi gecikmesi, 7 günde otomatik iptal, status bildirmeme, 5xx'te çoklu kayıt) haftalarca operasyon yedi. **Es Çay'da kargo firmasıyla doğrudan ve resmi API ile çalış; aracıdan kaçın; yoksa manuel takip numarası girişi + müşteri maili akışı yeterli bir başlangıçtır.**
36. Her olayı `ops_event`'e yaz (ödeme, iptal, kargo, havale onayı, iade). Admin "Logs" operasyon sorularının %80'ini cevapladı.
37. Yasal sözleşme metni tek kaynak (`shared/legal-contracts.ts`), siparişte PDF snapshot (S3 private), `CONTRACT_TEXT_VERSION`. Hukukçu onayı tarihini kaydet.
38. KDV: fiyatlar KDV dahil; region tax rate ile Paraşüt KDV oranı tutarlı olmalı.

---

## 12. Es Çay uyarlama planı (adım adım)

### Aşama 0 — Kararlar (kodlamadan önce)
- Domain: `escay.com.tr`? API: `api.escay.com.tr`. Marka adı, logo, renk/font.
- Şirket künyesi (ünvan, adres, telefon, KVKK e-postası, MERSİS/vergi no) → `COMPANY` sabitleri, sözleşme metni.
- **KDV oranı**: çay için ürün KDV'si (mali müşavir teyidi; Mareen %10 tekstil). Region tax + `PARASUT_DEFAULT_VAT_RATE` + Paraşüt ürün kartları.
- Kargo firması ve çalışma modeli (API var mı? sadece panel mi? sabit ücret mi, desi mi? ücretsiz kargo eşiği?).
- Ödeme: PayTR (ayrı mağaza hesabı) + Havale açık mı? Taksit?
- İade politikası: gıda ürününde cayma hakkı istisnaları (ambalajı açılmış ürün) → hukukçu; iade/değişim akışı gerekli mi, ne kadarı?
- Varyant modeli: gramaj (100 g / 250 g / 500 g / 1 kg), paket tipi, aroma. Beden/renk yok → storefront varyant seçici ve etiketlerdeki "Renk/Beden" ifadeleri değişir.
- Pazarlama: Omnisend, GA4, Ads, Pixel, Clarity, CookieYes hesapları Es Çay adına açılır.

### Aşama 1 — Repo'yu klonla ve budama
1. Yeni repo: `escay/` monorepo; `mareen-backend` → `apps/backend`, `mareen-storefront` → `apps/frontend`, `@mareen/shared` → `@escay/shared` (tsconfig paths, jest mapper, Dockerfile `ln -sfn`, `shared/package.json` name, tüm import'lar).
2. **Sil (WordPress legacy):** `src/modules/wp-legacy`, `src/modules/auth-wp-emailpass` (yerine Medusa'nın standart `@medusajs/medusa/auth-emailpass`; medusa-config'teki auth bloğunda provider'ı değiştir, verification TTL ayarını koru), `src/lib/wp-*.ts`, `src/api/admin/wp-orders/**`, `src/api/admin/wp-import/**`, `src/api/store/customers/me/wp-orders`, `src/admin/routes/wp-orders`, `src/admin/components/wp-*.tsx`, `src/subscribers/merge-wordpress-customer.ts`, `scripts/wp-*.{mjs,py}`, `scripts/wc-*.py`, `data/*.json` (catalog, rename-map, wp-map, image-manifest, palimpsest), `src/scripts/*wp*`, `*palimpsest*`, `import-woocommerce-catalog`, `link-s3-images`, `fix-wp-thumbnails`, storefront `lib/wp-redirects.json`, `app/wp-content/**` (feed route'u generic bir `/feed/google.xml`'e taşı), `hesabim/LegacyOrders.tsx`, `lib/collections/palimpsest.ts`, `lib/variant-images.*`.
3. **Sil (Trendyol):** `src/modules/trendyol`, `src/lib/trendyol-*.ts`, `src/jobs/trendyol-*.ts`, `src/subscribers/trendyol-*.ts`, `src/api/admin/trendyol/**`, `src/admin/routes/trendyol/**`, `src/admin/widgets/trendyol-product-widget.tsx`, medusa-config modül kaydı, nav-badge sayaçları, `tr.json` çevirileri.
4. **Kargo katmanını soyutla (Aşama 3'e bak):** `src/modules/geliver`, `src/lib/dhl`, `src/lib/geliver-*.ts`, `src/lib/manual-dhl-shipment.ts`, `src/subscribers/payment-captured-geliver.ts`, `src/jobs/dhl-track-shipments.ts`, `src/api/geliver/webhook`, `src/api/admin/dhl/**`, `src/api/admin/orders/[id]/geliver/**`, `src/api/admin/orders/[id]/dhl-manual`, `src/api/admin/returns/[id]/{geliver-code,dhl-code}` → yerine `src/modules/<carrier>` (veya yalnızca manual) + generic orkestrasyon.
5. Migration'ları temizle: silinen modüllerin `migrations/` klasörleri gidince yeni DB'de tablo oluşmaz; link tanımları (`src/links/`) boş.
6. Grep ile kalan marka izlerini bul: `mareen`, `Mareen`, `MRN-`, `venime`, `shop@mareen`, `mareen.com.tr`, `_mareen_` (çerez adları → `_escay_`), `mareen-loading` (CSS sınıfı), `mareen-lang` (localStorage).

### Aşama 2 — Marka ve içerik değişimi
- `mareen-storefront/src/lib/company.ts`, `mareen-backend/src/emails/company.ts`, `shared/legal-contracts.ts` (`CONTRACT_SELLER`, metin), `lib/site.ts` (`siteUrl` varsayılanı + `isIndexableSite` domain listesi), `lib/consent.ts` (`COOKIEYES_SITE_ID` varsayılanı), `app/layout.tsx` (title/description/ikonlar), `next.config.ts` (`frame-ancestors` domain, canonical host, legacy redirect listesi), `public/` (logo, favicon, email görselleri, media), `src/admin/i18n/json/tr.json` (marka geçen çeviriler), `src/lib/label-logos.ts` ve `data/fonts` (etiket PDF logosu/fontu), e-posta şablonlarındaki başlık/imza, `GELIVER_ORDER_PREFIX`/`DHL_REFERENCE_PREFIX` eşdeğeri sipariş no öneki (`shared/order-number.ts` `ORDER_NUMBER_BASE` 100000 kalabilir).
- Storefront tasarımı: Mareen'in editoryal şal sitesi bileşenleri (`CollectionBannerSlider`, `HomeCollectionStory`, `PatternFeature`, `ProductAudioStory`, `InstagramFeed`, `CategoryProductGrid` `EDITORIAL_POOLS`, `spec-labels.ts` kumaş/ölçü etiketleri) içerik olarak Mareen'e özgü. Mimariyi (layout, header/footer, sepet, checkout, hesap, sipariş, iade, yasal, arama, kategori) koru; ana sayfa ve PDP içerik bloklarını çay için yeniden yaz (demleme süresi, gramaj, menşei, aroma profili gibi `spec-labels`).
- Yasal sayfalar: mesafeli satış, ön bilgilendirme, iade, KVKK, çerez → Es Çay hukuk metni; `LEGAL_UPDATED_AT`.

### Aşama 3 — Kargo katmanı (firma belli olunca)
Seçenek A — **Firma API'si var (önerilen):** `src/modules/<carrier>/` Medusa fulfillment provider (§4.13'teki minimal adaptör arayüzü) + `auto-fulfill-order` orkestrasyonu + durum webhook'u ya da polling job'u. Mareen'in `payment.captured → fulfillment → shipment.created mail → delivery.created mail` zincirini, `ops_event` kayıtlarını ve admin "Sipariş durumu" widget'ını aynen kullan.
Seçenek B — **API yok / başlangıç:** yalnızca Medusa `manual` provider. Admin'den "Kargoya ver (takip no)" / "Teslim edildi" butonları (`mareen-status` route'u zaten var) → aynı mailler. Etiket: `order-packing-label.ts` 10×15 sipariş fişi + firmanın kendi etiketi. Sonradan A'ya geçiş, orkestrasyon değişmeden adaptör ekleyerek yapılır.
Her iki durumda: `setup-turkey` script'inde shipping option provider'ı `manual_manual` (veya yeni `<carrier>_<carrier>`), `price_type` flat (sabit ücret) + ücretsiz kargo eşiği (Medusa shipping option rules ile).

### Aşama 4 — Çaya özgü uyarlamalar
- Ürün/varyant: gramaj varyantları, `metadata.weight_kg` zorunlu (kargo profili), SKU zorunlu (Paraşüt), `manage_inventory: true`.
- KDV: region tax rate + Paraşüt.
- Etiket/fiş: "Renk/Beden" yerine "Gramaj/Paket".
- Son kullanma / parti no gerekiyorsa ürün metadata + fiş.
- İade: gıda istisnaları; `OrderReturnRequest` seçenekleri ve "değişim" akışı gerekli mi?
- Ücretsiz kargo eşiği, çoklu paket (ağır siparişlerde koli bölme) kararı.

### Aşama 5 — Kurulum sırası (yeni ortam)
1. Dokploy projeleri (staging + prod): Postgres, Redis, backend, storefront; domain + SSL; build args.
2. Backend env (8.1–8.7) test modlarıyla; `npm run setup:turkey:prod`; `ensure:publishable-key:prod`; admin user (`npx medusa user -e … -p …`); `enable:bank-transfer:prod` (havale açılacaksa).
3. Storefront env + rebuild (`NEXT_PUBLIC_MEDUSA_REGION_ID` setup çıktısından).
4. S3 bucket + policy (`files/*` public), Dokploy DB backup + restore testi.
5. Katalog girişi (Admin veya CSV import script'i yaz), görseller S3.
6. Paraşüt: ürün eşleştirme (SKU), kargo ürünü, dry-run taslak testi.
7. PayTR: test modda iframe; callback URL panelde `https://api.<domain>/paytr/callback`; canlı küçük sipariş + iade.
8. SMTP: test mailleri (verify, order, password reset, havale, kargo).
9. CookieYes/GA4/Ads/Pixel/Clarity/Omnisend: onay akışı testi (gizli pencere: banner → kabul → script'ler yükleniyor; reddet → yüklenmiyor).
10. Staging: `test:unit`, `test:integration:http`, `test:staging:backend`, `test:staging:e2e`.
11. Uptime + hata izleme.

---

## 13. Açık kararlar (Es Çay için cevaplanacak)

| # | Soru | Etkilediği yer |
|---|---|---|
| K1 | Kargo firması ve API durumu | §4.13, §12 Aşama 3, env 8.8, koli profili |
| K2 | Çay KDV oranı (mali müşavir) | setup-turkey tax rate, `PARASUT_DEFAULT_VAT_RATE`, fiyatlandırma |
| K3 | Havale/EFT açık mı, banka bilgileri | `BANK_TRANSFER_*`, checkout |
| K4 | Ücretsiz kargo eşiği / sabit ücret | shipping option rules, sepet UI |
| K5 | İade/değişim kapsamı (gıda istisnası) | returns API, storefront iade formu, yasal metin |
| K6 | Varyant modeli (gramaj/aroma) | katalog, etiket, spec-labels, Paraşüt eşleştirme |
| K7 | Omnisend/Meta/GA4 hesapları | env 8.7, 8.10, consent |
| K8 | Domain ve e-posta (Google Workspace) | CORS, SMTP, DNS SPF/DKIM/DMARC |
| K9 | Çoklu dil gerekli mi (Mareen'de yalnızca TR; `useLang`/`i18n-home` iskeleti var) | storefront |
| K10 | Hata izleme / uptime aracı | §7.7 |

