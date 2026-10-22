# escay-backend

Es Çay e-ticaret backend'i — Medusa v2.18 (Mareen altyapısından türetildi; bkz. kök `ES-CAY-BLUEPRINT.md`).

- Ödeme: PayTR iFrame (`src/modules/paytr`) + Havale/EFT (`src/modules/bank-transfer`)
- Fatura: Paraşüt e-Arşiv/e-Fatura (`src/modules/parasut`, kimlik yoksa mock)
- Kargo: generic adaptör katmanı (`src/modules/carrier/README.md`); firma seçilene kadar elle kargo
- E-posta: SMTP (`src/modules/smtp-notification`), idempotent bildirimler (`src/lib/notify.ts`)
- Operasyon: `ops_event` (admin "Logs"), iade/değişim akışı, etiket PDF'leri, sipariş zaman çizelgesi

## Lokal

```bash
docker compose -f ../docker-compose.dev.yml up -d      # Postgres 5433, Redis 6380, Mailpit 8025
cp .env.template .env                                   # değerleri doldur
npm install --legacy-peer-deps
npm run dev                                             # :9000, admin :9000/app
npm run setup:turkey                                    # store/region/KDV/kargo/iade sebepleri + publishable key
npx medusa user -e admin@example.com -p <şifre>
```

## Test

```bash
npm run test:unit
npm run test:integration:http      # docker-compose.dev Postgres/Redis gerekir
npm run test:smoke:full            # PAYTR_MOCK=1 uçtan uca
```

Env envanteri: `.env.template` ve blueprint §8. Deploy: kök `Dockerfile.backend` (Build Path `/`).
