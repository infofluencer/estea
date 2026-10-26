/**
 * Landing copy & data. Everything here is a DRAFT — placeholder metin,
 * gerçek değerlerle (tat notları, yorumlar, rakamlar) değiştirilmeli.
 */

export const hero = {
  /** Başlık: "<brand> <title>" tek akışta; marka altın renkte. */
  brand: 'Esçay’ın',
  title: 'lezzeti doğadan',
  /* Claims as esteacay.com states them: high-altitude gardens, snow in winter, sun in summer, leaves picked with care. */
  lead: 'Kışı kar altında, yazı güneşte geçen yüksek Karadeniz bahçelerinden özenle toplanan yaprak. Katkısız harman, her yudumda Karadeniz.',
  cta: 'Harmanları keşfet',
}

export const about = {
  title: 'Çayın lezzetine inandık.',
  lead: 'Karadeniz’in yüksek rakımlı bahçelerinden gelen yaprağı katkısız harmanlıyoruz. Sisin geç kalktığı yamaçlarda yavaş büyüyen yaprak, aceleye getirilmeden demlenince kendini gösterir.',
  body: 'Boya yok, aroma yok; yalnızca yaprak, ustalık ve zaman. Çünkü iyi çay, bekleyeni ödüllendirir.',
  link: 'Esçay’ı yakından tanıyın',
  /** Three plain facts under the copy, each with a brand doodle. */
  points: [
    { icon: 'sprig', label: 'Yüksek bahçe yaprağı' },
    { icon: 'teapot', label: 'Katkısız harman' },
    { icon: 'glass', label: 'Tavşan kanı demleme' },
  ] as const,
  photoCaption: 'Esçay fabrikası, çay bahçelerinin içinde.',
}

