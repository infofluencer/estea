/**
 * Harmanlar sayfası. Metinler market.esteacay.com ürün açıklamalarından
 * (apps/backend/data/wc-products.csv) derlendi; iddialar markanın kendi
 * ifadeleriyle sınırlı: elek partisi, sürgün, hasat ayı, içim, dem rengi, paketler.
 * Sıra ana sayfadaki koleksiyonla aynı.
 */
import { shopProduct } from '@/lib/site'
import type { Tone } from './content'

export type Blend = {
  /** Sayfa içi çapa ve seçim anahtarı. */
  slug: string
  name: string
  tone: Tone
  /** VerbMark ve FactList rengi; krem yazı üstünde okunur. */
  color: string
  /** Paketin arkasındaki düz zemin (Tailwind sınıfı). */
  soft: string
  /** Paketin altındaki tek cümle. */
  summary: string
  /** Yayılımdaki ifade cümlesi, en çok iki satır. */
  headline: string
  body: readonly [string, string]
  /** Bilet koçanındaki iki olgu. */
  facts: readonly [{ term: string; value: string }, { term: string; value: string }]
  /** Karşılaştırma tablosu; anahtarlar her harmanda aynı. */
  compare: { yaprak: string; elek: string; icim: string; dem: string; paket: string }
  image: string
  href: string
}

export const page = {
  title: 'Dört harman, tek bahçe.',
  lead: 'Esçay’ın bütün çayları aynı yüksek Karadeniz bahçelerinden gelir. Kurutulan yaprak elekten geçince dört ayrı karaktere ayrılır.',
  body: 'Elekten ilk ayrılan ince parti Gold, mayıs hasadının iki buçuk yapraklı sürgünü İlk Hasat, elek dışında kalan iri yaprak Karadeniz, elek altında biriken ince ve yoğun aromalı kısım Tiryaki olur. Dördü de aynı yaprak, aynı fabrika; farkı elek belirler.',
  photo: { src: '/yolculuk/denetle-avuc.jpg', mobile: '/yolculuk/denetle-avuc-k.jpg', alt: 'Avuç içinde iriden inceye dört boy kuru çay yaprağı', caption: 'Avuçta dört boy: iri yapraktan elek altına.' },
  cta: 'Mağazada gör',
  /** İlk ekrandaki eylem: karşılaştırma tablosuna iner. */
  choose: { label: 'Dördünü yan yana görün', href: '#karsilastir' },
}

export const compare = {
  title: 'Dördü yan yana',
  rows: [
    { key: 'yaprak', term: 'Yaprak' },
    { key: 'elek', term: 'Elek' },
    { key: 'icim', term: 'İçim' },
    { key: 'dem', term: 'Dem rengi' },
    { key: 'paket', term: 'Paketler' },
  ] as const,
}

/** Demleme: SSS ve blogdaki Karadeniz usulüyle aynı ölçüler. */
export const brew = {
  title: 'Karadeniz usulü demleme',
  lead: 'Dört harman da çift katlı çaydanlıkta aynı usulle demlenir; yalnız süre ve ölçü zevke göre oynar.',
  photo: { src: '/yolculuk/demle-1.jpg', mobile: '/yolculuk/demle-1-k.jpg', alt: 'Tezgâhta ince belli bardakta tavşan kanı çay ve Esçay Gold paketi' },
  steps: [
    'Alttaki çaydanlığa su koyup kaynatın; boş demliği üstünde ısıtın.',
    'Bardak başına bir tatlı kaşığı çayı demliğe koyun, kaynar suyu üstüne dökün.',
    'Demliği kısık ateşte 15–20 dakika demlenmeye bırakın; kaynatmayın.',
    'İnce belli bardağa önce dem, sonra sıcak su. Tavşan kanı rengi tuttuysa hazır.',
  ],
  note: 'Açılan paketi ağzı kapalı, serin ve kokusuz bir yerde saklayın; çay yaprağı çevresindeki kokuyu çeker.',
  link: { label: 'Demleme yazısını okuyun', href: 'https://esteacay.com/elementor-3218/' },
}

