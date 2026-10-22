# Returns test package — nasıl çalıştırılır

Es Çay RMA (iade) otomatik testleri. **Gerçek para ve gerçek mail atılmaz.**

## Hızlı başlangıç

```bash
cd escay-backend

# Offline (PayTR mock + tutar mantığı + mail şablonları) — backend şart değil
npm run test:returns

# Tek suite
PAYTR_MOCK=1 npx tsx test/returns/paytr-refund.mock.ts
npx tsx test/returns/refund-amount.ts
npx tsx test/returns/notifications.ts
```

## PAYTR_MOCK

`PAYTR_MOCK=1` (veya `true`) iken PayTR provider `/odeme/iade` için gerçek HTTP
çağırmaz; `src/modules/paytr/mock-iade.ts` body'yi yakalar ve konfigüre yanıt döner.

`npm run test:returns` runner her suite'te `PAYTR_MOCK=1` set eder.

### Birim notu (sık karışıklık)

| API | Tutar formatı |
|-----|----------------|
| PayTR get-token (ödeme) | kuruş (×100), örn. `174900` |
| PayTR `/odeme/iade` (iade) | **TL string**, örn. `"1749.00"` |

Medusa major-unit TRY kullanır. `formatPaytrReturnAmount(1749)` → `"1749.00"`.
Eski prompt'taki "174900 kuruş" iade API için **yanlış**tır.

## Live API suite'leri

`guest-security`, `rate-limit`, `lifecycle` çalışan Medusa + bilinen sipariş ister.

### Fixture env

```bash
export MEDUSA_BACKEND_URL=http://localhost:9000
export MEDUSA_PUBLISHABLE_KEY=pk_...

export TEST_ORDER_ID=order_01...
export TEST_ORDER_EMAIL=customer@example.com
export TEST_ORDER_ITEM_ID=orli_01...   # returnable line item
export TEST_REASON_ID=rr_...           # seed'li return reason

# Opsiyonel
export TEST_WRONG_EMAIL=wrong@example.invalid
export TEST_OTHER_ORDER_EMAIL=other@example.com
export TEST_REASON_DEFECT_ID=...       # seller_pays_shipping: true
export TEST_REASON_MIND_ID=...         # seller_pays_shipping: false
export TEST_CUSTOMER_TOKEN=...         # üye return (lifecycle)
export TEST_OTHER_CUSTOMER_TOKEN=...   # ownership negatif testi
```

Sipariş: **teslim edilmiş**, iade edilebilir kalem(ler), email eşleşmeli.
Seed: `npm run seed` (return reasons dahil).

### Rate-limit hızlı test

Backend'i kısa pencere ile başlatın:

```bash
GUEST_RETURN_RATE_MAX=3 \
GUEST_RETURN_RATE_WINDOW_MS=5000 \
ORDER_LOOKUP_RATE_MAX=3 \
ORDER_LOOKUP_RATE_WINDOW_MS=5000 \
npm run dev
```

Sonra aynı env'leri test process'ine verin (assert'ler max değerini okur):

```bash
GUEST_RETURN_RATE_MAX=3 GUEST_RETURN_RATE_WINDOW_MS=5000 \
ORDER_LOOKUP_RATE_MAX=3 ORDER_LOOKUP_RATE_WINDOW_MS=5000 \
npm run test:returns
```

## Dosya haritası

| Dosya | Bölüm |
|-------|--------|
| `guest-security.ts` | Misafir güvenlik / enumeration |
| `rate-limit.ts` | Guest return vs lookup kova ayrımı |
| `paytr-refund.mock.ts` | PayTR iade mock (hash, TL, idempotency) |
| `refund-amount.ts` | Kargo dahil/hariç tutar mantığı |
| `lifecycle.ts` | Auth / ownership / çift iade |
| `notifications.ts` | Mail şablon + fail→mail yok sözleşmesi |
| `MANUAL-CHECKLIST.md` | Elle doğrulanacaklar |
| `run-all.ts` | `npm run test:returns` |

## Idempotency

- Offline suite'ler saf / mock — her run temiz.
- Live suite'ler her çalıştırmada yeni return oluşturabilir; adet aşımı /
  ikinci iade testleri 4xx bekler. Taze order ile tekrarlayın veya önceki
  return'leri admin'den temizleyin.

## Manuel checklist

Otomatikleştirilemeyen adımlar: [MANUAL-CHECKLIST.md](./MANUAL-CHECKLIST.md)
