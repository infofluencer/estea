export const shopUrl = (process.env.NEXT_PUBLIC_SHOP_URL ?? 'http://localhost:3025').replace(/\/+$/, '')

export const shopProductsUrl = `${shopUrl}/urun-kategori`

/** Doodle shown next to the link; keys map to `@/components/ui/Doodles`. */
export type NavIcon = 'sprig' | 'hills' | 'teapot' | 'quill' | 'glass'

export type NavLink = {
  href: string
  label: string
  icon?: NavIcon
  external?: boolean
}

/** In-page navigation for the landing. */
export const navLinks: NavLink[] = [
  { href: '#harmanlar', label: 'Harmanlar', icon: 'sprig' },
  { href: '#yolculuk', label: 'Yolculuk', icon: 'hills' },
  { href: '#blog', label: 'Blog', icon: 'quill' },
]

export const corporateLinks: NavLink[] = [
  { href: 'https://esteacay.com/kurumsal/', label: 'Hakkımızda', external: true },
  { href: 'https://esteacay.com/cayin-yolculugu/', label: 'Çayın Yolculuğu', external: true },
  { href: 'https://esteacay.com/blog/', label: 'Blog', external: true },
  { href: 'https://market.esteacay.com/iletisim/', label: 'İletişim', external: true },
]

/** Mağaza tarafındaki yardım/yasal sayfalar (escay-storefront yolları). */
export const shopLinks: NavLink[] = [
  { href: shopProductsUrl, label: 'Çaylar', external: true },
  { href: `${shopUrl}/order-tracking`, label: 'Sipariş takibi', external: true },
  { href: `${shopUrl}/faq`, label: 'Sıkça sorulan sorular', external: true },
  { href: `${shopUrl}/iade-ve-geri-odeme-politikasi`, label: 'İade ve geri ödeme', external: true },
]

export const legalLinks: NavLink[] = [
  { href: `${shopUrl}/gizlilik-politikasi`, label: 'Gizlilik ve KVKK', external: true },
  { href: `${shopUrl}/cerez-politikasi`, label: 'Çerez politikası', external: true },
  { href: `${shopUrl}/legal/mesafeli-satis-sozlesmesi`, label: 'Mesafeli satış sözleşmesi', external: true },
]
