'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { navLinks, shopProductsUrl } from '@/lib/site'
import BlobBg from '@/components/ui/BlobBg'
import { Glass, doodles } from '@/components/ui/Doodles'

/* The header only ever sits over the hero video (it fades out on scroll), so every
   link reads in cream: an outlined cream pill that fills cream on hover. */
const pillClass =
  'inline-flex min-h-10 items-center gap-2 rounded-full border border-cream/45 px-4 text-[0.92rem] font-semibold whitespace-nowrap text-cream transition-colors duration-200 hover:border-cream hover:bg-cream hover:text-ink focus:outline-none focus-visible:border-cream focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

/* Mobile rows carry the same coloured discs as the manifesto facts. */
const discs = ['bg-leaf text-ink', 'bg-gold text-ink', 'bg-brand text-cream', 'bg-garden text-cream']

export default function Navbar() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header
      id="main-nav"
      className={`absolute inset-x-0 top-0 z-50 transition-colors duration-300 ${open ? 'bg-linen text-ink' : 'bg-transparent text-cream'}`}
    >
      <div className="relative z-10 mx-auto flex h-20 max-w-[90rem] items-center justify-between px-5 sm:h-[5.5rem] sm:px-8 lg:px-10">
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label="Esçay ana sayfa"
          onClick={() => setOpen(false)}
        >
          <Image
            src="/logo.png"
            alt="Esçay"
            width={180}
            height={96}
            priority
            className="h-12 w-auto sm:h-14"
          />
        </Link>

        <nav className="hidden md:block" aria-label="Ana menü">
          <ul className="flex items-center gap-2">
            {navLinks.map((link) => {
              const Icon = doodles[link.icon ?? 'sprig']
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={pillClass}
                  >
                    <Icon className="hidden h-[18px] w-[18px] shrink-0 lg:block" />
                    {link.label}
                  </a>
                </li>
              )
            })}
            <li className="ml-2">
              <a
                href={shopProductsUrl}
                className="group relative isolate inline-flex min-h-10 items-center rounded-full px-5 text-[0.74rem] font-bold tracking-[0.12em] text-ink uppercase transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                <BlobBg className="fill-gold group-hover:fill-cream" />
                <span className="blob-label">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Glass className="h-5 w-5 shrink-0" />
                    Mağaza
                  </span>
                </span>
              </a>
            </li>
          </ul>
        </nav>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-cream text-ink transition-colors md:hidden hover:bg-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          aria-expanded={open}
          aria-controls="mobil-menu"
          aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex h-[14px] w-5 flex-col justify-between" aria-hidden="true">
            <span className={`h-[2px] w-full rounded-full bg-current transition-transform ${open ? 'translate-y-[6px] rotate-45' : ''}`} />
            <span className={`h-[2px] w-full rounded-full bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`h-[2px] w-full rounded-full bg-current transition-transform ${open ? '-translate-y-[6px] -rotate-45' : ''}`} />
          </span>
        </button>
      </div>

      <nav
        id="mobil-menu"
        className={`fixed inset-0 z-0 bg-linen pt-24 transition-opacity duration-200 md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-label="Mobil menü"
        aria-hidden={!open}
      >
        <ul className="flex h-full flex-col px-6 pb-10">
          {navLinks.map((link, i) => {
            const Icon = doodles[link.icon ?? 'sprig']
            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="group flex items-center gap-5 py-3 text-ink focus:outline-none focus-visible:text-brand"
                  onClick={() => setOpen(false)}
                  tabIndex={open ? 0 : -1}
                >
                  <span
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105 ${discs[i % discs.length]}`}
                  >
                    <Icon className="h-9 w-9" />
                  </span>
                  <span className="headline text-[2.2rem] transition-colors group-hover:text-brand">{link.label}</span>
                </a>
              </li>
            )
          })}
          <li className="mt-auto pt-8">
            <a
              href={shopProductsUrl}
              className="group relative isolate inline-flex min-h-14 w-full items-center justify-center rounded-full px-6 text-[0.84rem] font-bold tracking-[0.14em] text-ink uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-linen"
              tabIndex={open ? 0 : -1}
            >
              <BlobBg className="fill-gold" />
              <span className="blob-label">
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Glass className="h-6 w-6" />
                  Mağazaya git
                </span>
              </span>
            </a>
          </li>
        </ul>
      </nav>
    </header>
  )
}
