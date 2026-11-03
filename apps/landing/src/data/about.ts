/**
 * Hakkımızda sayfası. Olgular esteacay.com'un Hakkımızda ve Fabrikamız
 * sayfalarından (Wayback, 2022): 2019'da Hayrat'ta kuruluş, günde 150 ton
 * yaş çay işleme, Karadeniz'in en yüksek rakımlı çay fabrikası (markanın
 * kendi iddiası), koruyucu ve katkı yok. Adres mağazanın iletişim sayfasından.
 */
export const aboutPage = {
  title: 'Çayın lezzetine inandık.',
  lead: 'Esçay 2019’da Trabzon’un Hayrat ilçesinde, çay bahçelerinin ortasında kuruldu. Yaprak yüksek Karadeniz bahçelerinden gelir, aynı gün hatta girer, katkısız harmanlanır.',
  body: 'Marka, yıllardır çay yetiştiren bir ailenin bahçeleri ve kültürü üzerine kuruldu; amacı çayı doğasından bardağa en taze hâliyle, hızla ulaştırmak. Kışı kar altında geçen yamaçlarda yavaş büyüyen yaprak; boya yok, aroma yok, koruyucu yok. Yalnızca yaprak, ustalık ve zaman.',
  photo: { src: '/hakkimizda/fabrika.jpg', mobile: '/hakkimizda/fabrika-k.jpg', alt: 'Çay bahçelerinin ortasındaki Esçay fabrikası, yüksekten', caption: 'Esçay fabrikası, Hayrat. Bahçeler kapıya kadar gelir.', focus: '30% 50%' },
  cta: { label: 'Harmanları görün', href: '/harmanlar' },
}

/** Fabrika: bahçeden fabrikaya aynı gün, hat, sevkiyat. İddialar fotoğraf brief'indeki karelerle sınırlı. */
export const factory = {
  title: 'Bahçenin içindeki fabrika',
  lead: 'Fabrika Hayrat’ta, Karadeniz’in en yüksek rakımlı çay bölgesinde. Günde 150 ton yaş çay işler; toplanan yaprak bekletilmeden hatta girer, paketlenen çay aynı gün yola çıkar.',
  body: 'Üretimin her adımı tek çatı altında: yaprak soldurulur, kıvrılır, kurutulur ve elenir; her parti tadımdan geçer, ölçüyü tutmayan harmana girmez. Onaylanan çay ışık, hava ve nemden koruyan paketlere konur ve kolilenir. Bahçeler kışı kar altında geçirir; kar yemiş çay denir.',
  photos: [
    { src: '/hakkimizda/uretim-hatti.jpg', mobile: '/hakkimizda/uretim-hatti-k.jpg', alt: 'Üretim hattında bantlardan akan taze çay yaprağı', caption: 'Taze yaprak hatta.' },
    { src: '/hakkimizda/raf.jpg', mobile: '/hakkimizda/raf-k.jpg', alt: 'Açık kolide dizili Esçay paketleri', caption: 'Paketler kolide.' },
    { src: '/hakkimizda/sevkiyat.jpg', mobile: '/hakkimizda/sevkiyat-k.jpg', alt: 'Esçay kolileri sevkiyat için tıra yükleniyor', caption: 'Koliler aynı gün yola çıkar.' },
  ] as const,
}
