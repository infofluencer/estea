# İade (RMA) — Manuel checklist

Otomatik suite'lerin kapsamadığı doğrulamalar. Gerçek para / gerçek inbox / admin UI.

## PayTR (mock dışı — son doğrulama)

- [ ] Sandbox varsa sandbox'ta; yoksa **en düşük fiyatlı** üründe tek gerçek işlem + refund
- [ ] PayTR panelinde iade görünüyor; tutar birebir (iade API **TL string**, get-token kuruş)
- [ ] Kısmi refund canlıda doğru tutar (tek kalem ≠ tüm sipariş)

## Admin UI (insan-in-the-loop)

- [ ] Admin'de return **received** işaretleme akışı çalışıyor
- [ ] Refund / onay öncesi **received zorunlu** (yarı-otomatik korunuyor)
- [ ] Refund **failed** durumu metadata/admin'de görünüyor + `POST /admin/returns/:id/refund` ile retry

## Storefront E2E (gözle)

- [ ] Üye: OrderDetail → iade talebi → onay + iade no + kargo adresi (künye)
- [ ] Misafir: order-lookup → iade talebi, aynı akış
- [ ] Account'ta iade durumu; sekmeler (Pano / Siparişler / Adresler / Detaylar / Favoriler) bozulmadı
- [ ] Tasarım: `.page-shell` / `.cart-cta` / auth-form / OrderDetail bozulmadan entegre
- [ ] Mobilde form ve onay ekranı düzgün

## Mail (gerçek teslim)

- [ ] Talep alındı → müşteri inbox (spam değil, Türkçe karakter OK)
- [ ] Yeni talep → info@esteacay.com (veya `RETURNS_INBOX`)
- [ ] Refund tamamlandı → müşteri; tutar + ödeme aracına iade ifadesi
- [ ] Refund fail sonrası müşteriye "iadeniz onaylandı" maili **gitmedi**

## Rate-limit / IP (proxy)

- [ ] Prod'da gerçek client IP CDN/proxy'den geliyor; `x-forwarded-for` spoof'a karşı güvenilir hop kullanılıyor

## Politika & build

- [ ] `/legal/iade-ve-cayma` yeni RMA akışını anlatıyor; dilekçe/irsaliye dili yok
- [ ] 14 gün cayma + kargo ayrımı (ayıplı satıcı / diğer alıcı) + 6502 atıfları duruyor
- [ ] `tsc` temiz, backend + storefront build geçiyor

## Satıcı künye (mail + UI)

Adres: VENİME TEKSTİL — Osmaniye Mah. İsmail Erez Blv. Birlik Apt. 17/4 Bakırköy/İstanbul  
Ops: info@esteacay.com
