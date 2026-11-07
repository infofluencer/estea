# DHL eCommerce Türkiye (Apizone) entegrasyonu

> Durum (2026-11-06): kod + birim testleri tamam (`apps/backend/src/modules/carrier/adapters/dhl/`).
> **Gerçek API henüz çağrılmadı.** Es Çay'ın kendi DHL hesabı ve Apizone uygulaması bekleniyor.
> Sırlar bu dosyaya yazılmaz.

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
- [ ] Token yanıtı `jwt` / `jwtExpireDate`
- [ ] createbarcode: `barcodes[].value` gerçekten ZPL mi, okunur `barcode` alanı geliyor mu
- [ ] 20001 ve 3002'nin HTTP kodu + gövde biçimi (sınıflandırma `errors.ts`)
- [ ] `cancelshipment` sonrası `cancelorder` gerekli mi / hata veriyor mu
- [ ] Durum yanıtı `trackingUrl` biçimi, müşteri takip sayfası
- [ ] CBS il kodları plaka koduyla aynı mı
- [ ] `createReturnOrder` `returnOrderLabelURL` ve şubede iade kabulü
- [ ] `npm run dhl:error-codes` → kataloğa göre `errors.ts` gözden geçir
- [ ] Tek paket şube kabul testi (`SMOKE_CARRIER_KEEP=1`), etiket yazıcısı (Zebra/PDF)
