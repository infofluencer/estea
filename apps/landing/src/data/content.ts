/**
 * Landing copy & data. Everything here is a DRAFT — placeholder metin,
 * gerçek değerlerle (tat notları, yorumlar, rakamlar) değiştirilmeli.
 */

export const hero = {
  title: 'Çayın lezzeti doğadan',
  /* Claims as esteacay.com states them: high-altitude gardens, snow in winter, sun in summer, leaves picked with care. */
  lead: 'Kışı kar altında, yazı güneşte geçen yüksek rakımlı Karadeniz bahçelerinden özenle seçilip toplanan yaprak.',
  cta: 'Harmanları keşfet',
}

export const about = {
  title: 'Çayın lezzetine inandık.',
  lead: 'Rize ve Artvin’in yüksek bahçelerinden gelen yaprağı katkısız harmanlıyoruz. Sisin geç kalktığı yamaçlarda yavaş büyüyen yaprak, aceleye getirilmeden demlenince kendini gösterir.',
  body: 'Boya yok, aroma yok; yalnızca yaprak, ustalık ve zaman. Çünkü iyi çay, bekleyeni ödüllendirir.',
  link: 'Esçay’ı yakından tanıyın',
  /** Three plain facts under the copy, each with a brand doodle. */
  points: [
    { icon: 'sprig', label: 'Yüksek bahçe yaprağı' },
    { icon: 'teapot', label: 'Katkısız harman' },
    { icon: 'glass', label: 'Tavşan kanı demleme' },
  ] as const,
  photoCaption: 'Rize, mayıs. İlk sürgün toplanıyor.',
}

export const collection = {
  title: 'Her ana ayrı bir harman.',
  cta: 'Ürüne git',
  /** Running band above the collection. */
  taglines: [
    'Katkısız, yüzde yüz Karadeniz',
    'Rize ve Artvin bahçelerinden',
    'Tavşan kanı demlik çayı',
    'Üç sürgün, beş karakter',
    'Yapraktan bardağa',
  ],
}

/** Pack colour family; drives the glow under each pack in the collection scene. */
export type Tone = 'gold' | 'leaf' | 'brand' | 'sun'

export type Product = {
  slug: string
  tone: Tone
  /** Headline shown above the carousel while this pack is active. */
  headline: string
  name: string
  line: string
  weight: string
  note: string
  strength: string
  image: string
  href: string
}

export const products: Product[] = [
  {
    slug: 'gold-1000',
    headline: 'Yüksek bahçelerin altın harmanı.',
    tone: 'gold',
    name: 'Gold Karadeniz',
    line: 'Gold Serisi',
    weight: '1000 g',
    note: 'Yüksek rakım bahçelerinden. Koyu demli, yuvarlak gövdeli, tatlı bitişli.',
    strength: 'Orta',
    image: '/estea-gold-cay-1000-gr.png',
    href: 'https://market.esteacay.com/u/estea-gold-cay-1000-gr/',
  },
  {
    slug: 'ilk-hasat',
    headline: 'Mayısın ilk sürgünü, bardağında.',
    tone: 'leaf',
    name: 'İlk Hasat',
    line: 'Mevsim Serisi',
    weight: '1000 g',
    note: 'Mayıs sürgünü. Daha açık, çiçeksi ve taze; sabah çayı için.',
    strength: 'Hafif',
    image: '/estea-hasat-cay-1000-gr.png',
    href: 'https://market.esteacay.com/u/es-tea-ilk-hasat-cay-5000-gr/',
  },
  {
    slug: 'tiryaki',
    headline: 'Sert içenlerin vazgeçilmezi.',
    tone: 'brand',
    name: 'Tiryaki',
    line: 'Klasik Seri',
    weight: '1000 g',
    note: 'Sert içim, uzun demlemeye dayanıklı. Gün boyu süren çay için.',
    strength: 'Sert',
    image: '/estea-tiryaki-1000-gr-cay.png',
    href: 'https://market.esteacay.com/u/es-tea-tiryaki-cayi-1000-gr/',
  },
  {
    slug: 'karadeniz',
    headline: 'Her günün çayı, evin çayı.',
    tone: 'sun',
    name: 'Karadeniz',
    line: 'Klasik Seri',
    weight: '1000 g',
    note: 'Her gün içilen, dengeli demlik çayı. Evin çayı.',
    strength: 'Orta',
    image: '/estea-karadeniz-cayi-1000-gr.png',
    href: 'https://market.esteacay.com/u/estea-karadeniz-cay-1000-gr/',
  },
  {
    slug: 'gold-5000',
    headline: 'Kalabalık sofralara Gold.',
    tone: 'gold',
    name: 'Gold Karadeniz',
    line: 'Gold Serisi · Aile boyu',
    weight: '5000 g',
    note: 'Aynı Gold harmanı, kalabalık sofralar için büyük paket.',
    strength: 'Orta',
    image: '/estea-gold-cay-5000-gr.png',
    href: 'https://market.esteacay.com/u/estea-gold-cay-5000-gr/',
  },
]

/**
 * The journey as a drawn path from the garden to the glass. Each stop's disc
 * takes the colour the leaf has at that step: fresh green to tavşan kanı.
 * General black-tea making; brand claims only as esteacay.com states them.
 */
