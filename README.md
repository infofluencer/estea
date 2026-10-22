# Es Çay

Tanıtım sitesi (npm workspaces) + Mareen altyapısından türetilen e-ticaret sistemi (Medusa v2 + Next.js 15).
Teknik kılavuz: [ES-CAY-BLUEPRINT.md](ES-CAY-BLUEPRINT.md) · kararlar: [docs/ESCAY-KARARLAR.md](docs/ESCAY-KARARLAR.md) · durum: [docs/UYARLAMA-DURUMU.md](docs/UYARLAMA-DURUMU.md)

```
apps/
  landing/           Tanıtım sitesi (Next 16, port 3020, output: standalone) — workspace
  shop/              Eski basit mağaza prototipi (port 3021) — escay-storefront ile değiştirilecek
packages/
  ui/                Ortak tema (Tailwind token'ları) ve fontlar — workspace
shared/              @escay/shared — backend + storefront ortak TS (adres, sipariş no, zaman çizelgesi, sözleşme)
escay-backend/       Medusa v2.18 backend + Admin (port 9000) — bağımsız npm projesi (--legacy-peer-deps)
escay-storefront/    Next.js 15 storefront (port 3015) — bağımsız npm projesi
Dockerfile.backend / Dockerfile.storefront / Dockerfile.landing   Dokploy (Build Path: /), env'ler: docs/DOKPLOY-ENV.md
docker-compose.dev.yml                        Lokal Postgres 5433 / Redis 6380 / Mailpit 8025
```

## E-ticaret (escay-backend + escay-storefront)

```bash
docker compose -f docker-compose.dev.yml up -d
(cd escay-backend && cp .env.template .env && npm install --legacy-peer-deps && npm run dev)
(cd escay-backend && npm run setup:turkey && npx medusa user -e admin@example.com -p sifre)
(cd escay-storefront && cp .env.template .env.local && npm install && npm run dev)
```

`shared/` her iki tarafa kopyalanmaz: backend build'de `scripts/sync-shared.mjs` + `link-shared-module.mjs`,
storefront `experimental.externalDir` ile `../shared`. Yeni shared dosyası → `shared/package.json` exports (§2.1).

## Komutlar

```bash
npm install
npm run dev            # iki uygulamayı birlikte başlatır
npm run dev:landing    # yalnızca landing
npm run dev:shop       # yalnızca shop
npm run build          # ikisini de derler
npm run lint && npm run typecheck
```

## Ortam değişkenleri

Her uygulamanın kendi `.env.example` dosyası var; `.env.local` olarak kopyalayın.

| Uygulama | Değişken | Açıklama |
| --- | --- | --- |
| landing | `NEXT_PUBLIC_SHOP_URL` | "Çaylarımız" linklerinin gideceği mağaza adresi |
| shop | `NEXT_PUBLIC_SITE_URL` | Mağazanın kendi adresi (Open Graph) |
| shop | `NEXT_PUBLIC_LANDING_URL` | Logo / "Ana Sayfa" linkleri |

## Shop yapısı

```
src/
  app/                 Sayfalar ve API route'ları (/urunler, /api/products, /api/bag)
  components/          UI bileşenleri (layout/, product/)
  features/bag/        Sepet & favori: istemci context'i + API istemcisi
  server/              Yalnızca sunucuda çalışan kod
    catalog/           Ürün verisi ve repository (DB'ye geçişte değişecek tek yer)
    bag/               Cookie tabanlı sepet deposu ve iş kuralları
  lib/                 Biçimlendirme, URL ve HTTP yardımcıları
  types/               Paylaşılan tipler
```

### API

| Metot | Yol | Gövde |
| --- | --- | --- |
| GET | `/api/products` | — |
| GET | `/api/products/:id` | — |
| GET | `/api/bag` | — |
| POST | `/api/bag/cart` | `{ productId, quantity? }` |
| POST | `/api/bag/favorites` | `{ productId }` (aç/kapa) |

## Deploy (Nixpacks)

Her uygulama ayrı servis olarak deploy edilir. Servise `NIXPACKS_CONFIG_FILE` ortam değişkenini verin:

- Landing: `nixpacks.landing.toml`
- Shop: `nixpacks.shop.toml`

Değişken verilmezse Nixpacks kökteki `npm run build` (iki uygulama) ve `npm start` komutlarını kullanır. `npm start` varsayılan olarak landing'i başlatır; shop servisi için `APP=shop` ortam değişkenini verin. Yine de doğru yol `NIXPACKS_CONFIG_FILE`'dır: Node 22 ve yalnızca ilgili uygulamanın build'i onunla gelir.
