# Es Çay

İki bağımsız Next.js uygulamasından oluşan npm workspaces monorepo.

```
apps/
  landing/   Tanıtım sitesi (port 3020)
  shop/      E-ticaret sitesi + Node.js API (port 3021)
packages/
  ui/        Ortak tema (Tailwind token'ları) ve fontlar
```

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
