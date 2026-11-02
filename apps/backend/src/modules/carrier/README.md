# Kargo katmanı (`src/modules/carrier`)

Blueprint §4.13 — önceki projenin firmaya özel kodundan türetilmiş, firma bağımsız katman.
Mareen'den çıkan dersler ve her birinin Es Çay'daki durumu: `docs/KARGO-DERSLERI.md`.

```
payment.captured
  └─ subscribers/payment-captured-fulfillment.ts → lib/auto-fulfill-order.ts
        └─ createOrderFulfillmentWorkflow → provider.createFulfillment
              ├─ SHIPPING_CARRIER boş  → shipping option provider = manual_manual (Medusa yerleşik)
              ├─ SHIPPING_CARRIER=<kod> → carrier_carrier (service.ts) → adapters/<kod>.ts createShipment()
              └─ metadata.escay_external_shipment → firmaya gitmez, verilen kimlik yazılır (dış gönderi)
Durum güncellemesi (webhook: api/carrier/webhook · polling: jobs/track-shipments.ts, 30 dk)
  └─ lib/carrier-actions.ts applyCarrierAction("shipped" | "delivered" | …)   ← idempotent
        → createOrderShipmentWorkflow / markOrderFulfillmentAsDelivered → kargo mailleri (bir kez)
Günlük denetim (jobs/shipment-audit.ts, 07:00, salt okunur) → ops_event (admin Logs)
Elle: POST /admin/orders/:id/escay-status { prepare | ship(tracking) | deliver }
Kurtarma: /admin/orders/:id/fulfillment/{retry,reship,attach} · /admin/escay-shipments/reconcile
```

## Sözleşme (K1 firması ne olursa olsun)

Beş işlem: **gönderi aç, iptal et, durum sorgula, etiket al, iade kodu üret**. Her biri idempotent;
her çağrının firma kimliği (`shipment_ref`) siparişin fulfillment `data`'sına yazılır; webhook
olmadan da yoklama ile çalışır. Ayrıntı: `types.ts` → `CarrierAdapter` kuralları.

- Yazma istekleri (createShipment, createReturn) **yeniden denenmez**; okuma ve iptal denenebilir.
- Çok adımlı akış ara adımda çökerse adaptör firmadaki yarım kaydı iptal eder; edemiyorsa
  `CarrierError({ shipmentRef })` fırlatır → kimlik log'a düşer, admin "Dış gönderiyi bağla" ile kullanır.
- Hatalar `CarrierError` (kod + mesaj + istek bağlamı); `carrierErrorText` tek satırda okunur yapar.
- Takip numarasının varlığı "kargoya verildi" **sayılmaz**; `shipped` yalnız firmanın "alındı"
  olayı ya da admin onayıyla.
- Webhook eşleşmesi: sipariş referansı → etiket tablosu (takip no) → açık kayıtların sayfalı taraması
  (`lib/shipping/open-fulfillments.ts`). "Son N kayıt" sınırı yok.

## Normalize `fulfillment.data`

`carrier`, `carrier_name`, `tracking_number`, `tracking_url`, `label_url` | `label_zpl`,
`shipment_ref`, `order_reference`, `barcode`, `status_code`, `status`, `status_at`, `test_mode`, `updated_at`
(+ dış gönderide `attached_externally`, `attached_at`, `attached_by`).
Okuyucular: `lib/shipping-status-email.ts`, `lib/carrier-actions.ts`, `lib/order-packing-label.ts`,
admin widget'ları, `shared/order-timeline.ts`, storefront `OrderDetail.tsx`.

## Operasyon araçları (adaptörsüz de çalışır)

| Araç | Ne yapar |
|---|---|
| `jobs/shipment-audit.ts` · `npm run audit:shipments` | Ödendi/kargo yok, N gündür kargoya verilmemiş etiket, geciken teslim, iptal siparişte açık gönderi, aynı gönderi iki kayıtta, adaptör `healthCheck` (bakiye/yetki) → Logs |
| Sipariş sayfası → "Dış gönderi · Siparişe bağla" | Şubede elle açılmış gönderinin kimliğini kayda yazar (firmaya yeni kayıt açmaz), isteğe bağlı "kargoya verildi" |
| Admin → "Kargo uzlaştırma" | Firma raporu satırları (`ESC-65;TAKIP;teslim`) → kuru çalışma → uygula (bağla / kargoya verildi / teslim; idempotent) |
| `npm run smoke:carrier` | Canlı/sandbox anahtarla tek paket: healthCheck → aç → durum → etiket → iptal. Cutover'dan günler önce; `SMOKE_CARRIER_KEEP=1` ile şube testi için açık bırakır |

## Yeni firma eklemek

1. `adapters/<kod>.ts` → `CarrierAdapter` (types.ts) uygula. `createShipment` sipariş başına sabit
   `order.reference` gönderir ve POST'u körlemesine retry etmez; gövdeyi şemayla doğrular (adet number);
   `cancelShipment` throw etmez; `cancelShipmentStrict` reddedilirse throw eder (reship bunu ister).
   Mümkünse `getStatus`, `getLabel` (firmanın **resmi** etiketi), `healthCheck`, `createReturn`.
2. `adapters/index.ts` içinde `registerCarrierAdapter(adapter)`.
3. Env: `SHIPPING_CARRIER=<kod>`, `SHIPPING_CARRIER_TEST_MODE`, firma kimlikleri, `CARRIER_WEBHOOK_SECRET`
   (**her ortam için ayrı** webhook kaydı ve sır).
4. Seed: `npm run setup:turkey` shipping option provider'ını `carrier_carrier` yapar (env'e göre);
   `set-shipping-price-type` ile `calculated` yapılmışsa seed bunu korur.
5. Webhook varsa firma paneline `https://api.<domain>/carrier/webhook?token=<CARRIER_WEBHOOK_SECRET>`;
   webhook yalnız hızlandırıcıdır, `getStatus` yoklaması (30 dk) asıl kaynak.
6. Koli profili: `SHIPPING_PACKAGE_DEFAULT` + varyant `metadata.weight_kg` (çay gramajı); ilk etikette
   desi kontrolü.
7. Canlıya geçişten önce: `npm run smoke:carrier` (canlı anahtar, `SMOKE_CARRIER_LIVE=1`), tek paketle
   şube kabul testi (`SMOKE_CARRIER_KEEP=1` → etiket PDF'i), ilk gerçek siparişte Logs takibi.
