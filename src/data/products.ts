export type ShopProduct = {
  id: string
  name: string
  subtitle: string
  collection: string
  price: number
  image: string
  href: string
  inStock: boolean
  sku: string
  stockLabel: string
  lead: string
  bullets: string[]
  description: string[]
}

/** Kaynak: https://market.esteacay.com/k/caylarimiz/ ve ürün sayfaları */
export const shopProducts: ShopProduct[] = [
  {
    id: 'tiryaki-1000',
    name: 'Tiryaki Çayı 1000 gr',
    subtitle: 'Tiryaki',
    collection: 'Tiryaki',
    price: 340,
    image: '/shop/estea-tiryaki-1000-gr-cay.jpg',
    href: 'https://market.esteacay.com/u/es-tea-tiryaki-cayi-1000-gr/',
    inStock: true,
    sku: 'tiryaki-1000',
    stockLabel: '970 adet stokta',
    lead: 'Günün her saatinde, tavşan kanı rengi ve kokusu ile eşsiz lezzetini yudumlayabileceğiniz Tiryaki Çayı.',
    bullets: [
      'Yaş çayın elekaltı için ayrılan geri kalan kısımlarından üretilir.',
      'Bahçesinin kar, yağmur, nem ve güneşinin kattığı lezzet, tat ve aroması eşsizdir.',
      'Oldukça hoş ve yumuşak bir içimi vardır.',
      'Diğer çaylarımız gibi birinci sınıf bir çaydır.',
    ],
    description: [
      'ES tea Tiryaki Çayı’nın diğer çaylarımızdan farkı aromasının yoğunluğudur.',
      'Karadeniz’in, rakımı yüksek, kışın kar altında kalan yazın ise güneşli havasında büyüyen çay bahçelerinden özenle seçilip toplandı.',
    ],
  },
  {
    id: 'tiryaki-500',
    name: 'Tiryaki Çayı 500 gr',
    subtitle: 'Tiryaki',
    collection: 'Tiryaki',
    price: 180,
    image: '/shop/estea-tiryaki-cay-500-gr.jpg',
    href: 'https://market.esteacay.com/u/es-tea-tiryaki-cayi-500-gr/',
    inStock: false,
    sku: 'tiryaki-500',
    stockLabel: 'Stokta yok',
    lead: 'Günün her saatinde, tavşan kanı rengi ve kokusu ile eşsiz lezzetini yudumlayabileceğiniz Tiryaki Çayı.',
    bullets: [
      'Yaş çayın elekaltı için ayrılan geri kalan kısımlarından üretilir.',
      'Bahçesinin kar, yağmur, nem ve güneşinin kattığı lezzet, tat ve aroması eşsizdir.',
      'Oldukça hoş ve yumuşak bir içimi vardır.',
      'Diğer çaylarımız gibi birinci sınıf bir çaydır.',
    ],
    description: [
      'ES tea Tiryaki Çayı’nın diğer çaylarımızdan farkı aromasının yoğunluğudur.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'suzen-earl-1050',
    name: 'Demlik Süzen Poşet · Earl Grey 1050g',
    subtitle: 'Süzen Poşet',
    collection: 'Süzen Poşet',
    price: 410,
    image: '/shop/esta-canta-cay.jpg',
    href: 'https://market.esteacay.com/u/es-tea-demlik-suzen-poset-cay-earl-grey-1050g/',
    inStock: true,
    sku: 'suzen-earl-1050',
    stockLabel: 'Stokta',
    lead: 'Earl Grey aromalı demlik süzen poşet çay — kullanım kolaylığı ve yoğun aroma bir arada.',
    bullets: [
      'Earl Grey üretimdir.',
      'Bahçesinin kar, yağmur, nem ve güneşinin kattığı lezzet, tat ve aroması eşsizdir.',
      'Oldukça hoş ve yumuşak bir içimi vardır.',
      'Diğer çaylarımız gibi birinci sınıf bir çaydır.',
    ],
    description: [
      'ES tea Demlik Süzen Poşet Çayı’nın farkı Earl Grey olmasıdır. Süzen poşet yapısıyla kullanım kolaylığı sağlar.',
      'Karadeniz’in yüksek rakımlı çay bahçelerinden özenle seçilip toplandı.',
    ],
  },
  {
    id: 'gold-500',
    name: 'Gold Karadeniz Çayı 500 gr',
    subtitle: 'Gold Karadeniz',
    collection: 'Gold Karadeniz',
    price: 210,
    image: '/shop/estea-gold-cay-500-gr.jpg',
    href: 'https://market.esteacay.com/u/estea-gold-cay-500-gr/',
    inStock: true,
    sku: '968910297-6',
    stockLabel: '963 adet stokta',
    lead: 'Yüksek kalitesi, tadı, aroması ve burukluğuyla keyifle tüketebileceğiniz Gold Karadeniz Çayı.',
    bullets: [
      'İlk yetişen filizlerin en üstündeki ilk iki yaprağından üretilir.',
      'Rengi üstün ve güzel bir kırmızıya çalar.',
      'İçimi hafif, tatlı ve hoştur.',
      'Birinci sınıf kaliteli bir çaydır.',
    ],
    description: [
      'En kaliteli çay yaprakları kurutulduktan sonra elenmiş ilk parti çaydır. ES tea Gold Çay, oldukça özel ve üst sınıf bir çaydır.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'hasat-5000',
    name: 'İlk Hasat Çay 5000 gr',
    subtitle: 'İlk Hasat',
    collection: 'İlk Hasat',
    price: 1700,
    image: '/shop/estea-hasat-cay-5000-gr.jpg',
    href: 'https://market.esteacay.com/u/es-tea-ilk-hasat-cay-5000-gr/',
    inStock: true,
    sku: 'hasat-5000',
    stockLabel: '986 adet stokta',
    lead: 'Trabzon tepelerinin kar altındaki bahçelerinden Mayıs aylarında yapılan ilk hasatta toplanan çay yapraklarıyla hazırlanır.',
    bullets: [
      'Yaş çayların iki buçuk yapraklı özel kısımlarından üretilir.',
      'Kokusu hoştur, damakta bıraktığı buruk ve sert lezzetiyle öne çıkar.',
      'Yoğun dem hakiki çay lezzetine sahiptir.',
      'İlk hasattan elde edilen birinci sınıf bir çaydır.',
    ],
    description: [
      'Çay bahçelerimiz Karadeniz’in kar altında kalan havzalarındadır. ES tea İlk Hasat Çay, bu bahçelerden toplanan çayların ilk hasadından elde edilir.',
      'ES tea çay yapraklarıyla Türk damak zevkini içinde hissedeceğiniz, lezzetiyle duyularınıza iz bırakacak çay.',
    ],
  },
  {
    id: 'hasat-500',
    name: 'İlk Hasat Çay 500 gr',
    subtitle: 'İlk Hasat',
    collection: 'İlk Hasat',
    price: 200,
    image: '/shop/estea-hasat-cay-500-gr-01.jpg',
    href: 'https://market.esteacay.com/u/estea-elekalti-cay-500-gr/',
    inStock: true,
    sku: '968910297-1-2',
    stockLabel: '366 adet stokta',
    lead: 'İlk hasat çayı enfes lezzeti ve taptaze aromasıyla fincanlarınıza doluyor.',
    bullets: [
      'Yaş çayların iki buçuk yapraklı özel kısımlarından üretilir.',
      'Kokusu hoştur, damakta bıraktığı buruk ve sert lezzetiyle öne çıkar.',
      'Yoğun dem hakiki çay lezzetine sahiptir.',
      'İlk hasattan elde edilen birinci sınıf bir çaydır.',
    ],
    description: [
      'Çay bahçelerimiz Karadeniz’in kar altında kalan havzalarındadır. ES tea İlk Hasat Çay, bu bahçelerden toplanan çayların ilk hasadından elde edilir.',
      'ES tea çay yapraklarıyla Türk damak zevkini içinde hissedeceğiniz, lezzetiyle duyularınıza iz bırakacak çay.',
    ],
  },
  {
    id: 'karadeniz-1000',
    name: 'Karadeniz Çayı 1000 gr',
    subtitle: 'Karadeniz',
    collection: 'Karadeniz',
    price: 350,
    image: '/shop/estea-karadeniz-cayi-1000-gr.jpg',
    href: 'https://market.esteacay.com/u/estea-karadeniz-cay-1000-gr/',
    inStock: true,
    sku: '968910297-2-1',
    stockLabel: '985 adet stokta',
    lead: 'Geleneksel Türk çayının dem rengi, yumuşak içimi ve Karadeniz’in eşsiz yoğun aroması.',
    bullets: [
      'Yaş çayın elekaltı için ayrılan geri kalan kısımlarından üretilir.',
      'Bahçesinin kar, yağmur, nem ve güneşinin kattığı lezzet, tat ve aroması eşsizdir.',
      'Oldukça hoş ve yumuşak bir içimi vardır.',
      'Diğer çaylarımız gibi birinci sınıf bir çaydır.',
    ],
    description: [
      'ES tea Karadeniz Çayı’nın farkı elekaltı dışında kalan kısımlardan paketleniyor olmasıdır.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'hasat-1000',
    name: 'İlk Hasat Çay 1000 gr',
    subtitle: 'İlk Hasat',
    collection: 'İlk Hasat',
    price: 360,
    image: '/shop/estea-hasat-cay-1000-gr.jpg',
    href: 'https://market.esteacay.com/u/estea-elekalti-cay-1000-gr/',
    inStock: true,
    sku: '968910297-1',
    stockLabel: '9835 adet stokta',
    lead:
      'Trabzon Mayıs ayındaki ilk çay hasadında toplanan en kaliteli çay yapraklarından oluşan özel harmanı sayesinde etrafı saran mis gibi kokusu mutfaklarınızda.',
    bullets: [
      'Yaş çayların iki buçuk yapraklı özel kısımlarından üretilir.',
      'Kokusu hoştur, damakta bıraktığı buruk ve sert lezzetiyle öne çıkar.',
      'Yoğun dem hakiki çay lezzetine sahiptir.',
      'İlk hasattan elde edilen birinci sınıf bir çaydır.',
    ],
    description: [
      'Çay bahçelerimiz Karadeniz’in kar altında kalan havzalarındadır. ES tea İlk Hasat Çay, bu bahçelerden toplanan çayların ilk hasadından elde edilir. Elekaltı çayın en özeli ve lezzetli kısmıdır.',
      'ES tea çay yapraklarıyla Türk damak zevkini içinde hissedeceğiniz, lezzetiyle duyularınıza mükemmel iz bırakacak ES tea Çay ile tanışma zamanı.',
    ],
  },
  {
    id: 'gold-1000',
    name: 'Gold Karadeniz Çayı 1000 gr',
    subtitle: 'Gold Karadeniz',
    collection: 'Gold Karadeniz',
    price: 380,
    image: '/shop/estea-gold-cay-1000-gr.jpg',
    href: 'https://market.esteacay.com/u/estea-gold-cay-1000-gr/',
    inStock: true,
    sku: '968910297',
    stockLabel: '9780 adet stokta',
    lead: 'Yüksek kalitesi, tadı, aroması ve burukluğuyla keyfinize, dost muhabbetinize birebir Gold Karadeniz Çayı.',
    bullets: [
      'İlk yetişen filizlerin en üstündeki ilk iki yaprağından üretilir.',
      'Rengi üstün ve güzel bir kırmızıya çalar.',
      'İçimi hafif, tatlı ve hoştur.',
      'Birinci sınıf kaliteli bir çaydır.',
    ],
    description: [
      'En kaliteli çay yaprakları kurutulduktan sonra elenmiş ilk parti çaydır. ES tea Gold Çay, oldukça özel ve üst sınıf bir çaydır.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'karadeniz-5000',
    name: 'Karadeniz Çayı 5000 gr',
    subtitle: 'Karadeniz',
    collection: 'Karadeniz',
    price: 1600,
    image: '/shop/estea-karadeniz-cayi-5000-gr.jpg',
    href: 'https://market.esteacay.com/u/es-tea-karadeniz-cay-5000-gr/',
    inStock: true,
    sku: 'karadeniz-5000',
    stockLabel: 'Stokta',
    lead: 'Karadeniz’in uzun süre kar altında kalan Trabzon tepelerindeki bahçelerden elde edilen kaliteli çay.',
    bullets: [
      'Yaş çayın elekaltı için ayrılan geri kalan kısımlarından üretilir.',
      'Bahçesinin kar, yağmur, nem ve güneşinin kattığı lezzet, tat ve aroması eşsizdir.',
      'Oldukça hoş ve yumuşak bir içimi vardır.',
      'Diğer çaylarımız gibi birinci sınıf bir çaydır.',
    ],
    description: [
      'ES tea Karadeniz Çayı’nın farkı elekaltı dışında kalan kısımlardan paketleniyor olmasıdır.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'karadeniz-500',
    name: 'Karadeniz Çayı 500 gr',
    subtitle: 'Karadeniz',
    collection: 'Karadeniz',
    price: 190,
    image: '/shop/estea-karadeniz-cayi-500-gr.jpg',
    href: 'https://market.esteacay.com/u/estea-karadeniz-cay-500-gr/',
    inStock: false,
    sku: '968910297-2-1-1',
    stockLabel: 'Stokta yok',
    lead: 'Geleneksel Türk çayının dem rengi, yumuşak içimi ve Karadeniz’in eşsiz yoğun aroması.',
    bullets: [
      'Yaş çayın elekaltı için ayrılan geri kalan kısımlarından üretilir.',
      'Bahçesinin kar, yağmur, nem ve güneşinin kattığı lezzet, tat ve aroması eşsizdir.',
      'Oldukça hoş ve yumuşak bir içimi vardır.',
      'Diğer çaylarımız gibi birinci sınıf bir çaydır.',
    ],
    description: [
      'ES tea Karadeniz Çayı’nın farkı elekaltı dışında kalan kısımlardan paketleniyor olmasıdır.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'gold-5000',
    name: 'Gold Çay 5000 gr',
    subtitle: 'Gold Karadeniz',
    collection: 'Gold Karadeniz',
    price: 1800,
    image: '/shop/estea-gold-cay-5000-gr.jpg',
    href: 'https://market.esteacay.com/u/estea-gold-cay-5000-gr/',
    inStock: true,
    sku: '968910297-7',
    stockLabel: '5857 adet stokta',
    lead: 'Tadı, aroması ve burukluğuyla değerli anlarınıza eşlik edecek Gold Karadeniz Çayı.',
    bullets: [
      'İlk yetişen filizlerin en üstündeki ilk iki yaprağından üretilir.',
      'Rengi üstün ve güzel bir kırmızıya çalar.',
      'İçimi hafif, tatlı ve hoştur.',
      'Birinci sınıf kaliteli bir çaydır.',
    ],
    description: [
      'En kaliteli çay yaprakları kurutulduktan sonra elenmiş ilk parti çaydır. ES tea Gold Çay, oldukça özel ve üst sınıf bir çaydır.',
      'Karadeniz’in yüksek rakımlı bahçelerinden sizin için özenle seçilip toplandı.',
    ],
  },
  {
    id: 'suzen-6000',
    name: 'Demlik Süzen Poşet Çay 6000 gr',
    subtitle: 'Süzen Poşet',
    collection: 'Süzen Poşet',
    price: 2800,
    image: '/shop/estea-demlik-poset-cay.jpg',
    href: 'https://market.esteacay.com/u/estea-demlik-suzen-poset-cay-6000-gr/',
    inStock: true,
    sku: '968910297-4',
    stockLabel: '9999 adet stokta',
    lead: 'İlk hasattan elde edilen demlik süzen poşet çay — toplu kullanım için pratik paket.',
    bullets: [
      'İlk yetişen filizlerin en üstündeki ilk iki yaprağından üretilir.',
      'Rengi üstün ve güzel bir kırmızıya çalar.',
      'İçimi hafif, tatlı ve hoştur.',
      'Birinci sınıf kaliteli bir çaydır.',
    ],
    description: [
      'Çay bahçelerimiz Karadeniz’in kar altında kalan havzalarındadır. ES tea Demlik Süzen Poşet Çay, bu bahçelerden toplanan çayların ilk hasadından elde edilir.',
      'ES tea çay yapraklarıyla Türk damak zevkini içinde hissedeceğiniz çay.',
    ],
  },
  {
    id: 'suzen-earl-6000',
    name: 'Demlik Süzen Poşet · Earl Grey 6000 gr',
    subtitle: 'Süzen Poşet',
    collection: 'Süzen Poşet',
    price: 2900,
    image: '/shop/Esteacay-demlik-cay-acik-6000.jpg',
    href: 'https://market.esteacay.com/u/es-tea-demlik-suzen-poset-cay-earl-grey-6000-gr/',
    inStock: true,
    sku: '968910297-4-1',
    stockLabel: '9999 adet stokta',
    lead: 'Earl Grey aromalı demlik süzen poşet — büyük paket, yoğun aroma.',
    bullets: [
      'İlk yetişen filizlerin en üstündeki ilk iki yaprağından üretilir.',
      'Rengi üstün ve güzel bir kırmızıya çalar.',
      'İçimi hafif, tatlı ve hoştur.',
      'Birinci sınıf kaliteli bir çaydır.',
    ],
    description: [
      'ES tea Demlik Süzen Poşet Çay Earl Grey, Karadeniz bahçelerinden toplanan çayların ilk hasadından elde edilir.',
      'Çay yapraklarının en özeli ve lezzetli kısmından üretilir.',
    ],
  },
]

export const shopCollections = [
  'İlk Hasat',
  'Gold Karadeniz',
  'Karadeniz',
  'Tiryaki',
  'Süzen Poşet',
] as const

export function getProductById(id: string) {
  return shopProducts.find((p) => p.id === id)
}

export function getRelatedProducts(product: ShopProduct, limit = 4) {
  return shopProducts
    .filter((p) => p.id !== product.id && p.collection === product.collection)
    .concat(shopProducts.filter((p) => p.id !== product.id && p.collection !== product.collection))
    .slice(0, limit)
}

export function formatTry(amount: number) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount)
}
