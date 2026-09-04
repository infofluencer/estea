import { Link } from 'react-router-dom'
import { useId, useState } from 'react'
import { useShopBag } from './ShopBagContext'

const navLinks = [
  { href: '/urunler', label: 'Çaylarımız', to: '/urunler' as const },
  { href: 'https://esteacay.com/cayin-yolculugu/', label: 'Çayın Yolculuğu', external: true },
  { href: 'https://esteacay.com/kurumsal/', label: 'Hakkımızda', external: true },
  { href: 'https://esteacay.com/blog/', label: 'Blog', external: true },
  { href: 'https://esteacay.com/iletisim/', label: 'İletişim', external: true },
]

export default function ShopHeader() {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { cartCount, favoriteCount } = useShopBag()

  return (
    <header className="sticky top-0 z-50 bg-white/90 text-ink backdrop-blur-md">
      <div className="bg-garden px-4 py-1.5 text-center text-[0.65rem] font-medium tracking-[0.18em] text-cream uppercase sm:text-[0.7rem]">
        Karadeniz&apos;den sofranıza · Ücretsiz kargo 750₺ üzeri
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:h-[4.5rem] sm:px-8 lg:gap-10">
        <Link to="/" className="shrink-0" aria-label="Es Çay ana sayfa">
          <img
            src="/logo.png"
            alt="Es tea Çay"
            width={140}
            height={48}
            className="h-9 w-auto sm:h-10"
          />
        </Link>

        <nav className="hidden flex-1 lg:block" aria-label="Mağaza menüsü">
          <ul className="flex items-center gap-7">
            {navLinks.map((link) => (
              <li key={link.label}>
                {'to' in link && link.to ? (
                  <Link
                    to={link.to}
                    className="font-display text-[0.95rem] font-bold tracking-wider text-ink uppercase transition-colors hover:text-brand"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-[0.95rem] font-bold tracking-wider text-ink uppercase transition-colors hover:text-brand"
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div
            className={`flex items-center overflow-hidden transition-all duration-300 ${
              searchOpen ? 'w-40 sm:w-52' : 'w-10'
            }`}
          >
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-ink/5"
              aria-label="Ara"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((o) => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
            </button>
            {searchOpen ? (
              <form role="search" className="min-w-0 flex-1" onSubmit={(e) => e.preventDefault()}>
                <label htmlFor={searchId} className="sr-only">
                  Ürün ara
                </label>
                <input
                  id={searchId}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ara..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-ink/35"
                />
              </form>
            ) : null}
          </div>

          <button
            type="button"
            className="relative hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-ink/5 sm:inline-flex"
            aria-label="Favoriler"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={favoriteCount > 0 ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              className={favoriteCount > 0 ? 'text-brand' : undefined}
              aria-hidden
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {favoriteCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-1 text-[0.55rem] font-bold text-cream">
                {favoriteCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-ink/5"
            aria-label="Hesabım"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 19.5c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-ink/5"
            aria-label="Sepet"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M6 7h12l-1 12H7L6 7z" />
              <path d="M9 7a3 3 0 0 1 6 0" strokeLinecap="round" />
            </svg>
            <span className="absolute top-1.5 right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand px-1 text-[0.55rem] font-bold text-cream">
              {cartCount}
            </span>
          </button>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-ink/5 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="shop-mobile-nav"
            aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="shop-mobile-nav"
          className="border-t border-ink/5 px-5 py-5 lg:hidden"
          aria-label="Mobil menü"
        >
          <ul className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <li key={link.label}>
                {'to' in link && link.to ? (
                  <Link
                    to={link.to}
                    className="font-display text-lg font-bold tracking-wider uppercase"
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-lg font-bold tracking-wider uppercase"
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
