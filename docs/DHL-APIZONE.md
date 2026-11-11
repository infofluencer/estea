# DHL eCommerce Türkiye (Apizone) entegrasyonu

> Durum (2026-11-11): kod + birim testleri tamam (`apps/backend/src/modules/carrier/adapters/dhl/`).
> **Sandbox'ta uçtan uca doğrulandı** (aç → barkod → durum → etiket → iptal). Canlı kimlikler bekleniyor.
> Sırlar bu dosyaya yazılmaz.

## DHL entegrasyon ekibinin yanıtı (2026-11-11)

Ekler: `ynthamzalayesayapizonedorudanapientegrasyon/` (Rest Api Detay Döküman, portal kılavuzu,
Postman koleksiyonu, örnek gövdeler). Swagger'dan yazılan adaptörle karşılaştırıldı:

- Uçlar, başlıklar, token gövdesi/yanıtı (`jwt`, `jwtExpireDate`), createOrder ve createbarcode
  alanları, yanıt biçimleri (`[ { shipmentId, invoiceId, barcodes[].value, barcodes[].barcode } ]`)
  adaptörle **aynı**. Kod değişikliği gerekmedi.
- **Sandbox çalışıyor (2026-11-11):** `npm run smoke:carrier` temiz geçti: token → createRecipient →
  createOrder → createbarcode (ilk denemede, 20001 çıkmadı) → durum (1, Gönderi Hazırlandı) → ZPL
  etiket → iptal. Test kullanıcısı DHL'in ikinci mailindeki müşteri no; kimlikler `apps/backend/.env`
  içinde (`SHIPPING_CARRIER` boş, smoke `SHIPPING_CARRIER=dhl` ile çalıştırılır).
  İlk denemedeki 401 bizim hatamızdı (kabukta `.env` okunamadı, başlıklar boş gitti), DHL kaynaklı değil.
- **Sandbox yavaş / eksik:** CBS uçları ~15 sn, Utility (`getapistatuses`, `getapierrorcodes`) DHL
  tarafında 30 sn sonra 500 "Connection request timed out". healthCheck ~77 sn, gönderi açma ~55 sn
  sürdü. Hata kodu kataloğu sandbox'tan alınamadı; canlıda tekrar denenecek. İptalden sonra
  `getorder` ve `getshipmentstatus` 404 döner.
- **Canlı kimlikler çalışıyor (2026-11-11, yalnız okuma):** Apizone uygulaması `escaydirect`, abonelikler
  onaylandı. `api.mngkargo.com.tr`: token 200, CBS 200 (~0,2 sn), Standard Query 404 (beklenen), Utility
  200. Sandbox'taki yavaşlık canlıda yok. Canlıda yazma (gönderi açma) henüz denenmedi; Standard
  Command / Barcode Command / Plus Command abonelikleri ancak ilk gerçek gönderide doğrulanır.
  Kimlik adları: canlı `DHL_*`, sandbox `DHL_SANDBOX_*` (yalnız `DHL_ENV=prod` değilken okunur).
- **Hata kodu kataloğu alındı** (`docs/dhl-apizone/error-codes.json`, 197 kod, canlıdan). Dikkat: katalogdaki
  numaralar gerçek yanıtlarla birebir örtüşmüyor. Katalog "sipariş zaten var"ı 20001 gösteriyor, ama
  sandbox'ta aynı referansla ikinci createOrder `HTTP 500 {"error":{"Code":"3002", "Description":"BU
  SİPARİS NUMARASINA AİT KAYIT ZATEN VAR!"}}` döndü (kodumuzun beklediği). Sınıflandırma koda ek olarak
  metne de bakıyor; `errors.ts` değişmedi. İptal edilmiş siparişe ikinci `cancelorder` 404 / 20305 döner.
