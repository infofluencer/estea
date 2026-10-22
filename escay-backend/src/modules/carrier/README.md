# Kargo katmanı (`src/modules/carrier`)

Blueprint §4.13 — önceki projenin firmaya özel kodundan türetilmiş, firma bağımsız katman.

```
payment.captured
  └─ subscribers/payment-captured-fulfillment.ts → lib/auto-fulfill-order.ts
        └─ createOrderFulfillmentWorkflow → provider.createFulfillment
              ├─ SHIPPING_CARRIER boş  → shipping option provider = manual_manual (Medusa yerleşik)
              └─ SHIPPING_CARRIER=<kod> → carrier_carrier (service.ts) → adapters/<kod>.ts createShipment()
Durum güncellemesi (webhook: api/carrier/webhook · polling: jobs/track-shipments.ts)
  └─ lib/carrier-actions.ts applyCarrierAction("shipped" | "delivered" | …)
        → createOrderShipmentWorkflow / markOrderFulfillmentAsDelivered → kargo mailleri (bir kez)
Elle: POST /admin/orders/:id/escay-status { prepare | ship(tracking) | deliver }
```

## Normalize `fulfillment.data`

`carrier`, `carrier_name`, `tracking_number`, `tracking_url`, `label_url` | `label_zpl`,
`shipment_ref`, `order_reference`, `barcode`, `status_code`, `status`, `status_at`, `test_mode`, `updated_at`.
Okuyucular: `lib/shipping-status-email.ts`, `lib/carrier-actions.ts`, `lib/order-packing-label.ts`,
admin widget'ları, `shared/order-timeline.ts`, storefront `OrderDetail.tsx`.

## Yeni firma eklemek

1. `adapters/<kod>.ts` → `CarrierAdapter` (types.ts) uygula. `createShipment` sipariş başına sabit
   `order.reference` gönderir ve POST'u körlemesine retry etmez; `cancelShipment` throw etmez;
   `cancelShipmentStrict` reddedilirse throw eder (reship bunu ister).
2. `adapters/index.ts` içinde `registerCarrierAdapter(adapter)`.
3. Env: `SHIPPING_CARRIER=<kod>`, `SHIPPING_CARRIER_TEST_MODE`, firma kimlikleri, `CARRIER_WEBHOOK_SECRET`.
4. Seed: `npm run setup:turkey` shipping option provider'ını `carrier_carrier` yapar (env'e göre).
5. Webhook varsa firma paneline `https://api.<domain>/carrier/webhook?token=<CARRIER_WEBHOOK_SECRET>`;
   yoksa `getStatus` uygula → `jobs/track-shipments.ts` 30 dk'da bir yoklar.
6. Koli profili: `SHIPPING_PACKAGE_DEFAULT` + varyant `metadata.weight_kg` (çay gramajı).
