# Blueprint uyarlama durumu (§12)

| Aşama | Durum | Not |
|---|---|---|
| 0 — Kararlar | Açık | `docs/ESCAY-KARARLAR.md` |
| 1 — Klonla ve buda | **Yapıldı** | `shared/`, `escay-backend/`, `escay-storefront/`; WP, Trendyol, palimpsest, Geliver/DHL kaldırıldı; `@escay/shared`; cookie/olay/metadata adları `escay_*` |
| 2 — Marka ve içerik | Kısmen | Künye, logo, palet/font token'ları, mail şablonları, ana sayfa iskeleti, kategori yer tutucuları yapıldı. Yasal metinler, hakkımızda/SSS kopyası ve ürün içerikleri **taslak** |
| 3 — Kargo katmanı | Sözleşme hazır, adaptör yok | `src/modules/carrier` (provider + registry + webhook + polling job); K1 verilince `adapters/<kod>.ts` |
| 4 — Çaya özgü | Kısmen | Seed kategorileri/iade sebepleri, koli profili, etiket "Gramaj/Paket", storefront spec etiketleri; KDV env (K2) |
| 5 — Kurulum | Yapılmadı | Dokploy/S3/PayTR/Paraşüt/SMTP hesapları ve env'ler |

## Mareen'e göre bilinçli farklar

- `shipment-audit` (Geliver/DHL denetim kuralları) ve `audit-order-shipments` script'i kaldırıldı; firma seçilince adaptöre göre yeniden yazılır.
- WP arşiv raporları (sales-stats `wp`/`trendyol` kanalları, Değişimler sayfasındaki WP kayıtları) yok — tek kanal.
- `GET /store/custom` ve `/health/revision` yanıtlarındaki `geliverEmailResolver` alanı kaldırıldı.
- İade kodu metadata'sı `return_code*` (eski `dhl_return_code*`); fulfillment verisi normalize anahtarlar (`carrier`, `tracking_number`, …).
- Admin uçları: `/admin/orders/:id/escay-status`, `/admin/orders/:id/fulfillment{,/retry,/reship}`, `/admin/returns/:id/return-code`, `/admin/escay-labels/*`, `/admin/escay-returns`, `/admin/escay-exchanges`, `/admin/escay-nav-counts`.
- Ödeme sonrası otomatik fulfillment yalnız adaptör varken (ya da `SHIPPING_AUTO_FULFILL=true`); elle kargoda kayıt "Hazırlandı/Kargoya ver" ile açılır.
