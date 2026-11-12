/**
 * Landing copy & data. Everything here is a DRAFT — placeholder metin,
 * gerçek değerlerle (tat notları, yorumlar, rakamlar) değiştirilmeli.
 */
import { shopProduct } from '@/lib/site'
import { posts } from './posts'

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
  /**
   * Yırtık kenarlı fotoğraf alanında sırayla geçen dört kare (fotoğraf brief'i, bölüm 1).
   * Sol dörtte bir yırtıkla gider, alt bant altyazıya kalır; `focus` kırpma odağıdır (CSS object-position).
   * Fabrika karesinde tabela solda kaldığından odak sola çekilir.
   */
  photos: [
    { src: '/hakkimizda/fabrika.jpg', alt: 'Çay bahçelerinin ortasındaki Esçay fabrikası, yüksekten', caption: 'Esçay fabrikası, çay bahçelerinin içinde.', focus: '30% 50%' },
    { src: '/hakkimizda/uretim-hatti.jpg', alt: 'Üretim hattında bantlardan akan taze çay yaprağı', caption: 'Taze yaprak, bahçeden saatler sonra hatta.' },
    { src: '/hakkimizda/sevkiyat.jpg', alt: 'Esçay kolileri sevkiyat için tıra yükleniyor', caption: 'Koliler aynı gün yola çıkar.' },
    { src: '/hakkimizda/raf.jpg', alt: 'Açık kolide dizili Esçay Karadeniz çayı paketleri', caption: 'Esçay paketleri rafta, baskı yüzü size dönük.' },
  ] as const,
}

export const collection = {
  title: 'Her ana ayrı bir harman.',
  cta: 'Ürüne git',
  /** Link under the carousel to the blends page. */
  all: { label: 'Dört harmanı yan yana görün', href: '/harmanlar' },
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
    note: 'Elekten çıkan ilk parti, sürgünün ilk iki yaprağı. Hafif, tatlı içim; demi kırmızıya çalar.',
    strength: 'Hafif',
    image: '/estea-gold-cay-1000-gr.png',
    href: shopProduct('gold-karadeniz-cayi'),
  },
  {
    slug: 'ilk-hasat',
    headline: 'Mayısın ilk sürgünü, bardağında.',
    tone: 'leaf',
    name: 'İlk Hasat',
    line: 'Mevsim Serisi',
    weight: '1000 g',
    note: 'Mayıs sürgünü. Buruk, sert ve yoğun demli; koyu sevenlerin sabah çayı.',
    strength: 'Sert',
    image: '/estea-hasat-cay-1000-gr.png',
    href: shopProduct('ilk-hasat-cay'),
  },
  {
    slug: 'tiryaki',
    headline: 'Sert içenlerin vazgeçilmezi.',
    tone: 'brand',
    name: 'Tiryaki',
    line: 'Klasik Seri',
    weight: '1000 g',
    note: 'Aroması en yoğun harman. Tavşan kanı dem, yumuşak içim; günün her saati.',
    strength: 'Yoğun',
    image: '/estea-tiryaki-1000-gr-cay.png',
    href: shopProduct('tiryaki-cayi'),
  },
  {
    slug: 'karadeniz',
    headline: 'Her günün çayı, evin çayı.',
    tone: 'sun',
    name: 'Karadeniz',
    line: 'Klasik Seri',
    weight: '1000 g',
    note: 'Normal koyulukta, yumuşak içimli demlik çayı. Evin çayı.',
    strength: 'Orta',
    image: '/estea-karadeniz-cayi-1000-gr.png',
    href: shopProduct('karadeniz-cayi'),
  },
  {
    slug: 'gold-5000',
    headline: 'Kalabalık sofralara Gold.',
    tone: 'gold',
    name: 'Gold Karadeniz',
    line: 'Gold Serisi · Aile boyu',
    weight: '5000 g',
    note: 'Aynı Gold harmanı, kalabalık sofralar için büyük paket.',
    strength: 'Hafif',
    image: '/estea-gold-cay-5000-gr.png',
    href: shopProduct('gold-karadeniz-cayi'),
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
  /**
   * Fotoğraflar: fotoğraf brief'i bölüm 3 (public/yolculuk). İlk kare geniş (16:10) gösterilir, kalanlar
   * dikey küçük kare (4:5); küçük kareler için konusu ortalanmış `-k` kırpımı kullanılır, galeri tam kareyi açar.
   */
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
      images: [
        { src: '/yolculuk/yetistir-1.jpg' },
        { src: '/yolculuk/yetistir-2.jpg', thumb: '/yolculuk/yetistir-2-k.jpg' },
        { src: '/yolculuk/yetistir-3.jpg', thumb: '/yolculuk/yetistir-3-k.jpg' },
        { src: '/yolculuk/yetistir-4.jpg', thumb: '/yolculuk/yetistir-4-k.jpg' },
      ],
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
      images: [
        { src: '/yolculuk/topla-1.jpg' },
        { src: '/yolculuk/topla-2.jpg', thumb: '/yolculuk/topla-2-k.jpg' },
        { src: '/yolculuk/topla-3.jpg', thumb: '/yolculuk/topla-3-k.jpg' },
        { src: '/yolculuk/topla-4.jpg', thumb: '/yolculuk/topla-4-k.jpg' },
        { src: '/yolculuk/topla-5.jpg', thumb: '/yolculuk/topla-5-k.jpg' },
      ],
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
      /* Hat geneli Hakkımızda'daki üretim hattı karesidir; detaylar: eleme/kurutucu çıkışı, kumanda (dolum karesi istek üzerine kaldırıldı). */
      images: [
        { src: '/hakkimizda/uretim-hatti.jpg' },
        { src: '/yolculuk/isle-3.jpg', thumb: '/yolculuk/isle-3-k.jpg' },
        { src: '/yolculuk/isle-2.jpg', thumb: '/yolculuk/isle-2-k.jpg' },
      ],
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
      /* Avuçta kuru çay, boy farkı; tadımcı karesi istek üzerine kaldırıldı. */
      images: [{ src: '/yolculuk/denetle-avuc.jpg' }],
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
      images: [
        { src: '/yolculuk/paketle-1.jpg' },
        { src: '/yolculuk/paketle-bant.jpg', thumb: '/yolculuk/paketle-bant-k.jpg' },
        { src: '/yolculuk/paketle-2.jpg', thumb: '/yolculuk/paketle-2-k.jpg' },
        { src: '/yolculuk/paketle-3.jpg', thumb: '/yolculuk/paketle-3-k.jpg' },
        { src: '/yolculuk/paketle-4.jpg', thumb: '/yolculuk/paketle-4-k.jpg' },
        { src: '/hakkimizda/sevkiyat-tir.jpg', thumb: '/yolculuk/paketle-tir-k.jpg' },
      ],
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
      images: [{ src: '/yolculuk/demle-1.jpg' }],
    },
  ] as const,
}