- **Sandbox senaryo takımı (2026-11-11):** `npm run dhl:sandbox-suite` 24 adımı gerçek sandbox'ta dener
  (gönderi, tekrar, durum, etiket, iade, iptal, reship, değişim, adres çeşitleri, hata biçimleri) ve
  açtığı her kaydı iptal eder. İlk çalıştırmada 23/24; kalan adım bir hata buldu ve düzeltildi:
  **20001 createbarcode'un genel hata kodu.** "VARIŞ ŞUBESİ BULUNAMADI" da, zaten barkodlanmış siparişte
  dönen "... NO İLE DAHA ÖNCE KESİLMİŞ" de 20001 ile geliyor; ikincisi artık `already_invoiced`
  sayılıyor (gönderi no `getshipment`'tan alınır), eskiden boşuna "etiket bekliyor"a düşüyordu.
  Görülen gerçek yanıtlar: takip linki `https://kargotakip.mngkargo.com.tr/?takipNo=<gönderi no>`;
  iade etiketi linki `http://mn.tc?rtnid=…`; iptal sonrası `cancelorder` 404/20305 (yok sayılır);
  olmayan gönderi iptali 404/20306; yanlış şifre 401/20013; servis dışı satırı
  `{city, cityId, disctrictId, distirict, neighborhood}`; DHL'de olmayan ilçe ve servis dışı mahallede
  barkod 20001 "varış şubesi" ile bekliyor (60 sn içinde atanmadı).
- **Admin simülasyonu:** `npm run dhl:simulate` (sunucuda `dhl:simulate:prod`) 15 sahte siparişle her
  durumu kurar: etiket, transfer, şubede, dağıtımda, teslim, teslim edilemedi, geri geliyor, destek,
  gönderi iptali, yeniden gönderim, sipariş iptali, kargo açılamadı, iade talebi / reddi / teslim alma.
  DHL sandbox'ta gerçek sipariş + barkod açılır; sandbox gönderiyi ilerletmediği için sonraki durumlar
  kayda `dhl_sim` yazılarak verilir, adaptör bunu **yalnız sandbox'ta** okur ve gerçek yoklama kodu
  işler (mailler dahil). `-- set <sipariş no> <1-8>` tek siparişi ilerletir, `-- list`, `-- clean`.
  Kurulum: `docs/DOKPLOY-ENV.md` → "DHL sandbox simülasyonu".
- **Production simülasyonu (2026-11-11, DHL sandbox):** 15/15 senaryo kuruldu. Bulunanlar:
  1. *İade kodu kayboluyordu:* DHL iade siparişini açıp kod üretiyor, ama kod iadeye ancak müşteri
     maili gittikten sonra yazılıyordu; SMTP kapalıyken kod hiç kaydedilmedi, panel "gönderilmedi"
     dedi. Düzeltildi: kod DHL'den gelir gelmez yazılır (`return_code_source: carrier`), "gönderildi"
     işareti mailden sonra; panel "müşteriye gönderilemedi" der ve aynı kodu yeniden gönderir.
  2. *Kalıcı hatada 6 saat deneme:* telefon/adres eksikken yeniden deneme işi 12 kez deniyordu.
     Artık ilk denemede bırakır ve Logs'a "sipariş bilgisi düzeltilmeli" yazar.
  3. *Etiket bekleyen gönderide durum okunmaz:* yoklama önce barkodu dener (doğru davranış); #9
     barkod alınınca sonraki turda durumuna geçer.
- **Etiket baskısı (açık karar):** admin "Etiket yazdır" DHL ZPL'ini PDF'e ancak
  `DHL_LABEL_PDF=labelary` ile çevirir; kapalıyken DHL etiketi basılmaz, yalnız uyarılı fiş çıkar.
  Açıkken alıcı adı/adres/telefon Labelary'ye (ABD) gider. PDF sayfası 10×15 rulo içinde 74,6 mm'ye
  sığdırılıyor: 10,4 × 12 cm DHL etiketi ~%62 küçülür. DHL konveyör okuması için barkod kalitesini
  ve 10×10 rulo/lamine etiketi şart koşuyor; küçültülmüş barkod risklidir. Seçenek: ZPL'i Zebra
  uyumlu yazıcıya doğrudan basmak (DHL'in beklediği) ya da 10×10 ruloda tam boy PDF. Labelary
  boyutu artık etiketin kendi ölçüsünden (`^PW`/`^LL`) hesaplanıyor (eskiden sabit 4×6, sağ kenar kesiliyordu).
- **Akış uyarısı:** DHL, createRecipient + createOrder'ın sipariş oluşunca, createbarcode'un
  paketleme anında çağrılmasını istiyor; art arda çağrıda "varışsız" (20001) hatası olabiliyor.
  Bizde üçü ödeme sonrası art arda gider, 20001'de 60 sn denenir, sonra "etiket bekliyor" olur ve
  30 dk'lık yoklama barkodu alır (senaryo 3). Sandbox'ta 20001'in ne sıklıkta çıktığı ölçülecek.
- **Etiket 10×10 cm:** DHL kendi 10×10 rulosunu ya da lamine barkod istiyor (konveyör okuması).
  Örnek ZPL `^PW831 ^LL0959` (203 dpi → ~10,4 × 12 cm). Bizim baskı 10×15 TSC rulosuna; ZPL
  sığar ama rulo/yazıcı kararı DHL ile teyit edilmeli.
- `printReferenceBarcodeOnError`: DHL 1 öneriyor (hata olursa şubede okutulan sipariş barkodu).
  Bizde 0 (Mareen'de referans barkodlu etiket şubede kabul edilmedi). Şube testinde tekrar bakılır.
- `packagingType`: dökümanda yalnız 1/2/3 var (swagger'daki 4 "koli" yok). Biz 3 (paket) gönderiyoruz.
- Canlı için: `apizone.mngkargo.com.tr`'de üyelik → yeni uygulama → abonelikler → uygulama adı,
  müşteri no ve **statik IP** `entegrasyon@mngkargo.com.tr`'ye. Token = Online Şube müşteri no + şifre.

## Kaynaklar

- **Resmi swagger** (10 API, 46 uç): `docs/dhl-apizone/*.json`. 2026-11-06'da portaldaki ürün
  sayfalarından alındı (`apizone.mngkargo.com.tr/tr/product/<id>/api/<id>`, sayfaya gömülü
  `drupalSettings.api.explorer`). Yeniden almak için bu sayfalar çekilir.
- Saha bilgisi: Mareen (`~/Desktop/mareen/docs/DHL-DIRECT.md`, `CUTOVER.md`), açık kaynak
  `tcgunel/omniship-mng`, `metafrappe/DHL-Cargo-ERPNext`, `mohamedhekal/shipbridge-mng`.
- Hata kodu kataloğu resmi olarak yalnız API'den gelir: `npm run dhl:error-codes` →
  `docs/dhl-apizone/error-codes.json` (kimlik gelince ilk iş).
- Entegrasyon ekibi: entegrasyon.tr@dhl.com

## Hesap kurulumu (DHL'den istenecekler)

1. Es Çay (Hamzalı Çay) adına DHL eCommerce sözleşmesi → **müşteri no** + Online Şube **kalıcı** şifresi.
2. Apizone'da uygulama (sandbox: `sandbox.mngkargo.com.tr`, canlı: `apizone.mngkargo.com.tr`) →
   Client ID / Secret. Ürün abonelikleri (canlıda DHL elle onaylar):
   - Zorunlu: **Identity, Standard Command, Barcode Command, Standard Query, CBS Info**
   - Önerilen: **Plus Command** (alıcı ön kaydı, teslimat iptali), **Utility** (API durumu, hata kodları)
3. Sunucu çıkış IP'sine DHL yetkisi (Mareen'de bu olmadan barkod alınamadı).
4. İade: iade ücretinin bizde olması (alıcı öder, `paymentType 2`) için DHL onayı; istenirse sabit iade kodu.

## Uçlar (kullandıklarımız)

| Ürün | Uç | Ne için |
|---|---|---|
| Identity | `POST /token` `{customerNumber,password,identityType:1}` → `jwt`, `jwtExpireDate` | JWT (~8 sa), önbellek |
| Plus Command | `POST pluscmdapi/createRecipient` | alıcı ön kaydı (şube çözümü hızlanır), isteğe bağlı |
| Standard Command | `POST standardcmdapi/createOrder` | sipariş (alıcı: `fullName`, `cityCode`, `districtCode`, `address`, telefon) |
| Barcode Command | `POST barcodecmdapi/createbarcode` → `shipmentId`, `barcodes[].value` (ZPL) | faturalaştır + etiket |
| Barcode Command | `PUT barcodecmdapi/cancelshipment` `{referenceId, shipmentId}` | barkodlu gönderi iptali |
| Standard Command | `PUT standardcmdapi/cancelorder/{ref}` | sipariş iptali |
| Standard Command | `POST standardcmdapi/createReturnOrder` → `returnOrderLabelURL` | kodlu iade (gönderici = müşteri) |
| Standard Query | `GET getshipmentstatus/{ref}`, `getshipmentstatusByShipmentId/{id}` | durum + `trackingUrl` |
| Standard Query | `GET getorder/{ref}`, `getshipment/{ref}` | belirsiz yazmaların kontrolü |
| CBS Info | `getcities`, `getdistricts/{il}`, `getoutofserviceareas/{il}/{ilçe}`, `getmobileareas/{il}/{ilçe}` | kodlar + servis bölgesi |
| Utility | `getapistatuses`, `getapierrorcodes` | sağlık, katalog |

Başlıklar: `X-IBM-Client-Id`, `X-IBM-Client-Secret`, `Authorization: Bearer <jwt>`.
Host: sandbox `https://testapi.mngkargo.com.tr`, canlı `https://api.mngkargo.com.tr`, önek `/mngapi/api/`.

Enum'lar: `shipmentServiceType` 1 standart / 7 gün içi / 8 akşam · `packagingType` 1 dosya / 2 mi / 3 paket / 4 koli ·
`paymentType` 1 gönderen / 2 alıcı · `deliveryType` 1 adrese / 2 alıcısı haberli (şubeden).
Durum kodu: 1 Hazırlandı · 2 Transfer · 3 Teslimat biriminde · 4 Adrese yönlendirildi · 5 Teslim edildi ·
6 Teslim edilemedi · 7 Geri geliyor · 8 Destek gerekiyor.

Kimlik/sabitler: referans büyük harf alfasayısal ≤20 (`ESC-65` → `ESC65`), sipariş `barcode` = referans,
parça barkodu `ESC65_PARCA1`, desi/kg tam sayı ≥1, telefon 10 hane (5xx → cep, değilse ev),
`customerId` ile `fullName` birlikte gönderilmez, `printReferenceBarcodeOnError: 0`
(referans barkodlu etiket şubede kabul edilmedi — Mareen 13.10).

## Senaryolar ve davranış

| # | Senaryo | Davranış | Test |
|---|---|---|---|
| 1 | Normal gönderi | createRecipient → createOrder → createbarcode; takip no = gönderi no; ZPL `label_zpl` | ✓ |
| 2 | createRecipient aboneliği yok / hata | uyarı, gönderi devam | ✓ |
| 3 | **20001** varış şubesi yok | aynı referansla 10 sn arayla ≤60 sn; sonra **"etiket bekliyor"** (hata değil), yoklama 30 dk'da bir barkodu dener | ✓ |
| 4 | Etiket 2 saattir alınamıyor | Logs'a hata (adres/ilçe DHL'de eşleşmiyor olabilir → DHL entegrasyon) | ✓ |
| 5 | **3002** sipariş zaten var | barkoda geçer, ikinci kayıt yok | ✓ |
| 6 | createOrder zaman aşımı / 5xx | POST tekrarlanmaz; `getorder` → varsa devam, yoksa hata (sonraki deneme güvenli) | ✓ |
| 7 | createbarcode zaman aşımı / "zaten faturalaşmış" | `getshipment` → gönderi no; ZPL kayıp → `dhl_label_missing`, etiket Online Şube'den | ✓ |
| 8 | DHL alan doğrulaması (400) | alan adıyla anlaşılır hata (ASP.NET `errors` sözlüğü okunur) | ✓ |
| 9 | Telefon/adres eksik | DHL'e gitmeden `DHL_INVALID_RECIPIENT` | ✓ |
| 10 | CBS erişilemez | il = plaka kodu, ilçe 0 + adlar | ✓ |
| 11 | İl adı "İSTANBUL 34" biçiminde | plaka eki atılarak eşleşir | ✓ |
| 12 | Servis dışı mahalle | `DHL_OUT_OF_SERVICE=branch`: alıcı şubeden alır (deliveryType 2); `block`: gönderi açılmaz | ✓ |
| 13 | Mobil bölge | yalnız `dhl_service_area: mobile` | ✓ |
| 14 | Reship (iptal + yeniden aç) | iptal edilmiş referans kullanılmaz: `ESC65R2`, `ESC65R3`… | ✓ |
| 15 | Değişim gönderisi | `ESC-65-D` → `ESC65D` | ✓ |
| 16 | Prod + test modu | gönderi/iade açılmaz; okuma serbest | ✓ |
| 17 | Kimlik eksik | `DHL_CONFIG` | ✓ |
| 18 | JWT süresi doldu (401) | bir kez yenile, tekrar | ✓ |
| 19 | Abonelik yok (401 "valid subscription") | yenileme yok; hangi ürün olduğu mesajda | ✓ |
| 20 | 403 | IP yetkisi ipucu | ✓ |
| 21 | 20013 | sandbox/prod anahtar karışması ipucu | ✓ |
| 22 | Yanlış müşteri no/şifre | Online Şube kalıcı şifre ipucu | ✓ |
| 23 | Okuma 5xx / 429 / ağ | bir kez tekrar | ✓ |
| 24 | Durum 2–4 | `shipped` → "Kargoya verildi" maili (bir kez) | ✓ |
| 25 | Durum 5 / `isDelivered=1` | `delivered` → "Teslim edildi" maili; teslim alan kayda | ✓ |
| 26 | Durum 6 / 8 | `failed` → Logs hata; 8'de "Online Şube → teslimat problemleri" | ✓ |
| 27 | Durum 7 / `retrieveShipmentId` | `returned` → Logs uyarı | ✓ |
| 28 | Durum sorgusu 404 | hata değil; Logs uyarı (iptal/barkodsuz olabilir) | ✓ |
| 29 | DHL `trackingUrl` | kayıttaki takip linki onunla değişir | ✓ |
| 30 | Dış gönderi (şubede açılmış) | gönderi no ile sorgu; API'den iptal edilmez | ✓ |
| 31 | İptal, barkodsuz | `cancelorder`; DHL'de yoksa iptal sayılır | ✓ |
| 32 | İptal, barkodlu | `cancelshipment` → `cancelorder` | ✓ |
| 33 | İptal reddedildi (şube kabul etti / gün geçti) | Strict (reship) fırlatır, kayıt değişmez; normal iptal uyarıyla geçer | ✓ |
| 34 | Etiket ZPL / PDF | ZPL doğrudan; PDF yalnız `DHL_LABEL_PDF=labelary` | ✓ |
| 35 | Etiket yok (bekliyor / kayıp) | nedenini söyleyen hata | ✓ |
| 36 | Kodlu iade | `createReturnOrder`, gönderici müşteri, ücret bizde (2); kod = iade referansı; etiket linki mailde | ✓ |
| 37 | Aynı iade tekrar | 3002 → aynı kod | ✓ |
| 38 | Eski/dış gönderiye iade | alıcı özeti yok → elle kod | ✓ |
| 39 | Sağlık kontrolü | token + CBS + Standard Query (404 beklenen) + API durumları; abonelik eksikse `ok=false` | ✓ |

### Bilerek yapılmayanlar
- **Checkout ücreti** (`standardqueryapi/calculate`): K4 sabit 149,90 TL; hesap için ilçe kodu + adres
  gerekir, checkout teklif anında yok.
- **Teslimat problemine yanıt** (`answerShipmentDeliveryProblem`) ve **kabul edilmiş gönderinin
  geri çağrılması** (`cancelOrderDelivery`): istemcide uç var, admin ekranı yok; Online Şube'den.
- Kapıda ödeme, pazaryeri, akşam/gün içi teslim: kullanılmıyor.

## Teyit listesi (ilk sandbox çalıştırması: `npm run smoke:carrier`)
- [x] Token yanıtı `jwt` / `jwtExpireDate` (sandbox 2026-11-11)
- [x] createbarcode: `barcodes[].value` gerçekten ZPL mi, okunur `barcode` alanı geliyor mu (sandbox 2026-11-11)
- [x] 20001 ve 3002'nin HTTP kodu + gövde biçimi (sınıflandırma `errors.ts`) (ikisi de HTTP 500 `{error:{Code,Message,Description}}`)
- [x] `cancelshipment` sonrası `cancelorder` gerekli mi / hata veriyor mu (gerekmiyor: 404/20305 döner, yok sayılır)
- [x] Durum yanıtı `trackingUrl` biçimi, müşteri takip sayfası (kargotakip.mngkargo.com.tr/?takipNo=)
- [x] CBS il kodları plaka koduyla aynı mı (sandbox 2026-11-11)
- [ ] `createReturnOrder` `returnOrderLabelURL` (sandbox'ta geliyor: `http://mn.tc?rtnid=…`) ve şubede iade kabulü
- [x] `npm run dhl:error-codes` → kataloğa göre `errors.ts` gözden geçir (2026-11-11; 3002 sandbox'ta doğrulandı, 20001 varış şubesi hâlâ görülmedi)
- [ ] Tek paket şube kabul testi (`SMOKE_CARRIER_KEEP=1`), etiket yazıcısı (Zebra/PDF)