export const blends: Blend[] = [
  {
    slug: 'gold',
    name: 'Gold Karadeniz',
    tone: 'gold',
    color: '#8a5d07',
    soft: 'bg-gold-soft',
    summary: 'Elekten çıkan ilk parti; hafif, tatlı, burukluğu az.',
    headline: 'Elenen ilk parti, hafif ve tatlı.',
    body: [
      'Kurutulan yaprak elekten geçerken ilk ayrılan parti Gold olur. İlk sürgünlerin en üstündeki iki yapraktan üretilir; harmanların en incesi ve en özeli odur.',
      'Demi güzel bir kırmızıya çalar. İçimi hafif, tatlı ve hoştur; burukluğu azdır. Dost sohbetine, uzun kahvaltıya eşlik eden çaydır.',
    ],
    facts: [
      { term: 'Yaprak', value: 'Sürgünün ilk iki yaprağı' },
      { term: 'İçim', value: 'Hafif ve tatlı' },
    ],
    compare: { yaprak: 'Sürgünün ilk iki yaprağı', elek: 'Kurutma sonrası ilk parti', icim: 'Hafif, tatlı, burukluğu az', dem: 'Açık kırmızı', paket: '500 g, 1 kg, 5 kg' },
    image: '/estea-gold-cay-1000-gr.png',
    href: shopProduct('gold-karadeniz-cayi'),
  },
  {
    slug: 'ilk-hasat',
    name: 'İlk Hasat',
    tone: 'leaf',
    color: '#4d7310',
    soft: 'bg-leaf-soft',
    summary: 'Mayıs hasadının iki buçuk yapraklı sürgünü; buruk, sert, yoğun demli.',
    headline: 'Mayısın ilk sürgünü, yoğun dem.',
    body: [
      'Kışı kar altında geçiren Trabzon bahçeleri mayısta ilk sürgünü verir. İlk Hasat bu ilk toplamanın iki buçuk yapraklı özel kısmından üretilir; yılın en taze yaprağıdır.',
      'Kokusu mis gibidir, damakta buruk ve sert bir iz bırakır. Yoğun demlenince hakiki çay lezzetini verir; koyu sevenlerin sabah çayıdır.',
    ],
    facts: [
      { term: 'Hasat', value: 'Mayıs, ilk toplama' },
      { term: 'İçim', value: 'Buruk ve sert' },
    ],
    compare: { yaprak: 'İki buçuk yapraklı sürgün', elek: 'Mayıs ilk hasadının özel kısmı', icim: 'Buruk, sert, yoğun demli', dem: 'Yoğun kırmızı', paket: '500 g, 1 kg, 5 kg' },
    image: '/estea-hasat-cay-1000-gr.png',
    href: shopProduct('ilk-hasat-cay'),
  },
  {
    slug: 'karadeniz',
    name: 'Karadeniz',
    tone: 'sun',
    color: '#bb4f1b',
    soft: 'bg-amber-soft',
    summary: 'Elek dışında kalan iri yaprak; dengeli, yumuşak, evin çayı.',
    headline: 'Her günün çayı, normal koyulukta.',
    body: [
      'Karadeniz, elek dışında kalan iri yapraktan paketlenir. Geleneksel Türk çayının normal koyuluğu, dem rengi ve yumuşak içimi onu evin çayı yapar.',
      'Bahçesinin karı, yağmuru, nemi ve güneşi tadına geçer; Karadeniz’in yoğun aroması her bardakta vardır. Gün boyu demlikte durmaya alışkındır.',
    ],
    facts: [
      { term: 'Yaprak', value: 'Elek dışı, iri yaprak' },
      { term: 'İçim', value: 'Yumuşak ve dengeli' },
    ],
    compare: { yaprak: 'Elek dışı, iri yaprak', elek: 'Elek dışında kalan kısım', icim: 'Yumuşak, normal koyulukta', dem: 'Normal koyuluk', paket: '500 g, 1 kg, 5 kg' },
    image: '/estea-karadeniz-cayi-1000-gr.png',
    href: shopProduct('karadeniz-cayi'),
  },
  {
    slug: 'tiryaki',
    name: 'Tiryaki',
    tone: 'brand',
    color: '#b43317',
    soft: 'bg-brand-soft',
    summary: 'Elek altının ince yaprağı; tavşan kanı dem, en yoğun aroma.',
    headline: 'Aroması en yoğun olan.',
    body: [
      'Tiryaki’yi diğerlerinden ayıran aromasının yoğunluğudur. Yaş çayın elek altı için ayrılan kısmından üretilir; ince yaprak demliğe hızlı ve koyu geçer.',
      'Günün her saatinde tavşan kanı rengi ve kokusuyla içilir. Buna rağmen içimi hoş ve yumuşaktır; adını sert içenlerden alır.',
    ],
    facts: [
      { term: 'Yaprak', value: 'Elek altı, ince yaprak' },
      { term: 'Dem', value: 'Tavşan kanı' },
    ],
    compare: { yaprak: 'Elek altı, ince yaprak', elek: 'Elek altı için ayrılan kısım', icim: 'Yumuşak, aroması en yoğun', dem: 'Tavşan kanı', paket: '500 g, 1 kg' },
    image: '/estea-tiryaki-1000-gr-cay.png',
    href: shopProduct('tiryaki-cayi'),
  },
]
