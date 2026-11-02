# Kargo katmanı — Mareen dersleri ve Es Çay'daki durumu

Kaynak: Mareen kapanış notları (2026-10-30), kargo bölümü. Firma (K1) henüz seçilmedi; bu
yüzden "Yapıldı" firma bağımsız katmanda hazır olanı, "Adaptör" firma seçilince `adapters/<kod>.ts`
içinde uyulması gereken kuralı anlatır. Sözleşme: `apps/backend/src/modules/carrier/types.ts`
(`CarrierAdapter`), özet `modules/carrier/README.md`.

Beş işlem — **gönderi aç, iptal et, durum sorgula, etiket al, iade kodu üret** — idempotent; her
çağrının firma kimliği (`shipment_ref`) siparişe yazılır; webhook olmadan yoklama ile çalışır.

## Taşıyıcıya bağlanma biçimi

| Ders | Durum | Nerede / kalan |
|---|---|---|
| Aracı platform ardışık bekleme adımlarında her tekrar yeni sipariş açtı, biz düzeltemedik | **Karar kuralı** — aracı seçilirse taşıyıcıda doğrudan sorgu + iptal yetkisi şart; yoksa aracı seçilmez | K1 değerlendirme ölçütü |
| IP yetkisi, pasif hesap, teklif zaman aşımı ilk gerçek gönderide çıktı | **Yapıldı** — `npm run smoke:carrier` (healthCheck → aç → durum → etiket → iptal; `SMOKE_CARRIER_LIVE=1` canlı anahtar) | Cutover'dan günler önce çalıştır; `scripts/smoke-carrier.ts` |
| Bakiye tabanlı aracıda bakiye sıfırken gönderi düştü | **Yapıldı (iskelet)** — `CarrierAdapter.healthCheck()` bakiye + eşik döner; günlük denetim "bakiye düşük" olayı yazar | Adaptör `healthCheck` uygular |

## İstek güvenliği ve tekrar deneme

| Ders | Durum | Nerede / kalan |
|---|---|---|
| Yazma isteği 5xx'te 3 kez gitti, 3 kayıt açıldı | **Sözleşme** — createShipment/createReturn retry edilmez; yalnız okuma ve iptal denenebilir | `types.ts` kuralları; adaptör |
| Yarım kalan gönderi temizlenmedi, sonraki deneme yeni kayıt açtı | **Yapıldı (iskelet)** — adaptör ara adımda çökerse kaydı iptal eder; edemezse `CarrierError({ shipmentRef })` → service kimliği log'a yazar; admin "Dış gönderiyi bağla" ile kullanır | `service.ts` createFulfillment catch; adaptör |
| Log'a "[object Object]" düştü | **Yapıldı** — `CarrierError` (kod + mesaj + istek bağlamı), `carrierErrorText`, `errorText` | `types.ts`, `lib/ops-events.ts` |
| Adet string gidince taşıyıcı reddetti | **Sözleşme** — gövde şemayla doğrulanır; `mapItems` adedi `number` üretir | adaptör (zod/şema) |

## Durum takibi

| Ders | Durum | Nerede / kalan |
|---|---|---|
| Webhook geç geldi / hiç gelmedi | **Yapıldı** — `jobs/track-shipments.ts` 30 dk'da açık gönderileri `getStatus` ile yoklar; webhook yalnız hızlandırıcı | Adaptör `getStatus` uygular |
| Aracı 7 gün kargoya verilmeyen etiketi sessizce iptal etti | **Yapıldı** — günlük denetim `stale_label` (varsayılan 4 gün, `SHIPPING_AUDIT_STALE_LABEL_DAYS`) → Logs uyarısı | `lib/shipping/shipment-audit.ts` |
| Webhook URL'i yanlış ortama bakıyordu | **Kural** — her ortam için ayrı webhook kaydı + ayrı `CARRIER_WEBHOOK_SECRET`; canlıya geçmeden gerçek bildirimle doğrulama | `.env.template`, `docs/DOKPLOY-ENV.md` cutover adımı |
| Eşleşme yalnız son 200 gönderide arıyordu | **Yapıldı** — sipariş referansı → etiket tablosu (takip no) → açık kayıtların sayfalı taraması; sabit üst sınır yok | `lib/shipping/open-fulfillments.ts`, webhook route, yoklama |
| Takip no etiketle geldi, "kargoya verildi" erken göründü | **Yapıldı** — durum yalnız `shipped_at` ile (firmanın "alındı" olayı ya da admin "Kargoya ver"); takip no varlığı durum sayılmaz | `shared/order-timeline.ts`, `carrier-actions.ts` |
| Webhook + yoklama yarışı hata diye loglandı | **Yapıldı** — `applyCarrierAction` idempotent, "already shipped/delivered" yutulur | `lib/carrier-actions.ts`, test `shipping-notification-chain` |

## Etiket ve paket

