# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Karışık kitle; tek bir birincil segment seçilmedi (kullanıcı teyidi: "hepsi karışık"):

- Evde günlük demlik çayı içen aileler; 500 g / 1000 g / 5000 g dökme çayı online alır.
- Kafe, ofis ve toplu tüketim yapan işletmeler; büyük paket (5000 g dökme, 6000 g demlik süzen poşet) ve tekrar sipariş.
- Karadeniz çayını memleketten isteyen gurbetçiler ve hediye gönderenler.

Ayrı bir B2B/bayi akışı yok; herkes aynı B2C mağazadan alır.

## Product Purpose

Es Çay, Hamzalı Çay'ın (Hayrat / Trabzon) kendi ürettiği Karadeniz çaylarını doğrudan tüketiciye satar.

- `esteacay.com` (apps/landing): marka ve hikâye; bahçe → fabrika → bardak anlatısı, ürün hattına yönlendirme.
- `market.esteacay.com` (apps/frontend, Medusa backend): katalog, sepet, PayTR ödeme, hesap, sipariş takibi, iade/değişim.

Başarı: ziyaretçinin landing'den mağazaya geçip sipariş vermesi ve tekrar sipariş vermesi.

## Positioning

Kullanıcının teyit ettiği iddiaların hepsi geçerli:

- **Kendi fabrikası, bahçelerin içinde.** Hamzalı Çay Gıda Tur. ve İnş. A.Ş., Hayrat / Trabzon; yaprak bahçeden bardağa tek elden geçer.
- **Katkısız harman.** Boya yok, aroma yok; yalnızca yaprak.
- **Yüksek rakım bahçeleri.** Kışı kar altında geçen Doğu Karadeniz yamaçları.
- **Harman çeşitliliği.** Gold, İlk Hasat, Tiryaki, Karadeniz: her içim tercihine bir harman.

## Operating Context

- Türk demlik çayı kültürü: çaydanlık/demlik, ince belli bardak, "tavşan kanı" renk, gün boyu içim, kalabalık sofralar.
- Hasat mayıs–ekim, yılda üç sürgün; İlk Hasat mayıs sürgünüdür.
- Alışveriş büyük ölçüde mobilde; ödeme PayTR iFrame ile, havale/EFT şu an kapalı.
- Kargo elle yönetilir (firma seçilmedi); sabit 149,90 TL, ücretsiz kargo eşiği yok (geçici, K1/K4).

## Capabilities and Constraints

**Ürün hattı** (kaynak: `apps/backend/data/wc-products.csv`, mağazaya aktarılan katalog):

| Hat | Ürünler |
|---|---|
| Dökme çay | Gold Karadeniz (500 / 1000 / 5000 g), İlk Hasat (500 / 1000 / 5000 g), Karadeniz (500 / 1000 / 5000 g), Tiryaki (500 / 1000 g) |
| Demlik süzen poşet | Süzen Poşet (2000 g, 6000 g), Earl Grey (1050 g, 6000 g) |
| Bitki çayı (bardak poşet) | Böğürtlen, Ihlamur, Kuşburnu, Melisa, Yeşil Çay, Nane Limon, Papatya, Rezene |
| Şeker | Küp Şeker 1000 g, Tek Sargılı Küp Şeker 5000 g |

Bazı varyantlar stokta değil; fiyat ve stok her zaman backend'den okunur, arayüze sabit yazılmaz.

Mağaza kategorileri (seed): Siyah Çay, Yeşil Çay, Bitki Çayı, Harmanlar, Hediye, Şeker; koleksiyonlar: Yeni, Çok Satanlar.

**Kısıtlar ve açık kararlar** (ayrıntı: `docs/ESCAY-KARARLAR.md`):

- Yalnız Türkçe, yalnız Türkiye (K9).
- KDV %1 varsayımı, mali müşavir teyidi bekliyor (K2).
- İade/değişim yasal metni taslak; gıda istisnası hukukçu onayı bekliyor (K5).
- Kargo firması belli değil (K1); kargo takip arayüzü firmaya bağlı kalmamalı.
- Kurumsal e-posta `info@esteacay.com` yer tutucu (K8).
- MERSİS, vergi no ve KVKK sorumlusu bilgisi yok; yasal sayfalarda uydurulmaz.

## Brand Commitments

- Marka adı yazımı karışık: landing'de "Esçay", katalogda "ES tea / Es tea", domain `esteacay`, repo "Es Çay". Kanonik yazım **henüz kararlaştırılmadı**; yeni metinde mevcut yüzeyin yazımı korunur.
- Dil: sade, sıcak Türkçe; iddialar esteacay.com'un söylediği kadar (yüksek bahçe, kar altında kış, özenle toplanan yaprak, katkısız).
- Şirket künyesi: Hamzalı Çay Gıda Tur. ve İnş. A.Ş. · Balaban Mah. Uğurlu Cad. No: 9, Merkez, Hayrat / Trabzon · 0462 692 30 61 · Instagram/Facebook `esteacay`.
- Logo ve vektör: `apps/landing/public/logo.png`, `assets/escay_vector.webp`.
- **Mağaza (apps/frontend) kurumsal kategori standardında** (kullanıcı kararı, 2026-10-29): beyaz zemin, tam genişlik navbar, fotoğraf slider'lı hero, kategoriye yönlendiren ürün alanları. Kıyas: Doğuş Çay / Doğadan ve Çaykur mağazaları; ama onlar "çok yetersiz", kopyalanmaz, işçilikte geçilir. Landing (apps/landing) kendi görünümünde kalır.

## Evidence on Hand

- Gerçek ürün paketi fotoğrafları: `apps/landing/public/estea-*.png`.
- Bahçe, hasat, işleme, kalite kontrol ve paketleme fotoğrafları: `apps/landing/public/fabrika/`, `assets/escay-site-fotograflari*/` (git dışı).
- Hero videosu ve afiş: `assets/escay_web.mp4`, `apps/landing/public/hero_scrub.mp4`, `hero_poster.*`.
- Çekim briefleri: `assets/es-cay-fotograf-brief.pdf`, `assets/es-cay-hero-video-brief.pdf`.
- Katalog açıklamaları (WooCommerce'ten): `apps/backend/data/wc-products.csv`.

**Yok, uydurulmaz:** müşteri yorumları, puanlar, satış/müşteri rakamları, ödül veya sertifika, basın. Landing'deki tat notları ve sertlik dereceleri (`apps/landing/src/data/content.ts`) **taslak**, teyit edilmedi.

## Product Principles

1. **Yaprağın gerçek yolu.** Bahçe ve fabrika gerçek, fotoğraflar gerçek; anlatı bunun üstüne kurulur, süslenmiş iddia eklenmez.
2. **Her içime bir harman.** Ziyaretçi kendi içim alışkanlığından (hafif / orta / sert, ev / kalabalık sofra) doğru pakete hızla ulaşmalı.
3. **Tekrar siparişi kolaylaştır.** Çay tükenen bir ürün; büyük paket ve yeniden alım akışları birinci sınıf.
4. **Doğrulanmamış olanı söyleme.** Fiyat, stok, yasal ve ticari bilgiler tek kaynaktan (backend, `docs/ESCAY-KARARLAR.md`) gelir; kararı verilmemiş şey arayüzde kesinmiş gibi görünmez.
