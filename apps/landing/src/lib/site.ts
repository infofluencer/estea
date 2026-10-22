export const shopUrl = (process.env.NEXT_PUBLIC_SHOP_URL ?? 'http://localhost:3021').replace(/\/+$/, '')

export const shopProductsUrl = `${shopUrl}/urunler`

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
  { href: '#tarihce', label: 'Tarihçe', icon: 'teapot' },
  { href: '#blog', label: 'Blog', icon: 'quill' },
]

export const corporateLinks: NavLink[] = [
  { href: 'https://esteacay.com/kurumsal/', label: 'Hakkımızda', external: true },
  { href: 'https://esteacay.com/cayin-yolculugu/', label: 'Çayın Yolculuğu', external: true },
  { href: 'https://esteacay.com/blog/', label: 'Blog', external: true },
  { href: 'https://market.esteacay.com/iletisim/', label: 'İletişim', external: true },
]
