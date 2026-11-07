# Es Çay — Açık kararlar ve seçilen geçici değerler

Blueprint §13'teki kararların durumu. "Geçici değer" sütunu kodda şu an ne olduğunu söyler;
karar verilince ilgili dosyalar güncellenir. Son güncelleme: 2026-11-02.

| # | Karar | Geçici değer (kodda) | Nerede değişir |
|---|---|---|---|
| K1 | Kargo firması ve API durumu | **DHL eCommerce Türkiye, doğrudan Apizone** (2026-11-04; Geliver yok). Adaptör resmi swagger'a göre yazıldı, 39 senaryo birim testli (2026-11-06, `adapters/dhl`, `docs/DHL-APIZONE.md`); **gerçek API henüz çağrılmadı**. `SHIPPING_CARRIER` boşken elle kargo sürer. Kalan: Es Çay'ın kendi DHL hesabı + Apizone uygulaması (sandbox + prod, abonelikler), sunucu IP yetkisi, `npm run dhl:error-codes`, `npm run smoke:carrier` (sandbox teyit listesi), tek paket şube testi, etiket yazıcısı (Zebra/ZPL mi PDF mi), iade ücreti alıcıda onayı. | `docs/DHL-APIZONE.md`, `apps/backend/src/modules/carrier/README.md`, `.env.template` (SHIPPING_*, DHL_*, RETURN_*), koli profili `SHIPPING_PACKAGE_DEFAULT` |
| K2 | Çay KDV oranı | `KDV_RATE=1` (%1, gıda listesi varsayımı — **mali müşavir teyidi şart**) | `.env.template` (KDV_RATE, BIZIMHESAP_DEFAULT_VAT_RATE), storefront `NEXT_PUBLIC_VAT_RATE`, seed region tax rate |
| K3 | Havale/EFT açık mı, banka bilgileri | **Kapalı, kullanılmayacak (2026-11-07): satış yalnız kartla (PayTR).** Kod silinmedi, giriş noktaları yorum satırında: `medusa-config.ts` sağlayıcı kaydı, `api/store/bank-transfer/route.ts`, storefront `checkout-actions.ts` `loadCheckoutBootstrap`. Env tek başına açmaz. | `.env.template` BANK_TRANSFER_* → `npm run enable:bank-transfer:prod` |
| K4 | Sabit kargo ücreti / ücretsiz eşik | 149,90 TL sabit, eşik yok (`FREE_SHIPPING_THRESHOLD=0`) | `.env.template` SHIPPING_FLAT_PRICE / FREE_SHIPPING_THRESHOLD → `npm run seed` iki seçeneği kurallarla kurar |
| K5 | İade/değişim kapsamı (gıda istisnası) | Mareen RMA akışı korunuyor; iade sebepleri çaya uyarlandı (`wrong_variant`, "ambalajı açılmamış"); yasal metin **taslak**, hukukçu onayı yok | `shared/legal-contracts.ts` (CONTRACT_TEXT_VERSION `-draft`), seed RETURN_REASONS, storefront iade politikası sayfası |
| K6 | Varyant modeli (gramaj/aroma) | Kategoriler: siyah-cay, yesil-cay, bitki-cayi, harmanlar, hediye; etiket/fiş seçenek adını olduğu gibi basar (Gramaj/Paket) | seed kategorileri, storefront `spec-labels.ts`, BizimHesap ürün kimliği SKU eşleştirmesi (her varyanta SKU) |
| K7 | Omnisend/Meta/GA4/Ads/Pixel/Clarity/CookieYes hesapları | Hepsi env ile; kodda **hiç** sabit ID yok (boşsa kapalı) | `.env.template` (backend 8.7, storefront NEXT_PUBLIC_*), `Dockerfile.storefront` ARG'ları |
| K8 | Domain ve e-posta | Storefront `market.esteacay.com`, API `api.esteacay.com`, kurumsal `esteacay.com` (landing'den); e-posta `info@esteacay.com` **yer tutucu** | storefront `lib/site.ts`/`company.ts`/`next.config.ts`, backend `emails/company.ts`, `shared/legal-contracts.ts`, `.env.template` CORS/SMTP |
| K9 | Çoklu dil | Yok — yalnız TR (i18n iskeleti kaldırıldı) | — |
| K10 | Hata izleme / uptime / yedek doğrulaması | Yok; kurulumda `/health` + `/health/revision` + `/api/build-info` uptime monitörü, **yedek cron'una başarı sinyali** (heartbeat ping ya da `ops_event`) ve aylık restore provası — Mareen'de cron haftalarca sessizce çalışmadı | §7.7, `apps/backend/scripts/README-backup.md` |
| K11 | Sipariş ne zaman oluşur | **Karar (2026-11-05): kart ödemesinde sipariş ödeme başarılı olunca oluşur.** Ödeme öncesi yalnız `paytr_checkout` kaydı açılır, sepet açık kalır, stok düşmez. Geç bildirim bu kayıttan sahibini bulur; bildirim gelmezse iş PayTR'ye sorar. Havale eski yolda (sipariş hemen). Ayrıntı aşağıda. | `src/lib/paytr-checkout.ts`, `src/jobs/reconcile-paytr-checkouts.ts`, `src/api/paytr/callback/route.ts`, storefront `lib/checkout-actions.ts`, `PaytrResultPoller` |
| K12 | Mail sağlayıcı (Gmail SMTP mi, işlemsel servis mi) | Gmail SMTP varsayımı (`SMTP_HOST=smtp.gmail.com`), `info@esteacay.com` hesabı **yok**. Gmail günlük limiti toplu mail günlerinde takılır; `SMTP_PASS` boşsa modül uyarır, mail gitmez | `.env.template` 8.4, `src/modules/smtp-notification`, `lib/notify.ts` (idempotent gönderim hazır) |
| K13 | Staging ortamı | Tek Dokploy projesi (`estea / production`), staging yok. Staging açılırsa **ayrı proje + ayrı sırlar**, `PAYTR_OID_PREFIX=STG` (PayTR iade, Omnisend, CAPI ve **BizimHesap dry-run** bu işaretle kapanır), mümkünse ayrı IP | `docs/DOKPLOY-ENV.md`, `src/modules/parasut/options.ts` (`isNonProdDeployment`) |
| K14 | Fatura: BizimHesap | **Paraşüt kaldırıldı, BizimHesap'a geçildi (2026-11-03).** Satış faturası teslimden sonra kesilir (`delivery.created`, 2026-11-07). Es Çay'ın kendi hesabı; `BIZIMHESAP_FIRM_ID` boşken mock. API'de yalnız `addinvoice` var: test ortamı, sorgu, düzeltme, silme, idempotency ve iade tipi yok. Bu yüzden belirsiz istek otomatik tekrar gönderilmez (`unknown`), toplamı tutmayan fatura gönderilmez, iade faturası panelden elle kesilir (admin maili + `invoice.refund_manual` olayı), müşteriye fatura maili bu koddan gitmez. **BizimHesap'tan teyit bekleyen:** API kaydı e-Arşiv/e-Fatura olarak nasıl resmileşir ve müşteriye nasıl iletilir; `InvoiceNo` e-belge serisiyle çakışır mı; aynı `InvoiceNo` reddedilir mi; tutar biçimi. İlk bağlantı: `npm run test:bizimhesap`. | `src/modules/bizimhesap`, `src/lib/bizimhesap-*.ts`, `docs/DOKPLOY-ENV.md` |

## K11 — Kart ödemesinde sipariş yaşam döngüsü

Kullanıcı kararı (2026-11-05): çift sipariş ihtimali kalkacak, geç gelen onay bildirimi kaçmayacak.

| Adım | Ne olur | Sipariş | Stok |
|---|---|---|---|
| Ödeme ekranı açılır | `paytr_checkout` kaydı (`pending`): numara, sepet, tutar, ürünler. Kayıt, müşteriye gösterilecek iframe token'ının oturumuna yazılır; sepetin oturumu değişmişse (ikinci sekme) 409 `stale_token`, müşteri ödemeye yeniden geçer. Kayıt yazılamazsa ekran açılmaz | yok | düşmez |
| PayTR **failed** | yalnız sayaç; müşteri aynı ekranda ya da aynı sepetle tekrar dener | yok | düşmez |
| PayTR **success** | para önce kayda yazılır (`paid`) → sipariş oluşur → tahsilat kaydedilir (`completed`) → mail, kargo; fatura teslimde | oluşur | düşer |
| Bildirim gelmez | `reconcile-paytr-checkouts` (5 dk): ilk 2 saat her tur, 48 saate kadar saatte bir PayTR durum sorgusu; ödenmişse aynı yol, Logs'a uyarı | oluşur | düşer |
| 48 saat sonra | `expired`, sorgu durur. Bildirim yine de gelirse işlenir | oluşur | düşer |

Para alınıp sipariş açılamayan durumlar. **Hiçbirinde otomatik iade yok**, hepsinde `[KRİTİK]` mail + Logs:

| Durum | Davranış |
|---|---|
| Stok bitmiş / geçici hata | `paid` kalır, iş her 5 dk dener (uyarı bir kez). Stok gelince sipariş açılır. PayTR'de iade görülürse `refunded`, deneme durur. 3 gün olmazsa `review` |
| Aynı sepet iki ekrandan ödendi | tek sipariş; ikinci ödeme `review` (`duplicate_payment`), PayTR panelinden iade edilir |
| Ödeme sırasında sepet değişti | `review` (`cart_changed`); ödenen ürünler kayıtta, elle karar |
| Tutar tutmuyor | `review` (`amount_mismatch`) |
| Para birimi TL değil | `review` (`currency_mismatch`); kuruşu denk gelen başka birim sipariş açmaz |
| Sipariş açılmış ama iptal edilmiş, tahsilat eksik | `review` (`order_canceled`); iptal siparişe tahsilat yazılmaz |
| PayTR panelinden iade edilmiş (`pending` ya da `paid`) | `refunded`; sipariş açılmaz, deneme durur |

Müşteri tarafı: sonuç sayfası `completed` → onay, `processing` → bekler (90 sn sonra sepet bırakılır ama ödenen sepet kimliği `_escay_paytr_cart` çerezinde kalır; geç bildirim sonrası yenileme yine onaya gider), `attention` (`review` / `refunded`) → "ödemeniz alındı, sipariş inceleniyor, yeniden ödemeyin".

Kilitler Redis'te (`@medusajs/medusa/locking-redis`, `medusa-config.ts`): aynı numara için callback / durum sorgusu / temizlik işi süreçler arası sıralanır; `expired` yazımı kilit altında ve yalnız hâlâ `pending` ise. Prod'da `REDIS_URL` şart (event-bus zaten istiyor).

Sıra bilinçli: Medusa'nın `processPaymentWorkflow`'u önce capture edip sepeti sonra tamamlar ve tamamlama hatasını yutar; capture edilmiş ödemede `completeCart` telafisi parayı PayTR'den otomatik iade etmeye çalışır. Bu yüzden önce sipariş (`completeCartWorkflow`), sonra tahsilat.

Bilinen bedel: stok ödeme öncesi rezerve edilmez, son adetler için aynı anda ödeyen iki müşteriden biri "stok bitmiş" durumuna düşebilir. Müşteri ödeme öncesinde sipariş numarası görmez.

Doğrudan mağaza API'siyle ödenmemiş sepet tamamlanamaz (`authorizePayment` → `requires_more`). Kimliksiz / mock stub oturumlar yerel test için eski yolda kalır; `cancel-unpaid-paytr-orders` yalnız onlar için durur.

**Durum (2026-11-06): kod tarafı kapandı.** Gerçek PayTR ile test modunda denendi: mağaza checkout'u → gerçek `get-token` → iframe'de test kartıyla ödeme → PayTR bildirimi (panel URL'i henüz bize bakmadığı için `inject-paytr-callback` ile aynı gövde/hash) → sipariş #18 oluştu, tek capture, mock fatura, onay maili. Hash/tutar formülleri (61 kontrol), callback simülasyonu (33/33, mock), uçtan uca smoke (23/23), HTTP entegrasyon (`paytr-order-on-success` 14/14, yaşam döngüsü/havale/sepet 17/17) geçiyor. Gerçek PayTR'ye **denenmeyen** tek şey: `durum-sorgu` ucu (entegrasyon testinde stub ile); canlıda bildirim kapalıyken ilk 3 dk sonra Logs'ta `status_query` kaynaklı `payment.succeeded` görülmeli.

**Canlıya geçiş için kalan (kod değil, kurulum):**
1. PayTR paneli → Bildirim URL: `https://api.esteacay.com/paytr/callback` (`docs/DOKPLOY-ENV.md` Dönem B adım 1–2; önce `curl -X POST` ile "bad hash" görülmeli).
2. Canlı kimlikler + env üçlüsü birlikte: `PAYTR_MERCHANT_*`, `PAYTR_OID_PREFIX=` (boş), `PAYTR_TEST_MODE=0`, `PAYTR_MOCK` silinir (Dönem B adım 7; env-guard aksi halde backend'i başlatmaz).
3. Deploy'da `paytr_checkout` migrasyonu (`medusa db:migrate`, prebuild'de var) ve `REDIS_URL`.
4. 1 TL gerçek ödeme + panelden iade; Logs'ta `payment.succeeded`, admin'de tek capture.

Bilerek açık bırakılan: kayıt adımı atlanmış oturumda (yalnız doğrudan Store API istemcisi) sepet-değişti koruması çalışmaz; callback'teki eski oturum yolu stub/lokal için duruyor; elle işlem ekranı (`review` listesi) yok, şimdilik mail + Logs + PayTR paneli.

Test: `integration-tests/http/paytr-order-on-success.spec.ts`, `modules/paytr-checkout/__tests__`, `modules/paytr/__tests__/service-order-on-success.unit.spec.ts`, `api/paytr/callback/__tests__`; betikler `npm run test:paytr`, `test:paytr:token`, `test:paytr:callback`, `test:paytr:inject`, `test:smoke:full`.

## PayTR dersleri (Mareen) — uygulama durumu

| Ders | Durum | Nerede |
|---|---|---|
| Callback ucu DNS'ten önce ayakta, panel URL'i önceden test | Kurulum adımı | `docs/DOKPLOY-ENV.md` Dönem B 1–3 |
| Geç success'te iade değil, uyarı + elle inceleme | **Yapıldı** (tüm tutarsız success türleri için) | `callback/route.ts` `compensateOrThrow`, `PAYTR_CALLBACK_AUTO_REFUND` |
| Failed'da yalnız sayaç; idempotency sadece success | **Yapıldı** | `callback/route.ts`, `modules/paytr/callback-state.ts`, temizlik işi |
| Sipariş–ödeme oturumu / ödenmemiş sipariş yaşam döngüsü, çift sipariş | **Yapıldı (2026-11-05)** — sipariş ödeme başarılı olunca oluşur | K11 |
| Geç / gelmeyen bildirim | **Yapıldı (2026-11-05)** — kalıcı `paytr_checkout` kaydı + PayTR durum sorgusu işi | K11 |
| Admin "yine de devam et" / force ile yanlış `merchant_oid` | Portta yok — admin'de `merchant_oid` yazan uç yok; eklenirse tutar + numara doğrulaması zorunlu | — |
| Env varsayılanları tuzak; boot'ta doğrulama | **Yapıldı** — prod'da `PAYTR_TEST_MODE` tanımsız / canlı+önek / canlı+mock → backend başlamaz | `modules/paytr/env-guard.ts`, `.env.template` |
| Taksitte tutar kontrolü `payment_amount` ile | **Yapıldı** (hash `total_amount`, karşılaştırma ve capture `payment_amount`) | `callback/route.ts` |
| Log'larda `[object Object]` | **Yapıldı** | `formatUnknownError`, `describeError` |
| Kilit süreç içi / ttl yok sayılıyor; ikinci replika kilidi görmez | **Yapıldı (2026-11-06)** — Redis kilit sağlayıcısı, `expired` koşullu | `medusa-config.ts`, `order-guards.ts` `resolveLocking` |
| Para birimi doğrulanmıyor; iptal siparişe capture; panelden iade sonrası sipariş | **Yapıldı (2026-11-06)** — `currency_mismatch`, `order_canceled`, `pending` dalında iade kontrolü | `settle-rules.ts`, `paytr-checkout.ts` |
| Müşteri sonuç sayfasında yanlış/boş bilgi (review'da "e-posta gelecek", 90 sn sonra sorgu kopuyor) | **Yapıldı (2026-11-06)** — `attention` durumu, ödenen sepet çerezi | `status/route.ts`, `PaytrResultPoller`, `checkout-actions.ts` |
| İki sekme: ödenen token ile kaydedilen oturum farklı | **Yapıldı (2026-11-06)** — kayıt token'a bağlı, 409 `stale_token` | `register/route.ts`, `paytr-checkout.ts` |

## Şirket künyesi (landing `content.ts`'ten)

Hamzalı Çay Gıda Tur. ve İnş. A.Ş. · Balaban Mah. Uğurlu Cad. No: 9, Merkez, Hayrat / Trabzon · 0462 692 30 61 ·
Instagram/Facebook `esteacay`. MERSİS / vergi no / KVKK sorumlusu bilgisi yok → yasal sayfalar TODO.

## Mareen dersleri (fatura / pazarlama / altyapı) — Es Çay'daki durumu

Kaynak: Mareen kapanış notları (2026-10-30), blueprint §11 madde 39–49. "Durum" kodda bugün ne olduğunu söyler.

| Ders | Durum | Kalan iş |
|---|---|---|
| Paraşüt'te çift ürün (ad değişiminde yeni kayıt, kod boş) | **Yapıldı** — `ensureProduct` önce `code` (SKU), sonra birebir ad; DRY-RUN'da ürün oluşturma kapalı | Katalogda her varyanta SKU (K6); canlı ilk satış öncesi `parasut-product-match` raporu |
| Paraşüt API: TRL, satır başı ürün referansı, 429 "N saniye" gövdesi | **Yapıldı** — `toParasutCurrency`, `retryAfterMs`, retry/backoff | — |
| KDV hariç birim fiyat yuvarlaması, çay oranı farklı | **Yapıldı (2026-10-30)** — %1 testleri eklendi; `mapMedusaTaxRateToVat(1)` %100 döndürüyordu, düzeltildi | K2 teyidi gelince `KDV_RATE`/`BIZIMHESAP_DEFAULT_VAT_RATE`/`NEXT_PUBLIC_VAT_RATE` tek değer |
| Test ortamında gerçek e-fatura (#59) | **Yapıldı (2026-10-30)** — `PAYTR_OID_PREFIX` doluyken dry-run zorlanır; test script'leri dry-run kapalıysa reddeder | Canlıya geçişte önek boşaltma adımı `DOKPLOY-ENV.md` Dönem B'de |
| Arşiv siparişleri Medusa siparişi olarak içe alınca subscriber tetiklendi | **Sorun yok** — sipariş importu yok, yalnız ürün importu (`import-wc-products`) | Arşiv gerekirse ayrı tablo, `order`'a yazılmaz |
| Trendyol stok çakışması | **Sorun yok** — pazaryeri entegrasyonu yok | Açılırsa stok sahibi tek sistem (Medusa) |
| CookieYes banner'ı hidrasyonu bozdu, takip hiç yüklenmedi | **Yapıldı** — `afterInteractive`, takip onaya bağlı, ID boşsa yüklenmez | K7 açılışında "onay verilmedi" oranını izle |
| Omnisend sandbox yok, staging adresleri gerçek hesaba düştü | **Yapıldı** — `OMNISEND_TEST_EMAILS` allowlist, canlı dışı ortamda liste dışına gönderim yok | Test e-posta listesi K7 ile |
| GTM + kod çift sayım | **Yapıldı** — GTM container yok, tek kaynak `Analytics.tsx` | GTM açılırsa koddaki gtag kapatılır |
| SMTP_PASS boş, info@ yok, idempotency "not found" | **Kısmen** — boş şifrede uyarı, `createNotificationIdempotent` var | K12 sağlayıcı kararı, K8 hesap + SPF/DKIM/DMARC |
| Staging/prod aynı IP, build bilgisi "unknown", eski .js | **Kısmen** — `GIT_COMMIT`/`CACHE_BUST` build arg, `/health/revision`, `/api/build-info`; `.js` kopyaları yok | K13 staging ayrımı; deploy sonrası commit hash kontrolü rutin |
| Gözlem yok, yedek cron'u sessiz | **Kısmen** — `ops_event` + admin Logs var; backup/restore script'leri var | K10: uptime monitörü, yedek heartbeat'i, restore provası |
| S3 ACL, WP'ye bağlı thumbnail'lar | **Yapıldı** — `acl: false`; görseller kendi kökünden | Canlıdan önce S3 doldur (boşsa container diski, kalıcı değil) |