export const collection = {
  title: 'Her ana ayrı bir harman.',
  cta: 'Ürüne git',
  /** Running band above the collection. */
  taglines: [
    'Katkısız, yüzde yüz Karadeniz',
    'Karadeniz’in yüksek bahçelerinden',
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
 * The journey from garden to glass. Each stop carries the colour the leaf has
 * at that step, fresh green through gold to tavşan kanı, each dark enough to
 * read as a heading on linen.
 * `icon` names a brand doodle for the overview row; `facts` are the two
 * short entries under each spread's note.
 * General black-tea making; brand claims only as esteacay.com states them.
 */
export const journey = {
  title: 'Bahçeden bardağa',
  lead: 'Kışı kar altında geçen yüksek bahçeden demliğe: yaprağın Esçay fabrikasından geçerek bardağa gelen yolu.',
  /** Fotoğraflar: Esçay bahçe ve fabrika çekimleri (public/fabrika). */
  stops: [
    {
      verb: 'Yetiştir',
      icon: 'hills',
      body: 'Yüksek rakımlı Karadeniz bahçelerinde yaprak yavaş büyür.',
      detail:
        'Bol yağış, serin hava ve asitli toprak çay bitkisinin aradığı her şeyi verir. Kışı kar altında dinlenerek geçiren bahçeler ilkbaharda yavaş ama dolgun sürgün verir; yaprağın karakteri burada oluşur.',
      facts: [
        { term: 'Bölge', value: 'Doğu Karadeniz yamaçları' },
        { term: 'Kış', value: 'Kar altında doğal dinlenme' },
      ],
      color: '#3f6f0e',
      image: '/fabrika/cay-bahceleri.jpg',
    },
    {
      verb: 'Topla',
      icon: 'sprig',
      body: 'Taze sürgün, mevsiminde özenle seçilip toplanır.',
      detail:
        'Çay bitkisi yılda üç kez sürgün verir. Yaprak en körpe hâlindeyken toplanır ve tazeliğini kaybetmeden, bekletilmeden fabrikaya ulaştırılır.',
      facts: [
        { term: 'Hasat', value: 'Mayıs – Ekim' },
        { term: 'Sürgün', value: 'Yılda üç dönem' },
      ],
      color: '#557f10',
      image: '/fabrika/cay-hasadi.jpg',
    },
    {
      verb: 'İşle',
      icon: 'curl',
      body: 'Yaprak fabrikada soldurulur, kıvrılır ve kurutulur.',
      detail:
        'Soldurma yaprağın nemini azaltır, kıvırma özsuyunu açığa çıkarır. Havayla buluşan yaprak oksitlenip koyulaşır; kurutma bu rengi ve aromayı yaprağa sabitler.',
      facts: [
        { term: 'Aşamalar', value: 'Soldurma, kıvırma, oksidasyon, kurutma' },
        { term: 'Yer', value: 'Esçay fabrikası' },
      ],
      color: '#86700f',
      image: '/fabrika/taze-yapraklar.jpg',
    },
    {
      verb: 'Denetle',
      icon: 'bowl',
      body: 'Her parti tat ve kalite kontrolünden geçer.',
      detail:
        'Kurutulan çay elenerek boylarına ayrılır, sap ve lifler ayıklanır. Tadımcılar her partiyi demleyip rengine, kokusuna ve tadına bakar; ölçüyü tutmayan parti harmana girmez.',
      facts: [
        { term: 'Ayıklama', value: 'Eleme, sap ve lif ayırma' },
        { term: 'Tadım', value: 'Renk, koku ve tat' },
      ],
      color: '#a5630f',
      image: '/fabrika/kalite-kontrol.jpg',
    },
    {
      verb: 'Paketle',
      icon: 'pack',
      body: 'Harman, aromasını koruyacak şekilde paketlenir.',
      detail:
        'Onaylanan harman ışık, hava ve nemden koruyan ambalajlara konur. Böylece çay, fabrikadan çıktığı günkü aromasıyla rafa ve oradan mutfağa ulaşır.',
      facts: [
        { term: 'Ambalaj', value: 'Işık, hava ve neme karşı' },
        { term: 'Amaç', value: 'Aromanın korunması' },
      ],
      color: '#bb4f1b',
      image: '/fabrika/paketleme.jpg',
    },
    {
      verb: 'Demle',
      icon: 'glass',
      body: 'Bardakta tavşan kanı rengini alır.',
      detail:
        'Alttaki çaydanlıkta su kaynar, üstteki demlikte çay kısık ateşte demlenir. İnce belli bardakta beliren tavşan kanı rengi, demin kıvamını bulduğunu gösterir.',
      facts: [
        { term: 'Usul', value: 'Çift katlı çaydanlık' },
        { term: 'Demlenme', value: '10 – 15 dakika' },
      ],
      color: '#a32e18',
      image: '/fabrika/demle.jpg',
    },
  ] as const,
}

/**
 * Short history of tea on the Black Sea coast, ending with Esçay today.
 * Dates checked against public sources (laws 407/1924, 3788/1940, 3092/1984;
 * first Rize factory usually given as 1947, some sources say 1946).
 * Esçay's own founding year is not published, so its line says "Bugün".
 */
export const history = {
  title: 'Karadeniz’de bir asırlık çay',
  lead: 'Karadeniz’in yamaçlarına çay yüz yıl önce geldi. Esçay bu yamaçlarda büyüyen yaprakla demleniyor.',
  /** Başlığın altındaki fotoğraf: çay bahçelerinin içindeki Esçay fabrikası. */
  image: { src: '/fabrika/cay-hasadi.jpg', alt: 'Karadeniz bahçelerinde çay hasadı', caption: 'Karadeniz bahçelerinde hasat.' },
  /** Son maddenin (Bugün) fotoğrafı. */
  todayImage: { src: '/fabrika/fabrika-sevkiyat.jpg', alt: 'Esçay paketleriyle yüklü sevkiyat aracı fabrika önünde' },
  entries: [
    { when: '1924', title: 'İlk adım', body: 'Doğu Karadeniz’de çay yetiştirilmesi için ilk kanun çıkar.' },
    { when: '1940', title: 'Bahçeler büyür', body: 'Çay Kanunu ile üretici desteklenir, yamaçlar çay bahçesine döner.' },
    { when: '1947', title: 'İlk fabrika', body: 'Karadeniz’de ilk çay fabrikası açılır; yaprak artık bahçenin yanında işlenir.' },
    { when: '1984', title: 'Yeni harmanlar', body: 'Çay işlemek özel sektöre açılır; Karadeniz’de yeni markalar doğar.' },
    { when: 'Bugün', title: 'Esçay', body: 'Rakımı yüksek Karadeniz bahçelerinden özenle seçilen yaprak, Esçay harmanında bardağa gelir.' },
  ],
}

/**
 * Landing FAQ: brand and product questions. Shop questions (kargo, iade,
 * ödeme) live in the storefront FAQ; the link under the heading goes there.
 * Brewing and storage advice matches the storefront's own wording.
 */
export const faq = {
  title: 'Sıkça sorulan sorular',
  lead: 'Harmanlar, demleme ve sipariş üzerine en çok gelen sorular.',
  all: { label: 'Tüm sorular', note: 'Kargo, iade ve ödeme üzerine sorular mağazanın kendi sayfasında.' },
  items: [
    {
      q: 'Esçay çayları nerede yetişiyor?',
      a: 'Doğu Karadeniz’in yüksek rakımlı bahçelerinde. Kışı kar altında, yazı güneşte geçiren bu bahçelerde yaprak yavaş büyür; harmanlarımızın tamamı bu yaprakla hazırlanır.',
    },
    {
      q: 'Çaylarınızda katkı maddesi var mı?',
      a: 'Hayır. Boya, aroma ya da başka bir katkı kullanmıyoruz; paketlerde yalnızca işlenmiş çay yaprağı bulunur. Rengini ve kokusunu yaprağın kendisi verir.',
    },
    {
      q: 'Harmanlar arasındaki fark nedir?',
      a: 'Her harman farklı bir sürgün ve demlik alışkanlığı için hazırlanır: İlk Hasat mayıs sürgünüyle daha açık ve çiçeksi, Tiryaki koyu ve gövdeli, Gold Karadeniz yuvarlak ve tatlı bitişlidir. Ürün sayfalarında her harmanın tadım notu ve demleme önerisi yer alır.',
    },
    {
      q: 'Karadeniz usulü nasıl demlenir?',
      a: 'Çift katlı çaydanlık kullanın. Alttaki çaydanlıkta su kaynarken üstteki demliğe bardak başına bir tatlı kaşığı çay koyun, kaynar suyu dökün ve kısık ateşte 15–20 dakika demleyin. Bardakta tavşan kanı rengi belirince dem hazırdır.',
    },
    {
      q: 'Çayı nasıl saklamalıyım?',
      a: 'Serin, kuru ve kokusuz bir yerde, ağzı kapalı bir kapta. Çay yaprağı çevresindeki kokuyu çeker; baharat ve kahve gibi ürünlerden uzak tutun. Açılan paketi mümkünse birkaç hafta içinde tüketin.',
    },
    {
      q: 'Nereden satın alabilirim?',
      a: 'Tüm harmanlar market.esteacay.com üzerinden Türkiye’nin her yerine kargoyla gönderilir. Toptan ve kurumsal siparişler için bize telefonla ulaşabilirsiniz.',
    },
  ] as const,
}

/** Posts from esteacay.com/blog (titles, links and dates as published there). */
export const blog = {
  title: 'Çay üzerine',
  lead: 'Karadeniz çayı, demleme ve harmanlar üzerine yazılar.',
  all: { label: 'Tüm yazılar', href: 'https://esteacay.com/blog/' },
  /** Görseller esteacay.com'daki öne çıkan görsellerden (public/blog). */
  posts: [
    { title: 'Karadeniz Usulü Çay Nasıl Demlenir?', href: 'https://esteacay.com/elementor-3218/', date: '25 Ocak 2022', image: '/blog/karadeniz-usulu-cay-nasil-demlenir.jpg' },
    { title: 'Türkiye’de Yerli İlk Çay Üretimi', href: 'https://esteacay.com/turkiye-de-yerli-ilk-cay-uretimi/', date: '17 Şubat 2022', image: '/blog/turkiyede-yerli-ilk-cay-uretimi.jpg' },
    { title: 'Dökme Çayın Püf Noktaları Nelerdir?', href: 'https://esteacay.com/dokme-cayin-puf-notlari-nelerdir/', date: '10 Şubat 2022', image: '/blog/dokme-cayin-puf-noktalari.jpg' },
    { title: 'Sütlü Çay Nedir? Nasıl Yapılır?', href: 'https://esteacay.com/sutlu-cay-nedir-nasil-yapilir/', date: '30 Kasım 2021', image: '/blog/sutlu-cay-nedir.jpg' },
    { title: 'Earl Grey Çay Nedir?', href: 'https://esteacay.com/earl-grey-cay-nedir/', date: '10 Aralık 2021', image: '/blog/earl-grey-cay-nedir.jpg' },
    { title: 'Formda Tutan Çaylar: Bitki Çayları', href: 'https://esteacay.com/formda-tutan-caylar-bitki-caylari/', date: '17 Ocak 2022', image: '/blog/formda-tutan-caylar.jpg' },
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