| Ders | Durum | Nerede / kalan |
|---|---|---|
| Kendi etiketimizi şube kabul etmedi, 52 gönderi günlerce bekledi | **Kural** — pakette firmanın **resmi** etiketi (`getLabel`), kendi fişimiz ayrı sayfa; ilk gün tek paketle şube testi (`SMOKE_CARRIER_KEEP=1` etiketi açık bırakır) | Adaptör `getLabel`; `lib/order-packing-label.ts` fiş |
| Şubede elle açılan gönderiler sisteme düşmedi | **Yapıldı** — sipariş sayfası "Dış gönderi · Siparişe bağla" (`POST /admin/orders/:id/fulfillment/attach`, firmaya yeni kayıt açmaz) ve admin "Kargo uzlaştırma" sayfası (`POST /admin/escay-shipments/reconcile`, kuru çalışma → uygula) | `lib/shipping/attach-external-shipment.ts`, `reconcile-shipments.ts` |
| Desi/ağırlık yanlış, env varsayılanı ürün kodunu eziyordu | **Kısmen** — varyant `metadata.weight_kg` / boyut önce, profil yedek; `maxHeight` ile desi sınırı | Çay varyantlarına kg/cm metadata girişi; ilk etikette desi kontrolü (K1/K4) |
| Ürün adedi sıfır gidiyordu (`items.detail.quantity`) | **Yapıldı** — `auto-fulfill-order.ts` `items.detail.quantity` okur | — |

## Adres ve müşteri verisi

| Ders | Durum | Nerede / kalan |
|---|---|---|
| İlçe serbest metin, eşleşmedi | **Yapıldı** — il/ilçe/mahalle resmi listeden seçilir; storefront server action'da `isTrDistrictOf` doğrulaması; backend `recipient.ts` il/ilçe çözümler, eksikse gönderi açmaz | Backend tarafında da liste doğrulaması isteniyorsa `recipient.ts`'e `isTrDistrictOf` eklenir |
| Adres satırı yalnız mahalle | **Yapıldı** — `isAddressLineOnlyLocation` engeller, `isAddressLineSuspicious` "adresinizi kontrol edin" sorar | `apps/frontend/src/lib/checkout-address.ts` |
| gmail.con | **Yapıldı** — DNS MX/A doğrulaması (yalnız kesin "yok"ta reddeder) | `apps/frontend/src/lib/email-domain.ts` |
| Gönderici adresinde satır sonu | **Yapıldı** — tek satır sabit | `emails/company.ts` COMPANY.address |

## İade ve değişim

| Ders | Durum | Nerede / kalan |
|---|---|---|
| İade etiketi giden gönderiye bağlıydı | **Yapıldı** — iade kodu akışı giden gönderiden bağımsız (admin elle kod / `createReturn`) | `lib/return-code.ts`, `returns/[id]/return-code` |
| Ücret tipi geriye dönük uygulanmadı, "kodu iptal et, yenisini gönder" | **Kısmen** — aynı iadeye yeni kod gönderilebilir (yeni kod yeni mail) | Adaptör `createReturn` ücret tipini oluşturma anında doğrular; eskisini iptal eden uç firma API'sine bağlı |
| İade kodu maili gitti ama "gönderildi" yazılmadı | **Yapıldı** — `createNotificationIdempotent`, işaret mail sonrası | `lib/notify.ts`, `lib/return-code.ts` |

## Operasyon ve gözlem

| Ders | Durum | Nerede / kalan |
|---|---|---|
| Olay kaydı yoktu | **Yapıldı** — `ops_event` tablosu, admin Logs + sipariş "Olaylar" kutusu | `modules/ops-event`, `lib/ops-events.ts` |
| Tutarsızlıklar elle bulundu | **Yapıldı** — günlük salt okunur denetim (07:00): ödendi/kargo yok, bekleyen etiket, geciken teslim, iptalde açık gönderi, aynı gönderi iki kayıtta, hesap/bakiye; `npm run audit:shipments` elle | `jobs/shipment-audit.ts`, `lib/shipping/shipment-audit.ts` |
| Seed ayarı sıfırlıyordu (kargo ücreti flat'e döndü) | **Yapıldı** — seed mevcut `calculated` seçeneği korur | `scripts/seed-escay.ts` ensureTrShipping |

## Firma seçilince yapılacaklar (K1 kontrol listesi)

1. `adapters/<kod>.ts`: createShipment (sabit referans, retry yok, şema doğrulama, yarım kaydı iptal),
   cancelShipment / cancelShipmentStrict, getStatus, getLabel (resmi etiket), healthCheck, createReturn,
   parseWebhook (ortam sırrı), trackingUrl.
2. `.env`: `SHIPPING_CARRIER`, firma kimlikleri, ortam başına `CARRIER_WEBHOOK_SECRET`; `npm run setup:turkey`.
3. `npm run smoke:carrier` sandbox → `SMOKE_CARRIER_LIVE=1` canlı → `SMOKE_CARRIER_KEEP=1` ile tek paket şube testi.
4. Firma paneline webhook URL'i; ilk gerçek bildirimi Logs'ta gör.
5. Çay varyantlarına kg/cm metadata; ilk etikette desi kontrolü.
6. `emails/company.ts` `returnCarrierName` / `returnCustomerNumber`.
7. İlk hafta her sabah Logs → "Kargo denetimi" özetine bak.
