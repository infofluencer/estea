# Es Çay — Açık kararlar ve seçilen geçici değerler

Blueprint §13'teki kararların durumu. "Geçici değer" sütunu kodda şu an ne olduğunu söyler;
karar verilince ilgili dosyalar güncellenir. Son güncelleme: 2026-10-22.

| # | Karar | Geçici değer (kodda) | Nerede değişir |
|---|---|---|---|
| K1 | Kargo firması ve API durumu | **Elle kargo** (`SHIPPING_CARRIER` boş → `manual_manual`; admin "Kargoya ver (takip no)" → mailler). Adaptör sözleşmesi hazır. | `escay-backend/src/modules/carrier/README.md`, `.env.template` (SHIPPING_*), `emails/company.ts` (`returnCarrierName`, `returnCustomerNumber`), koli profili `SHIPPING_PACKAGE_DEFAULT` |
| K2 | Çay KDV oranı | `KDV_RATE=1` (%1, gıda listesi varsayımı — **mali müşavir teyidi şart**) | `.env.template` (KDV_RATE, PARASUT_DEFAULT_VAT_RATE), storefront `NEXT_PUBLIC_VAT_RATE`, seed region tax rate |
| K3 | Havale/EFT açık mı, banka bilgileri | Kapalı (`BANK_TRANSFER_ENABLED=0`) | `.env.template` BANK_TRANSFER_* → `npm run enable:bank-transfer:prod` |
| K4 | Sabit kargo ücreti / ücretsiz eşik | 149,90 TL sabit, eşik yok (`FREE_SHIPPING_THRESHOLD=0`) | `.env.template` SHIPPING_FLAT_PRICE / FREE_SHIPPING_THRESHOLD → `npm run seed` iki seçeneği kurallarla kurar |
| K5 | İade/değişim kapsamı (gıda istisnası) | Mareen RMA akışı korunuyor; iade sebepleri çaya uyarlandı (`wrong_variant`, "ambalajı açılmamış"); yasal metin **taslak**, hukukçu onayı yok | `shared/legal-contracts.ts` (CONTRACT_TEXT_VERSION `-draft`), seed RETURN_REASONS, storefront iade politikası sayfası |
| K6 | Varyant modeli (gramaj/aroma) | Kategoriler: siyah-cay, yesil-cay, bitki-cayi, harmanlar, hediye; etiket/fiş seçenek adını olduğu gibi basar (Gramaj/Paket) | seed kategorileri, storefront `spec-labels.ts`, Paraşüt SKU eşleştirmesi (her varyanta SKU) |
| K7 | Omnisend/Meta/GA4/Ads/Pixel/Clarity/CookieYes hesapları | Hepsi env ile; kodda **hiç** sabit ID yok (boşsa kapalı) | `.env.template` (backend 8.7, storefront NEXT_PUBLIC_*), `Dockerfile.storefront` ARG'ları |
| K8 | Domain ve e-posta | Storefront `market.esteacay.com`, API `api.esteacay.com`, kurumsal `esteacay.com` (landing'den); e-posta `info@esteacay.com` **yer tutucu** | storefront `lib/site.ts`/`company.ts`/`next.config.ts`, backend `emails/company.ts`, `shared/legal-contracts.ts`, `.env.template` CORS/SMTP |
| K9 | Çoklu dil | Yok — yalnız TR (i18n iskeleti kaldırıldı) | — |
| K10 | Hata izleme / uptime | Yok (Mareen'deki gibi); kurulumda `/health` + `/api/build-info` uptime monitörü eklenmeli | §7.7 |

## Şirket künyesi (landing `content.ts`'ten)

Hamzalı Çay Gıda Tur. ve İnş. A.Ş. · Balaban Mah. Uğurlu Cad. No: 9, Merkez, Hayrat / Trabzon · 0462 692 30 61 ·
Instagram/Facebook `esteacay`. MERSİS / vergi no / KVKK sorumlusu bilgisi yok → yasal sayfalar TODO.
