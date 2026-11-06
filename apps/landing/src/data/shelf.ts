/**
 * Mağazadaki ürünlerin landing'de anılanları. Metinler mağaza ürün
 * açıklamalarından (apps/backend/data/wc-products.csv), sağlık iddiaları
 * alınmadan derlendi. Fiyat ve stok mağazadan okunur, burada tutulmaz.
 * Stokta olmayan küp şeker ve süzen poşet 2000 g burada yok.
 */
import { shopProduct, shopProductsUrl } from '@/lib/site'

export type TeaSlug = 'gold' | 'ilk-hasat' | 'karadeniz' | 'tiryaki' | 'demlik-poset' | 'earl-grey'

export type Tea = {
  slug: TeaSlug
  /** Süzgeçteki kısa ad. */
  short: string
  name: string
  /** Paketin arkasındaki düz zemin. */
  soft: string
  image: string
  href: string
}

/** Blog süzgecinin sırası. */
export const teas: readonly Tea[] = [
  { slug: 'gold', short: 'Gold', name: 'Gold Karadeniz', soft: 'bg-gold-soft', image: '/urunler/estea-gold-cay-1000-gr.webp', href: shopProduct('gold-karadeniz-cayi') },
  { slug: 'ilk-hasat', short: 'İlk Hasat', name: 'İlk Hasat', soft: 'bg-leaf-soft', image: '/urunler/estea-hasat-cay-1000-gr.webp', href: shopProduct('ilk-hasat-cay') },
  { slug: 'karadeniz', short: 'Karadeniz', name: 'Karadeniz', soft: 'bg-amber-soft', image: '/urunler/estea-karadeniz-cayi-1000-gr.webp', href: shopProduct('karadeniz-cayi') },
  { slug: 'tiryaki', short: 'Tiryaki', name: 'Tiryaki', soft: 'bg-brand-soft', image: '/urunler/estea-tiryaki-1000-gr-cay.webp', href: shopProduct('tiryaki-cayi') },
  { slug: 'demlik-poset', short: 'Süzen Poşet', name: 'Demlik Süzen Poşet', soft: 'bg-leaf-soft', image: '/urunler/estea-demlik-poset-cay.webp', href: shopProduct('demlik-suzen-poset-cay') },
  { slug: 'earl-grey', short: 'Earl Grey', name: 'Earl Grey Süzen Poşet', soft: 'bg-gold-soft', image: '/urunler/esta-canta-cay.webp', href: shopProduct('earl-grey-demlik-suzen-poset-cay') },
]

export const teaBySlug = (slug: TeaSlug) => teas.find((t) => t.slug === slug)!

export const shelf = {
  title: 'Demliğe poşet, bardağa bitki.',
  lead: 'Dört dökme harmanın yanında iki hat daha var: demliğe atılan süzen poşetler ve bardakta demlenen bitki çayları.',
  cta: 'Mağazada gör',
  demlik: {
    name: 'Demlik Süzen Poşet',
    pack: '6 kg',
    body: 'Kar altında kalan bahçelerin ilk hasadından, elek altının en lezzetli kısmı. Ölçü derdi olmadan demliğe atılır; kafe, ofis ve kalabalık sofralar için.',
    image: '/urunler/estea-demlik-poset-cay.webp',
    alt: 'Esçay Demlik Süzen Poşet Çay, 6000 gramlık kutu',
    href: shopProduct('demlik-suzen-poset-cay'),
  },
  earlGrey: {
    name: 'Earl Grey Süzen Poşet',
    pack: '1050 g, 35 poşet',
    body: 'Bergamotlu siyah çay; hoş ve yumuşak içimli. Gold ile harmanlamak isteyene tarifi yazdık.',
    image: '/urunler/esta-canta-cay.webp',
    alt: 'Esçay Earl Grey Demlik Süzen Poşet Çay, 1050 gramlık paket',
    href: shopProduct('earl-grey-demlik-suzen-poset-cay'),
    recipe: { label: 'Harman tarifini okuyun', href: '/blog/en-iyi-cay-harmani-nasil-yapilir' },
  },
  herbal: {
    pack: '20 bardak poşet',
    title: 'Sekiz bardak poşet',
    body: 'Mevsiminde toplanan bitkiler; katkı maddesi ve koruyucu yok. Kaynamış suda en çok beş dakika bekletin.',
    all: { label: 'Bitki çaylarının hepsi', href: `${shopProductsUrl}/bitki-cayi` },
    items: [
      { name: 'Ihlamur', image: '/urunler/ihlamur-bitki-cayi.webp', href: shopProduct('ihlamur-cayi') },
      { name: 'Melisa', image: '/urunler/melisa-bitki-cayi.webp', href: shopProduct('melisa-cayi') },
      { name: 'Papatya', image: '/urunler/papatya-cayi.webp', href: shopProduct('papatya-cayi') },
      { name: 'Nane Limon', image: '/urunler/nane-limon-bitki-cayi.webp', href: shopProduct('nane-limon-cayi') },
      { name: 'Yeşil Çay', image: '/urunler/yesil-cay-bitki-cayi.webp', href: shopProduct('yesil-cay-bardak-poset') },
      { name: 'Kuşburnu', image: '/urunler/kusburnu-bitki-cayi.webp', href: shopProduct('kusburnu-cayi') },
      { name: 'Böğürtlen', image: '/urunler/bogurtlen-bitki-cayi.webp', href: shopProduct('bogurtlen-cayi') },
      { name: 'Rezene', image: '/urunler/rezene-bitki-cayi.webp', href: shopProduct('rezene-cayi') },
    ],
  },
}
