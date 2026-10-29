# Es Çay

Tanıtım sitesi (npm workspaces) + e-ticaret sistemi (Medusa v2 + Next.js 15).
Teknik kılavuz: [ES-CAY-BLUEPRINT.md](ES-CAY-BLUEPRINT.md) · kararlar: [docs/ESCAY-KARARLAR.md](docs/ESCAY-KARARLAR.md) · durum: [docs/UYARLAMA-DURUMU.md](docs/UYARLAMA-DURUMU.md)

```
apps/
  landing/     Tanıtım sitesi (Next 16, port 3020, output: standalone) — npm workspace
  frontend/    Mağaza storefront (Next 15, port 3025) — bağımsız npm projesi, workspace DIŞI
  backend/     Medusa v2.18 backend + Admin (port 9000) — bağımsız npm projesi (--legacy-peer-deps), workspace DIŞI
packages/
  ui/          Landing teması (Tailwind token'ları) ve fontlar — workspace
shared/        @escay/shared — backend + frontend ortak TS (adres, sipariş no, zaman çizelgesi, sözleşme)
assets/        Ham medya ve briefler (fotoğraf klasörleri ve video git dışı)
docs/          Kararlar, durum, Dokploy env'leri
Dockerfile.backend / Dockerfile.storefront / Dockerfile.landing   Dokploy (Build Path: /), env'ler: docs/DOKPLOY-ENV.md
docker-compose.dev.yml                        Lokal Postgres 5433 / Redis 6380 / Mailpit 8025
```

## E-ticaret (apps/backend + apps/frontend)

```bash
docker compose -f docker-compose.dev.yml up -d
(cd apps/backend && cp .env.template .env && npm install --legacy-peer-deps && npm run dev)
(cd apps/backend && npm run setup:turkey && npx medusa user -e admin@example.com -p sifre)
(cd apps/frontend && cp .env.template .env.local && npm install && npm run dev)
```

`shared/` her iki tarafa kopyalanmaz: backend build'de `scripts/sync-shared.mjs` + `link-shared-module.mjs`,
frontend `experimental.externalDir` ile `../../shared`. Yeni shared dosyası → `shared/package.json` exports (§2.1).

## Komutlar (kök)

```bash
npm install                 # yalnız landing + packages/ui (workspace)
npm run dev:landing         # landing (3020)
npm run dev:frontend        # mağaza (3025) — önce apps/frontend içinde npm install
npm run dev:backend         # Medusa (9000) — önce apps/backend içinde npm install --legacy-peer-deps
npm run dev                 # üçü birlikte
npm run typecheck && npm run lint
```

## Ortam değişkenleri

| Uygulama | Dosya | Not |
| --- | --- | --- |
| landing | `apps/landing/.env.example` → `.env.local` | `NEXT_PUBLIC_SHOP_URL` mağaza adresi |
| frontend | `apps/frontend/.env.template` → `.env.local` | Medusa adresi, publishable key, region |
| backend | `apps/backend/.env.template` → `.env` | DB, Redis, PayTR, SMTP, Paraşüt, kargo |