/**
 * Short history of tea on the Black Sea coast, ending with Esçay today.
 * Dates checked against public sources (laws 407/1924, 3788/1940, 3092/1984;
 * first Black Sea factory usually given as 1947, some sources say 1946).
 * Esçay's founding year (2019, Hayrat) is from esteacay.com/hakkimizda (Wayback 2022).
 */
export const history = {
  title: 'Karadeniz’de bir asırlık çay',
  lead: 'Karadeniz’in yamaçlarına çay yüz yıl önce geldi. Esçay bu yamaçlarda büyüyen yaprakla demleniyor.',
  /** Başlığın altındaki fotoğraf: çay bahçelerinin içindeki Esçay fabrikası. */
  image: { src: '/yolculuk/topla-1.jpg', mobile: '/yolculuk/topla-1-k.jpg', alt: 'Karadeniz bahçelerinde çay hasadı', caption: 'Karadeniz bahçelerinde hasat.' },
  /** Son maddenin (Bugün) fotoğrafı. */
  todayImage: { src: '/hakkimizda/sevkiyat-tir.jpg', mobile: '/yolculuk/paketle-tir-k.jpg', alt: 'Esçay paketleriyle yüklü sevkiyat aracı fabrika önünde' },
  entries: [
    { when: '1924', title: 'İlk adım', body: 'Doğu Karadeniz’de çay yetiştirilmesi için ilk kanun çıkar.' },
    { when: '1940', title: 'Bahçeler büyür', body: 'Çay Kanunu ile üretici desteklenir, yamaçlar çay bahçesine döner.' },
    { when: '1947', title: 'İlk fabrika', body: 'Karadeniz’de ilk çay fabrikası açılır; yaprak artık bahçenin yanında işlenir.' },
    { when: '1984', title: 'Yeni harmanlar', body: 'Çay işlemek özel sektöre açılır; Karadeniz’de yeni markalar doğar.' },
    { when: '2019', title: 'Esçay', body: 'Hayrat’ta, çay bahçelerinin ortasında Esçay fabrikası açılır. Yüksek Karadeniz bahçelerinden seçilen yaprak Esçay harmanında bardağa gelir.' },
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
      a: 'Dördü de aynı bahçeden gelir; farkı elek belirler. Gold elenen ilk partidir, hafif ve tatlıdır. İlk Hasat mayıs sürgünüyle buruk ve yoğun demlidir. Karadeniz normal koyulukta, yumuşak içimli evin çayıdır. Tiryaki aroması en yoğun olandır. Hepsini Harmanlar sayfasında yan yana görebilirsiniz.',
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

/** Home blog section: the six newest posts from src/data/posts.ts, hosted at /blog. */
export const blog = {
  title: 'Çay üzerine',
  lead: 'Karadeniz çayı, demleme ve harmanlar üzerine yazılar.',
  all: { label: 'Tüm yazılar', href: '/blog' },
  posts: posts.slice(0, 6).map((p) => ({ title: p.title, href: `/blog/${p.slug}`, date: p.dateLabel, image: p.image })),
}

/** Contact details as published on market.esteacay.com/iletisim. */
export const contact = {
  title: 'Bize ulaşın',
  lead: 'Siparişiniz, sorunuz ya da bir öneriniz mi var? Hafta içi müşteri hizmetlerimiz sizi dinliyor.',
  phone: { label: '0462 692 30 61', href: 'tel:+904626923061' },
  hours: 'Hafta içi 09.00–18.00',
  address: ['Balaban Mah. Uğurlu Cad. No: 9', 'Merkez, Hayrat / Trabzon'],
  mapHref: 'https://www.google.com/maps/search/?api=1&query=Balaban+Mah.+U%C4%9Furlu+Cad.+No%3A9+Hayrat+Trabzon',
  istanbul: {
    address: ['Yıldırım Mah. Şehit Kamil Balkan Cad.', 'Bayrampaşa / İstanbul'],
    mapHref: 'https://www.google.com/maps?q=41.065407,28.886883',
  },
  socials: [
    { label: 'Instagram', href: 'https://www.instagram.com/esteacay/' },
    { label: 'Facebook', href: 'https://www.facebook.com/esteacay/' },
  ],
  company: 'Hamzalı Çay Gıda Tur. ve İnş. A.Ş.',
}