export const journey = {
  title: 'Bahçeden bardağa',
  lead: 'Kışı kar altında geçen yüksek bahçeden demliğe: bir yaprağın yeşilden tavşan kanına yolculuğu.',
  stops: [
    { icon: 'sprig', verb: 'Topla', body: 'Taze sürgün, özenle seçilip toplanır.', disc: '#92c700', ink: '#111111' },
    { icon: 'wilted', verb: 'Soldur', body: 'Yaprak serilir, nemini bırakıp yumuşar.', disc: '#759f11', ink: '#111111' },
    { icon: 'curl', verb: 'Kıvır', body: 'Kıvrılan yaprağın öz suyu yüzeye çıkar.', disc: '#e9ba3c', ink: '#111111' },
    { icon: 'leaf', verb: 'Beklet', body: 'Havayla buluşan yaprak bakıra döner.', disc: '#d05a20', ink: '#f8f8f8' },
    { icon: 'heat', verb: 'Kurut', body: 'Sıcak havada koyulaşır, aroması içinde kalır.', disc: '#b43317', ink: '#f8f8f8' },
    { icon: 'glass', verb: 'Demle', body: 'Bardakta tavşan kanı rengini alır.', disc: '#eef6dc', ink: '#b43317' },
  ] as const,
}

/**
 * Short history of tea on the Black Sea coast, ending with Esçay today.
 * Dates checked against public sources (laws 407/1924, 3788/1940, 3092/1984;
 * first Rize factory usually given as 1947, some sources say 1946).
 * Esçay's own founding year is not published, so its line says "Bugün".
 */
export const history = {
  title: 'Rize’de bir asırlık çay',
  lead: 'Karadeniz’in yamaçlarına çay yüz yıl önce geldi. Esçay bu yamaçlarda büyüyen yaprakla demleniyor.',
  entries: [
    { when: '1924', title: 'İlk adım', body: 'Rize ve Borçka’da çay yetiştirilmesi için ilk kanun çıkar.' },
    { when: '1940', title: 'Bahçeler büyür', body: 'Çay Kanunu ile üretici desteklenir, yamaçlar çay bahçesine döner.' },
    { when: '1947', title: 'İlk fabrika', body: 'Rize’de ilk çay fabrikası açılır; yaprak artık bahçenin yanında işlenir.' },
    { when: '1984', title: 'Yeni harmanlar', body: 'Çay işlemek özel sektöre açılır; Karadeniz’de yeni markalar doğar.' },
    { when: 'Bugün', title: 'Esçay', body: 'Rakımı yüksek Karadeniz bahçelerinden özenle seçilen yaprak, Esçay harmanında bardağa gelir.' },
  ],
}

/** Posts from esteacay.com/blog (titles, links and dates as published there). */
export const blog = {
  title: 'Çay üzerine',
  lead: 'Karadeniz çayı, demleme ve harmanlar üzerine yazılar.',
  all: { label: 'Tüm yazılar', href: 'https://esteacay.com/blog/' },
  posts: [
    { title: 'Karadeniz Usulü Çay Nasıl Demlenir?', href: 'https://esteacay.com/elementor-3218/', date: '25 Ocak 2022', icon: 'teapot', disc: 'bg-brand text-cream' },
    { title: 'Türkiye’de Yerli İlk Çay Üretimi', href: 'https://esteacay.com/turkiye-de-yerli-ilk-cay-uretimi/', date: '17 Şubat 2022', icon: 'hills', disc: 'bg-leaf text-ink' },
    { title: 'Dökme Çayın Püf Noktaları Nelerdir?', href: 'https://esteacay.com/dokme-cayin-puf-notlari-nelerdir/', date: '10 Şubat 2022', icon: 'leaf', disc: 'bg-amber text-cream' },
    { title: 'Sütlü Çay Nedir? Nasıl Yapılır?', href: 'https://esteacay.com/sutlu-cay-nedir-nasil-yapilir/', date: '30 Kasım 2021', icon: 'glass', disc: 'bg-brand text-cream' },
    { title: 'Earl Grey Çay Nedir?', href: 'https://esteacay.com/earl-grey-cay-nedir/', date: '10 Aralık 2021', icon: 'curl', disc: 'bg-olive text-ink' },
    { title: 'Formda Tutan Çaylar: Bitki Çayları', href: 'https://esteacay.com/formda-tutan-caylar-bitki-caylari/', date: null, icon: 'sprig', disc: 'bg-leaf text-ink' },
  ] as const,
}

/** Contact details as published on market.esteacay.com/iletisim. */
export const contact = {
  title: 'Bize ulaşın',
  lead: 'Siparişiniz, sorunuz ya da bir öneriniz mi var? Hafta içi müşteri hizmetlerimiz sizi dinliyor.',
  phone: { label: '0462 692 30 61', href: 'tel:+904626923061' },
  hours: 'Hafta içi 09.00–18.00',
  address: ['Balaban Mah. Uğurlu Cad. No: 9', 'Merkez, Hayrat / Trabzon'],
  mapHref: 'https://www.google.com/maps/search/?api=1&query=Balaban+Mah.+U%C4%9Furlu+Cad.+No%3A9+Hayrat+Trabzon',
  socials: [
    { label: 'Instagram', href: 'https://www.instagram.com/esteacay/' },
    { label: 'Facebook', href: 'https://www.facebook.com/esteacay/' },
  ],
  company: 'Hamzalı Çay Gıda Tur. ve İnş. A.Ş.',
}
