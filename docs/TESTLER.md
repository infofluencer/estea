# Testler

Dört katman var. İlk üçü yerelde ve CI'da (`.github/workflows/test.yml`) çalışır. Dördüncüsü yalnız staging'e karşı çalışır.

| Katman | Nerede | Komut | Ne gerekir |
|---|---|---|---|
| Backend birim | `apps/backend/src/**/__tests__/*.unit.spec.ts` | `npm run test:unit --prefix apps/backend` | hiçbir şey |
| Backend HTTP entegrasyon | `apps/backend/integration-tests/http/*.spec.ts` | `npm run test:integration` | Postgres |
| Mağaza birim | `apps/frontend/src/lib/__tests__/*.test.ts` | `npm test --prefix apps/frontend` | hiçbir şey |
| Mağaza e2e (Playwright) | `apps/frontend/e2e/` | `npm run test:e2e` | staging adresleri (aşağıda) |

Kökten:

```bash
npm test                 # backend + mağaza birim testleri (saniyeler)
npm run test:integration # backend HTTP testleri (Postgres, ~2 dk)
npm run test:all         # typecheck + birim + entegrasyon
```

## Entegrasyon testleri için Postgres

```bash
docker compose -f docker-compose.dev.yml up -d postgres
npm run test:integration
```

Varsayılan bağlantı `localhost:5433`, kullanıcı ve parola `medusa/medusa` (`docker-compose.dev.yml`). Başka bir sunucu kullanacaksanız `DB_HOST`, `DB_PORT`, `DB_USERNAME` ve `DB_PASSWORD` ile değiştirin. Her test dosyası kendi geçici veritabanını açar ve iş bitince siler. Geliştirme verisine dokunulmaz.

Dış servislerin hiçbiri çağrılmaz:

- PayTR: `PAYTR_MOCK=1`. Ödeme oturumu taklittir ve `/odeme/iade` isteği `mock-iade` katmanına gider.
- BizimHesap: `BIZIMHESAP_FIRM_ID` boş, yani mock modda.
- Kargo: `SHIPPING_CARRIER` boş, yani manuel.
- E-posta: notification modülü kayıt tutar, mail göndermez.

## Ne test ediliyor

**Ödeme**

- `cart-checkout`: sepet, adres, kargo ve TL toplamları.
- `paytr-order-on-success`: siparişin yalnız ödeme başarılı olunca açılması; çift ödeme, geç bildirim, tutar uyuşmazlığı, stok bitmesi.
- `bank-transfer`: havale siparişi, ödeme bekleyen siparişte IBAN gösterimi, admin "Havale alındı" onayı. Tekrar tıklama ve eşzamanlı iki tıklamanın tek capture ürettiği; iptal edilmiş ya da kartla ödenmiş siparişin onaylanamadığı.

**Sipariş yaşam döngüsü (`order-lifecycle`)**

- Admin uçlarıyla hazırla → kargola (takip numarası) → teslim et; stok düşer.
- Misafir iade → kabul (stoğa geri girer) → PayTR geri ödemesi (ürün bedeli kadar, kargo hariç) → ikinci "İade et" yeniden para göndermez.
- Hasarlı ürün stoğa girmez.
- Talep edilenden fazla adet kabul edilemez.
- Reddedilen iadeye geri ödeme yapılmaz.
- PayTR iadeyi reddederse admin'e gerçek hata mesajı gelir.

**Güvenlik (`access-control`)**

- Her özel admin ucu token olmadan da müşteri token'ıyla da 401 döner. `src/api/admin` taranır; listeye eklenmemiş yeni bir uç testi kırar.
- Müşteri uçları girişsiz 401 döner.
- Siparişi yalnız sahibi görür; kimlik doğrulaması olmadan id ile sipariş okunamaz.

**Mağaza kuralları (`store-rules`)**

- Stoktan fazla, sıfır ya da negatif adet sepete eklenemez.
- İstemci fiyat belirleyemez.
- Sunucuya ait metadata anahtarları (`source`, ağırlık ve ölçüler) istekten silinir.
- Kupon ürün toplamını düşürür, kargoya dokunmaz.
- İstek listesi müşteriler arasında ayrık tutulur.
- İletişim formunda doğrulama, bal tuzağı alanı ve hız sınırı çalışır.

**Diğerleri:** `auth`, `guest-customer` (misafir siparişinin hesaba bağlanması), `order-lookup`, `returns` (misafir iadesi güvenliği), `bizimhesap-invoice`, `catalog`, `errors`.

## Yardımcılar (`integration-tests/http/helpers`)

- `seedStorefrontFixture` / `createPricedProducts`: Türkiye bölgesi, TL, depo, kargo seçeneği ve stoklu ürün.
- `placeGuestStubOrder`: hızlı sipariş açar; ödeme yalnız **authorize** edilir. `headers` ile giriş yapmış müşteri, `providerId: "pp_havale_havale"` ile havale siparişi açılır.
- `placePaidCardOrder`: canlıdaki yolu izler (iframe kaydı → PayTR başarı bildirimi → sipariş + **capture**). Geri ödeme ya da fatura gibi capture gerektiren akışlarda bunu kullanın.
- `createAdminHeaders`, `registerVerifiedCustomer`: admin ve e-postası doğrulanmış müşteri oturumu.
- `noThrow`: 4xx/5xx yanıtında axios hata fırlatmaz, durum kodu kontrol edilebilir.

Dikkat: test runner `env` bloğunu `medusa-config` yüklendikten **sonra** uygular. Provider seçenekleri (örneğin `PAYTR_MERCHANT_*`) config'ten okunduğu için spec dosyasının başında `process.env` ile atanmalıdır (bkz. `order-lifecycle.spec.ts`). Çalışma anında okunan değişkenler (`PAYTR_MOCK`, `BANK_TRANSFER_*`) `env` bloğunda kalabilir.

## Mağaza e2e

Yalnız staging'e karşı çalışır; canlı adres reddedilir:

```bash
STAGING_FRONTEND_URL=http://HOST:3016 \
STAGING_BACKEND_URL=http://HOST:9000 \
STAGING_PUBLISHABLE_KEY=pk_... \
npm run test:e2e
```

## Bilinen hatalar (`it.fails` olarak işaretli)

Bu testler hatanın varlığını belgeler. Hata düzeltilince test "beklenmedik şekilde geçti" diye kırılır; o zaman `it.fails` kaldırılır.

- `apps/frontend/src/lib/cart-pricing.ts`:
  - `roundMoney(1.005)` 1.00 veriyor, 1.01 olmalı (kayan nokta hatası).
  - `NEXT_PUBLIC_VAT_RATE` ya da `NEXT_PUBLIC_SHIPPING_FALLBACK_PRICE` boş string gelirse değer 0 oluyor.
- `apps/frontend/src/lib/spec-labels.ts`:
  - `feature_10`, `feature_2`'den önce sıralanıyor.
  - Türkçe anahtarlarda baş harf büyütme bozuk: `çay_türü` → `çAy TüRü`.
