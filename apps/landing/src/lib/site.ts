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

/** Kurumsal sayfalar landing'in kendi bölümleridir (mağaza da buraya bağlanır). */
export const corporateLinks: NavLink[] = [
  { href: '#hakkimizda', label: 'Hakkımızda' },
  { href: '#yolculuk', label: 'Çayın Yolculuğu' },
  { href: '#sss', label: 'Sıkça sorulan sorular' },
  { href: '#iletisim', label: 'İletişim' },
]

/** Mağaza tarafındaki yardım/yasal sayfalar (escay-storefront yolları). */
export const shopLinks: NavLink[] = [
  { href: shopUrl, label: 'Online mağaza', external: true },
  { href: shopProductsUrl, label: 'Tüm çaylar', external: true },
  { href: `${shopUrl}/order-tracking`, label: 'Sipariş takibi', external: true },
  { href: `${shopUrl}/iade-ve-geri-odeme-politikasi`, label: 'İade ve geri ödeme', external: true },
]

export const legalLinks: NavLink[] = [
  { href: `${shopUrl}/gizlilik-politikasi`, label: 'Gizlilik ve KVKK', external: true },
  { href: `${shopUrl}/cerez-politikasi`, label: 'Çerez politikası', external: true },
  { href: `${shopUrl}/legal/mesafeli-satis-sozlesmesi`, label: 'Mesafeli satış sözleşmesi', external: true },
]
