import { useEffect, useState } from 'react'

const links = [
  { href: 'https://esteacay.com/kurumsal/', label: 'Hakkımızda', external: true },
  { href: 'https://esteacay.com/cayin-yolculugu/', label: 'Çayın Yolculuğu', external: true },
  { href: 'https://market.esteacay.com/u/', label: 'Çaylarımız', external: false },
  { href: 'https://market.esteacay.com/iletisim/', label: 'İletişim', external: false },
  { href: 'https://esteacay.com/blog/', label: 'Blog', external: true },
] as const

export default function Navbar() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header id="main-nav" className="fixed inset-x-0 top-0 z-50 bg-transparent text-cream">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:h-[5.5rem] sm:px-8">
        <a
          href="https://market.esteacay.com/"
          className="flex shrink-0 items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          aria-label="Es Çay ana sayfa"
        >
          <img
            src="/logo.png"
            alt="Es tea Çay"
            width={180}
            height={60}
            className="h-14 w-auto sm:h-16"
          />
        </a>

        <nav className="hidden md:block" aria-label="Ana menü">
          <ul className="flex items-center gap-1 lg:gap-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="rounded-sm px-3 py-2 text-[0.82rem] font-semibold tracking-[0.1em] text-cream uppercase transition-colors hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-transparent lg:px-3.5 lg:text-[0.88rem]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          aria-expanded={open}
          aria-controls="mobil-menu"
          aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex h-4 w-6 flex-col justify-between" aria-hidden="true">
            <span className="h-[2px] w-full bg-cream" />
            <span className="h-[2px] w-full bg-cream" />
            <span className="h-[2px] w-full bg-cream" />
          </span>
        </button>
      </div>

      <nav
        id="mobil-menu"
        className={`md:hidden ${open ? 'block' : 'hidden'}`}
        aria-label="Mobil menü"
      >
        <ul className="space-y-1 bg-ink/80 px-4 pb-5 pt-1 backdrop-blur-sm">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="block rounded-sm px-3 py-3 text-[0.92rem] font-semibold tracking-[0.1em] text-cream uppercase hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
