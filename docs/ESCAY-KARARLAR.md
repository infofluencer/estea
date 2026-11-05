# Es Çay — Açık kararlar ve seçilen geçici değerler

Blueprint §13'teki kararların durumu. "Geçici değer" sütunu kodda şu an ne olduğunu söyler;
karar verilince ilgili dosyalar güncellenir. Son güncelleme: 2026-11-02.

| # | Karar | Geçici değer (kodda) | Nerede değişir |
|---|---|---|---|
| K1 | Kargo firması ve API durumu | **Elle kargo** (`SHIPPING_CARRIER` boş → `manual_manual`; admin "Kargoya ver (takip no)" → mailler). Adaptör sözleşmesi hazır; Mareen kargo dersleri `docs/KARGO-DERSLERI.md` (günlük denetim, dış gönderi bağlama, uzlaştırma, canlı duman testi kodda). Firma seçilince: adaptör + `npm run smoke:carrier` + tek paket şube testi. | `apps/backend/src/modules/carrier/README.md`, `.env.template` (SHIPPING_*), `emails/company.ts` (`returnCarrierName`, `returnCustomerNumber`), koli profili `SHIPPING_PACKAGE_DEFAULT` |
| K2 | Çay KDV oranı | `KDV_RATE=1` (%1, gıda listesi varsayımı — **mali müşavir teyidi şart**) | `.env.template` (KDV_RATE, BIZIMHESAP_DEFAULT_VAT_RATE), storefront `NEXT_PUBLIC_VAT_RATE`, seed region tax rate |
| K3 | Havale/EFT açık mı, banka bilgileri | Kapalı (`BANK_TRANSFER_ENABLED=0`) | `.env.template` BANK_TRANSFER_* → `npm run enable:bank-transfer:prod` |
| K4 | Sabit kargo ücreti / ücretsiz eşik | 149,90 TL sabit, eşik yok (`FREE_SHIPPING_THRESHOLD=0`) | `.env.template` SHIPPING_FLAT_PRICE / FREE_SHIPPING_THRESHOLD → `npm run seed` iki seçeneği kurallarla kurar |
| K5 | İade/değişim kapsamı (gıda istisnası) | Mareen RMA akışı korunuyor; iade sebepleri çaya uyarlandı (`wrong_variant`, "ambalajı açılmamış"); yasal metin **taslak**, hukukçu onayı yok | `shared/legal-contracts.ts` (CONTRACT_TEXT_VERSION `-draft`), seed RETURN_REASONS, storefront iade politikası sayfası |
| K6 | Varyant modeli (gramaj/aroma) | Kategoriler: siyah-cay, yesil-cay, bitki-cayi, harmanlar, hediye; etiket/fiş seçenek adını olduğu gibi basar (Gramaj/Paket) | seed kategorileri, storefront `spec-labels.ts`, BizimHesap ürün kimliği SKU eşleştirmesi (her varyanta SKU) |
| K7 | Omnisend/Meta/GA4/Ads/Pixel/Clarity/CookieYes hesapları | Hepsi env ile; kodda **hiç** sabit ID yok (boşsa kapalı) | `.env.template` (backend 8.7, storefront NEXT_PUBLIC_*), `Dockerfile.storefront` ARG'ları |
| K8 | Domain ve e-posta | Storefront `market.esteacay.com`, API `api.esteacay.com`, kurumsal `esteacay.com` (landing'den); e-posta `info@esteacay.com` **yer tutucu** | storefront `lib/site.ts`/`company.ts`/`next.config.ts`, backend `emails/company.ts`, `shared/legal-contracts.ts`, `.env.template` CORS/SMTP |
| K9 | Çoklu dil | Yok — yalnız TR (i18n iskeleti kaldırıldı) | — |
| K10 | Hata izleme / uptime / yedek doğrulaması | Yok; kurulumda `/health` + `/health/revision` + `/api/build-info` uptime monitörü, **yedek cron'una başarı sinyali** (heartbeat ping ya da `ops_event`) ve aylık restore provası — Mareen'de cron haftalarca sessizce çalışmadı | §7.7, `apps/backend/scripts/README-backup.md` |
| K11 | Ödenmemiş sipariş yaşam döngüsü (sipariş ↔ PayTR oturumu) | **Sipariş ödeme öncesi oluşur** (Medusa `cart.complete` → pending, stok rezerve → iframe). Failed callback iptal etmez (sayaç); süre dolunca temizlik işi iptal eder; geç success iade edilmez, elle inceleme. Storefront fail'de pending snapshot'tan **yeni** sepet kurar → vazgeçip dönen müşteri ikinci siparişi açabilir (ilki 30 dk sonra iptal). Hedef tasarım aşağıda. | `src/jobs/cancel-unpaid-paytr-orders.ts`, `src/api/paytr/callback/route.ts`, storefront `lib/pending-checkout.ts` |
| K12 | Mail sağlayıcı (Gmail SMTP mi, işlemsel servis mi) | Gmail SMTP varsayımı (`SMTP_HOST=smtp.gmail.com`), `info@esteacay.com` hesabı **yok**. Gmail günlük limiti toplu mail günlerinde takılır; `SMTP_PASS` boşsa modül uyarır, mail gitmez | `.env.template` 8.4, `src/modules/smtp-notification`, `lib/notify.ts` (idempotent gönderim hazır) |
| K13 | Staging ortamı | Tek Dokploy projesi (`estea / production`), staging yok. Staging açılırsa **ayrı proje + ayrı sırlar**, `PAYTR_OID_PREFIX=STG` (PayTR iade, Omnisend, CAPI ve **BizimHesap dry-run** bu işaretle kapanır), mümkünse ayrı IP | `docs/DOKPLOY-ENV.md`, `src/modules/parasut/options.ts` (`isNonProdDeployment`) |
| K14 | Fatura: BizimHesap | **Paraşüt kaldırıldı, BizimHesap'a geçildi (2026-11-03).** Es Çay'ın kendi hesabı; `BIZIMHESAP_FIRM_ID` boşken mock. API'de yalnız `addinvoice` var: test ortamı, sorgu, düzeltme, silme, idempotency ve iade tipi yok. Bu yüzden belirsiz istek otomatik tekrar gönderilmez (`unknown`), toplamı tutmayan fatura gönderilmez, iade faturası panelden elle kesilir (admin maili + `invoice.refund_manual` olayı), müşteriye fatura maili bu koddan gitmez. **BizimHesap'tan teyit bekleyen:** API kaydı e-Arşiv/e-Fatura olarak nasıl resmileşir ve müşteriye nasıl iletilir; `InvoiceNo` e-belge serisiyle çakışır mı; aynı `InvoiceNo` reddedilir mi; tutar biçimi. İlk bağlantı: `npm run test:bizimhesap`. | `src/modules/bizimhesap`, `src/lib/bizimhesap-*.ts`, `docs/DOKPLOY-ENV.md` |

## K11 — Ödenmemiş sipariş yaşam döngüsü

Şu an (Mareen ile aynı iskelet, davranışlar düzeltildi):

| Adım | Ne olur | Stok |
|---|---|---|
| `cart.complete` | Sipariş `pending`, payment session `pending_authorization`, `merchant_oid` session'da | rezerve |
| PayTR **success** | capture, `callback_processed=true` (idempotency yalnız burada) | rezerve kalır |
| PayTR **failed** | sayaç `paytr_failed_attempts` +1, `paytr_last_failed_at`; iptal YOK, kilit YOK — aynı `merchant_oid` ile 3D Secure tekrar denemesi success gelebilir | rezerve kalır |
| Süre doldu (`UNPAID_ORDER_TIMEOUT_MINUTES`, son failed'dan itibaren) | temizlik işi `cancelOrderWorkflow`; `manual_review`/`callback_processed` olan session'lara dokunmaz | serbest |
| İptalden sonra geç success / tutar farkı / siparişsiz session | otomatik iade YOK, `[KRİTİK]` mail + session `manual_review=true`; admin siparişi yeniden açar ya da PayTR panelinden iade eder (`PAYTR_CALLBACK_AUTO_REFUND=1` eski davranış) | — |
| Storefront fail sayfası "Tekrar dene" | pending snapshot'tan yeni sepet → yeni sipariş; eskisi süre dolunca iptal | geçici çift rezerv |

Hedef (açık karar, henüz yapılmadı): siparişi **success callback'te** oluşturmak (cart tamamlanmadan
PayTR oturumu açılır, callback cart'ı tamamlar). Çift sipariş ve temizlik işi ortadan kalkar; bedeli,
Medusa'nın `processPaymentWorkflow` cart-complete yolunun PayTR iframe akışıyla doğrulanması ve
"sipariş numarası ödeme öncesi görünmez" UX'idir. Mağaza açılmadan karar verilmeli; sonra sipariş
numaraları değişemez.

## PayTR dersleri (Mareen) — uygulama durumu

| Ders | Durum | Nerede |
|---|---|---|
| Callback ucu DNS'ten önce ayakta, panel URL'i önceden test | Kurulum adımı | `docs/DOKPLOY-ENV.md` Dönem B 1–3 |
| Geç success'te iade değil, uyarı + elle inceleme | **Yapıldı** (tüm tutarsız success türleri için) | `callback/route.ts` `compensateOrThrow`, `PAYTR_CALLBACK_AUTO_REFUND` |
| Failed'da yalnız sayaç; idempotency sadece success | **Yapıldı** | `callback/route.ts`, `modules/paytr/callback-state.ts`, temizlik işi |
| Sipariş–ödeme oturumu / ödenmemiş sipariş yaşam döngüsü | Belgelendi, hedef tasarım açık | K11 |
| Admin "yine de devam et" / force ile yanlış `merchant_oid` | Portta yok — admin'de `merchant_oid` yazan uç yok; eklenirse tutar + numara doğrulaması zorunlu | — |
| Env varsayılanları tuzak; boot'ta doğrulama | **Yapıldı** — prod'da `PAYTR_TEST_MODE` tanımsız / canlı+önek / canlı+mock → backend başlamaz | `modules/paytr/env-guard.ts`, `.env.template` |
| Taksitte tutar kontrolü `payment_amount` ile | **Yapıldı** (hash `total_amount`, karşılaştırma ve capture `payment_amount`) | `callback/route.ts` |
| Log'larda `[object Object]` | **Yapıldı** | `formatUnknownError`, `describeError` |

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
